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

  const workDir = path.join(process.cwd(), 'tests');
  core.info(`Working directory: ${workDir}`);
  const repoUrl = `${serverUrl}/${owner}/${repo}.git`;
  const authRepoUrl = repoUrl.replace('https://', `https://x-access-token:${token}@`);
  const gitOptions = {
    silent: false, // Set to false to capture Git output for debugging
    env: {
      ...process.env,
      //GITHUB_TOKEN: token,
      GIT_TERMINAL_PROMPT: '0', // Disables interactive prompts
      GCM_INTERACTIVE: 'never'  // Disables Git Credential Manager popups
    },
    listeners: {
      stdout: (data: Buffer) => core.info(data.toString().trim()),
      stderr: (data: Buffer) => core.error(data.toString().trim())
    }
  };

  if (fs.existsSync(workDir)) {
    core.info('Directory exists, updating remote URL and pulling updates...');
    // Update the remote URL to use the authenticated URL
    const setUrlExitCode = await exec.exec('git', ['-C', workDir, 'remote', 'set-url', 'origin', authRepoUrl], {
      ...gitOptions,
      cwd: workDir,
      ignoreReturnCode: true
    });
    if (setUrlExitCode !== 0) {
      throw new Error(`git remote set-url failed with exit code ${setUrlExitCode}`);
    }
    const pullExitCode = await exec.exec('git', ['-C', workDir, 'pull'], {
      ...gitOptions,
      cwd: workDir,
      ignoreReturnCode: true // Prevents throwing on non-zero exit
    });
    if (pullExitCode !== 0) {
      throw new Error(`git pull failed with exit code ${pullExitCode}`);
    }
  } else {
    core.info('Cloning repository...');
    const cloneExitCode = await exec.exec('git', ['clone', authRepoUrl, workDir], {
      ...gitOptions,
      ignoreReturnCode: true // Prevents throwing on non-zero exit
    });
    if (cloneExitCode !== 0) {
      throw new Error(`git clone failed with exit code ${cloneExitCode}`);
    }
    core.info('Repository checked out successfully.');
  }
  core.info('END checkoutRepo ...');
  return workDir;
}