import * as core from '@actions/core';
import * as git from 'isomorphic-git';
import * as fs from 'fs';
import * as path from 'path';
import * as Diff from 'diff';
import { Logger } from '../utils/logger';

const _logger: Logger = new Logger('ScmChangesWrapper');
const HEAD = 'HEAD'; // Compare to latest commit

export interface ScmAffectedFileWrapper {
  newPath: string;
  oldPath: string | null;
  changeType: 'ADD' | 'DELETE' | 'EDIT';
  oldId: string;
  newId: string;
}

interface DiffEntry {
  from: string;
  to: string;
  fromId: string | null;
  toId: string | null;
}

export default class ScmChangesWrapper {
  public static async getScmChanges(dir: string, oldCommit: string): Promise<ScmAffectedFileWrapper[]> {
    return wrapScmChanges(dir, oldCommit);
  }
}
async function wrapScmChanges(dir: string, oldCommit: string): Promise<ScmAffectedFileWrapper[]> {
  const affectedFiles: ScmAffectedFileWrapper[] = [];
  
  try {
    // Get diff between old and new commits
    const diffs = await getDiffEntries(dir, oldCommit); // Compare to latest commit

    // Rename detection settings
    const renameThreshold = 0.5; // 50% similarity for rename detection
    const potentialRenames: { oldPath: string; newPath: string; similarity: number }[] = [];

    // First pass: Identify adds, deletes, and potential renames/modifies
    for (const diff of diffs) {
      if (diff.from === 'dev/null' && diff.to !== 'dev/null') {
        // ADD
        affectedFiles.push({
          newPath: diff.to,
          oldPath: null,
          changeType: 'ADD',
          oldId: '', // No old ID for ADD
          newId: diff.toId || '',
        });
      } else if (diff.to === 'dev/null' && diff.from !== 'dev/null') {
        // DELETE
        affectedFiles.push({
          newPath: diff.from,
          oldPath: diff.from,
          changeType: 'DELETE',
          oldId: diff.fromId || '',
          newId: '', // No new ID for DELETE
        });
      } else {
        // Potential MODIFY or RENAME
        const similarity = await calculateSimilarity(dir, oldCommit, diff.from, diff.to);
        if (similarity >= renameThreshold) {
          potentialRenames.push({ oldPath: diff.from, newPath: diff.to, similarity });
        } else {
          affectedFiles.push({
            newPath: diff.to,
            oldPath: diff.from,
            changeType: 'EDIT',
            oldId: diff.fromId || '',
            newId: diff.toId || '',
          });
        }
      }
    }

    // Process renames
    for (const rename of potentialRenames) {
      affectedFiles.push({
        newPath: rename.newPath,
        oldPath: rename.oldPath,
        changeType: 'EDIT', // RENAME treated as EDIT with old/new paths
        oldId: (await git.resolveRef({ fs, dir, ref: oldCommit })) || '',
        newId: (await git.resolveRef({ fs, dir, ref: HEAD })) || '',
      });
    }

    return affectedFiles;
  } catch (error) {
    throw new Error(`Failed to process SCM changes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Get diff entries between two commits
async function getDiffEntries(dir: string, oldCommit: string): Promise<DiffEntry[]> {
  const gitdir = path.join(dir, '.git');
  _logger.debug('Starting getDiffEntries with:', { dir, gitdir, oldCommit, HEAD });

  const results = await git.walk({
    fs,
    dir,
    gitdir,
    trees: [
      git.TREE({ ref: oldCommit }),
      git.TREE({ ref: HEAD }),
    ],
    map: async function (filepath, [oldEntry, newEntry]) {
      const from = oldEntry ? filepath : 'dev/null';
      const to = newEntry ? filepath : 'dev/null';
      const fromId = oldEntry ? await oldEntry.oid() : null;
      const toId = newEntry ? await newEntry.oid() : null;

      // Return null for no change or non-existent in both
      if (fromId === toId && fromId !== null) {
        return null;
      }
      if (from === 'dev/null' && to === 'dev/null') {
        //_logger.debug(`Skipping non-existent: ${filepath}`);
        return null;
      }

      return { from, to, fromId, toId };
    },
    reduce: async function (parent, children) {
      let result: DiffEntry[] = [];

      // Include parent if it’s a DiffEntry and not the root "."
      if (parent && 'from' in parent && parent.from !== '.' && parent.to !== '.') {
        result.push(parent);
      }

      // Process children, excluding the root "."
      for (const child of children) {
        if (child && 'from' in child) {
          if (child.from !== '.' && child.to !== '.') {
            result.push(child); // Include non-root DiffEntry
          }
        } else if (Array.isArray(child)) {
          // Flatten nested arrays, excluding root entries
          result = result.concat(
            child.filter((item): item is DiffEntry => 
              item !== null && 'from' in item && item.from !== '.' && item.to !== '.'
            )
          );
        }
      }

      return result;
    }
  }) ?? [];

  //_logger.debug('Final results:', results);

  if (results.length === 0) {
    console.warn('No differences found.');
  }

  return results;
}

// Calculate similarity using the diff library
async function calculateSimilarity(dir: string, oldCommit: string, oldPath: string, newPath: string ): Promise<number> {
  try {
    const oldContent = await git.readBlob({ fs, dir, gitdir: path.join(dir, '.git'), oid: oldCommit, filepath: oldPath });
    const newContent = await git.readBlob({ fs, dir, gitdir: path.join(dir, '.git'), oid: HEAD, filepath: newPath });

    // Convert Uint8Array to UTF-8 string using Buffer
    const oldStr = Buffer.from(oldContent.blob).toString('utf8');
    const newStr = Buffer.from(newContent.blob).toString('utf8');

    // Use diff library to compute line-by-line differences
    const differences = Diff.diffLines(oldStr, newStr, { ignoreWhitespace: true });
    let unchangedLines = 0;
    let totalLines = 0;

    for (const part of differences) {
      const lines = part.value.split('\n').length - 1; // Count lines (subtract 1 for trailing newline)
      totalLines += lines;
      if (!part.added && !part.removed) {
        unchangedLines += lines; // Count unchanged lines
      }
    }

    // Calculate similarity as the ratio of unchanged lines to total lines
    return totalLines > 0 ? unchangedLines / totalLines : 0;
  } catch (error) {
    core.warning(`Failed to compute similarity for ${oldPath} -> ${newPath}: ${error}`);
    return 0; // Default to no similarity if content can't be read
  }
}
