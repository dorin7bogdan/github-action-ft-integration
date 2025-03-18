/*
 * Copyright 2016-2025 Open Text.
 *
 * The only warranties for products and services of Open Text and
 * its affiliates and licensors (“Open Text”) are as may be set forth
 * in the express warranty statements accompanying such products and services.
 * Nothing herein should be construed as constituting an additional warranty.
 * Open Text shall not be liable for technical or editorial errors or
 * omissions contained herein. The information contained herein is subject
 * to change without notice.
 *
 * Except as specifically indicated otherwise, this document contains
 * confidential information and a valid license is required for possession,
 * use or copying. If this work is provided to the U.S. Government,
 * consistent with FAR 12.211 and 12.212, Commercial Computer Software,
 * Computer Software Documentation, and Technical Data for Commercial Items are
 * licensed to the U.S. Government under vendor's standard commercial license.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { UftoTestType } from '../dto/ft/UftoTestType';
import { context } from '@actions/github';
import * as git from 'isomorphic-git';

// File to store the string (hidden file to avoid cluttering the repo)
const STORAGE_FILE = path.join(process.cwd(), '.synced-commit-sha.txt');
const ACTIONS_XML = 'actions.xml';
const _TSP = '.tsp';
const _ST = '.st';
const UTF8 = 'utf8';

async function getHeadCommitSha(dir: string): Promise<string> {
  return context.sha ?? await git.resolveRef({ fs, dir, ref: "HEAD" });
}

/**
 * Stores a string in the working directory
 * @param data The string to store
 */
async function saveSyncedCommit(data: string): Promise<void> {
    if (isBlank(data)) 
      return;
    try {
        await fs.writeFile(STORAGE_FILE, data.trim(), UTF8);
        console.log(`Saved string to ${STORAGE_FILE}`);
    } catch (error) {
        throw new Error(`Failed to save string: ${(error as Error).message}`);
    }
}

/**
 * Retrieves the stored string from the working directory
 * @returns The stored string, or undefined if the file doesn't exist
 */
async function getSyncedCommit(): Promise<string | undefined> {
    try {
        const data = await fs.readFile(STORAGE_FILE, UTF8);
        console.log(`Loaded string from ${STORAGE_FILE}`);
        return data.trim();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // File doesn't exist yet, return undefined
            return undefined;
        }
        throw new Error(`Failed to load string: ${(error as Error).message}`);
    }
}

function isTestMainFile(file: string): boolean {
  const f = file.toLowerCase();
  return f.endsWith(_TSP) || f.endsWith(_ST) || f === ACTIONS_XML;
}

function getParentFolderFullPath(fullFilePath: string): string {
  const resolvedPath = path.resolve(fullFilePath);
  return path.dirname(resolvedPath);
}

function getTestType(filePath: string): UftoTestType {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === _ST || filePath == ACTIONS_XML) {
      return UftoTestType.API;
    } else if (ext === _TSP) {
      return UftoTestType.GUI;
    } 

  return UftoTestType.None;
}

/**
 * Checks if a string is blank, empty or contains only whitespace.
 * @param str The string to check.
 * @returns True if the string is null, undefined, empty, or contains only whitespace.
 */
function isBlank(str: string | null | undefined): boolean {
  return str === null || str === undefined || str.trim().length === 0;
}

const extractWorkflowFileName = (workflowPath: string): string => {
  return path.basename(workflowPath);
};

const isVersionGreaterOrEqual = (
  version1: string,
  version2: string
): boolean => {
  if (!version1 || !version2) {
    return false;
  }

  const version1Array = version1.split('.');
  const version2Array = version2.split('.');

  for (let i = 0; i < version1Array.length && i < version2Array.length; i++) {
    const version1Part = parseInt(version1Array[i]);
    const version2Part = parseInt(version2Array[i]);

    if (version1Part !== version2Part) {
      return version1Part > version2Part;
    }
  }

  return version1Array.length >= version2Array.length;
};

const sleep = async (milis: number): Promise<void> => {
  return new Promise<void>(resolve => {
    setTimeout(resolve, milis);
  });
};

export { getHeadCommitSha, isBlank, isTestMainFile, getTestType, getParentFolderFullPath, saveSyncedCommit, getSyncedCommit, extractWorkflowFileName, isVersionGreaterOrEqual, sleep };
