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
import Discovery from './discovery/Discovery';
import { ToolType } from './dto/ft/ToolType';

const _logger: Logger = new Logger('eventHandler');
const UFT = 'uft';
const TESTING_TOOL_TYPE = 'testingToolType';

export const handleCurrentEvent = async (): Promise<void> => {
  core.info('BEGIN handleEvent ...');

  const event: ActionsEvent = context.payload;
  const eventName = context.eventName;

  if (event) {
    core.debug(`event = ${JSON.stringify(event)}`);
  } else {
    core.debug('event is null or undefined');
  }

  core.info(`eventType = ${event?.action || eventName}`);
  const eventType = getEventType(event?.action || eventName);
  if (eventType === ActionsEventType.UNKNOWN_EVENT) {
    core.info('Unknown event type');
    return;
  }
  const serverUrl = context.serverUrl;
  const { owner, repo } = context.repo;
  const repoUrl = `${serverUrl}/${owner}/${repo}.git`;
/*     const repoOwner = event.repository?.owner.login;
    const repoName = event.repository?.name;
    if (!repoOwner || !repoName) {
      throw new Error('Event should contain repository data!');
    }
    repoUrl = `${serverUrl}/${repoOwner}/${repoName}.git`; */
  if (!repoUrl) {
    throw new Error('Event should contain repository data!');
  }
/*  const workflowFilePath = event.workflow?.path;
  const workflowName = event.workflow?.name;
  const workflowRunId = event.workflow_run?.id;
  const branchName = event.workflow_run?.head_branch;*/

  core.info(`Current repository URL: ${repoUrl}`);

  switch (eventType) {
    case ActionsEventType.WORKFLOW_RUN:
      let toolType = core.getInput(TESTING_TOOL_TYPE) ?? UFT;
      if (toolType.trim() == "") {
        toolType = UFT;
      }
      const discovery = new Discovery(ToolType.fromType(toolType));
      await discovery.startFullScanning(repoUrl);
      const tests = discovery.getTests();
      const scmResxFiles = discovery.getScmResxFiles();

      _logger.debug(`Tests: ${tests.length}`, tests);
      for (let t of tests) {
        _logger.debug(`Test: ${t.name}, type = ${t.uftOneTestType}`);
        _logger.debug(` Actions:`);
        for (let a of t.actions) {
          _logger.debug(`  ${a.name}`);
          if (a.parameters) {
            for (let p of a.parameters) {
              _logger.debug(`   Param: ${p.name} - ${p.direction}`);
            }
          }
        }
      }
      _logger.debug(`Resource files: ${scmResxFiles.length}`, scmResxFiles);

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

