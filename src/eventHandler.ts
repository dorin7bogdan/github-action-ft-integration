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

import OctaneClient from './client/octaneClient';
import { getConfig } from './config/config';
import ActionsEvent from './dto/github/ActionsEvent';
import ActionsEventType from './dto/github/ActionsEventType';
import { getEventType } from './service/ciEventsService';
import { Logger } from './utils/logger';
import { context } from '@actions/github';
import {
  buildExecutorCiId,
  buildExecutorName,
  getOrCreateExecutor,
  sendExecutorFinishEvent,
  sendExecutorStartEvent
} from './service/executorService';
import CiParameter from './dto/octane/events/CiParameter';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as fs from 'fs';
import * as path from 'path';

const LOGGER: Logger = new Logger('eventHandler');

export const handleCurrentEvent = async (): Promise<void> => {
  core.info('BEGIN handleEvent ...');

  const event: ActionsEvent = context.payload;
  const eventName = context.eventName;

  if (event) {
    core.info(`event = ${JSON.stringify(event)}`);
  } else {
    core.info('event is null or undefined');
  }

  core.info(`eventType = ${event?.action || eventName}`);
  const eventType = getEventType(event?.action || eventName);
  if (eventType === ActionsEventType.UNKNOWN_EVENT) {
    core.info('Unknown event type');
    return;
  }

  const repoOwner = event.repository?.owner.login;
  const repoName = event.repository?.name;
  const workflowFilePath = event.workflow?.path;
  const workflowName = event.workflow?.name;
  const workflowRunId = event.workflow_run?.id;
  const branchName = event.workflow_run?.head_branch;

  if (!repoOwner || !repoName) {
    throw new Error('Event should contain repository data!');
  }

  const serverUrl = context.serverUrl;
  const repoUrl = `${serverUrl}/${repoOwner}/${repoName}.git`;
  core.info(`Current repository URL: ${repoUrl}`);

  switch (eventType) {
    case ActionsEventType.WORKFLOW_RUN:
      await startFullScanning(repoUrl);
      break;
    case ActionsEventType.PUSH:
      core.info('WORKFLOW_STARTED...');
      break;
    case ActionsEventType.WORKFLOW_FINISHED:
      core.info('WORKFLOW_FINISHED.');
      break;
    default:
      core.info(`default -> eventType = ${eventType}`);
      break;
  }

  core.info('END handleEvent ...');

};

const getCiServerInstanceId = (
  repositoryOwner: string,
  useOldCiServer: boolean
) => {
  if (useOldCiServer) {
    return `GHA/${getConfig().octaneSharedSpace}`;
  } else {
    return `GHA-${repositoryOwner}`;
  }
};

const getCiServerName = async (
  repositoryOwner: string,
  useOldCiServer: boolean
) => {
  if (useOldCiServer) {
    const sharedSpaceName = await OctaneClient.getSharedSpaceName(
      getConfig().octaneSharedSpace
    );
    return `GHA/${sharedSpaceName}`;
  } else {
    return `GHA-${repositoryOwner}`;
  }
};

const hasExecutorParameters = (
  configParameters: CiParameter[] | undefined
): boolean => {
  if (!configParameters) {
    return false;
  }

  const requiredParameters = ['suiteRunId', 'executionId', 'testsToRun'];
  const foundNames = new Set(configParameters.map(param => param.name));

  return requiredParameters.every(name => foundNames.has(name));
};

async function startFullScanning (repoUrl: string | undefined): Promise<void> {
  core.info('BEGIN startFullScanning ...');
  if (!repoUrl || repoUrl?.trim() === '') {
    throw new Error('Repository URL is required!');
  }
  const workDir = await checkoutRepo();
  core.info('END startFullScanning ...');
}

async function checkoutRepo(): Promise<string> {
  core.info('BEGIN checkoutRepo ...');
  const token = core.getInput('githubToken', { required: true });
  const { owner, repo } = context.repo;
  const serverUrl = context.serverUrl;

  core.info(`Working directory: ${process.cwd() }`);
  const workDir = process.cwd();
  const repoUrl = `${serverUrl}/${owner}/${repo}.git`;
  const authRepoUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`);
  core.debug(`Expected authRepoUrl: ${authRepoUrl}`);

  // Filter process.env to exclude undefined values
  const filteredEnv: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      filteredEnv[key] = value;
    }
  }

  // Configure Git options with common properties
  const gitOptions = {
    cwd: workDir,          // Common working directory
    ignoreReturnCode: true, // Ignore non-zero exit codes by default
    silent: false,         // Keep false for debugging
    env: filteredEnv,      // Use filtered env with only string values
    listeners: {          // Common listeners for all Git commands
      stderr: (data: Buffer) => core.debug(data.toString().trim())
    }
  };

  // Check if _work\ufto-tests is a Git repository
  const gitDir = path.join(workDir, '.git');
  if (fs.existsSync(gitDir)) {
    core.info('Working directory is a Git repo, checking remote URL...');

    // Get the current remote URL with specific stdout capture
    let currentRemoteUrl = '';
    const getUrlOutput: string[] = [];
    const getUrlExitCode = await exec.exec('git', ['remote', 'get-url', 'origin'], {
      ...gitOptions,
      listeners: {
        ...gitOptions.listeners,
        stdout: (data: Buffer) => getUrlOutput.push(data.toString().trim())
      }
    });
    if (getUrlExitCode === 0) {
      currentRemoteUrl = getUrlOutput.join('').trim();
      core.debug(`Current remote URL: ${currentRemoteUrl}`);
    } else {
      core.warning('Failed to get current remote URL, proceeding with set-url');
    }

    // Compare current URL with base repoUrl (ignoring token)
    if (currentRemoteUrl && currentRemoteUrl.includes(repoUrl)) {
      core.info('Remote URL base matches, updating with current token...');
      const setUrlExitCode = await exec.exec('git', ['remote', 'set-url', 'origin', authRepoUrl], gitOptions);
      if (setUrlExitCode !== 0) {
        throw new Error(`git remote set-url failed with exit code ${setUrlExitCode}`);
      }
    } else {
      core.info('Remote URL does not match, setting to authenticated URL...');
      const setUrlExitCode = await exec.exec('git', ['remote', 'set-url', 'origin', authRepoUrl], gitOptions);
      if (setUrlExitCode !== 0) {
        throw new Error(`git remote set-url failed with exit code ${setUrlExitCode}`);
      }
    }

    // Perform the pull
    core.info('Pulling updates...');
    const pullExitCode = await exec.exec('git', ['pull'], gitOptions);
    if (pullExitCode !== 0) {
      throw new Error(`git pull failed with exit code ${pullExitCode}`);
    }
  } else {
    core.info('Cloning repository directly into _work\\ufto-tests...');
    const cloneExitCode = await exec.exec('git', ['clone', authRepoUrl, '.'], gitOptions);
    if (cloneExitCode !== 0) {
      throw new Error(`git clone failed with exit code ${cloneExitCode}`);
    }
  }
  core.info('END checkoutRepo ...');
  return workDir;
}