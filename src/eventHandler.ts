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
import { saveSyncedCommit } from './utils/utils';
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
import { UftoParamDirection } from './dto/ft/UftoParamDirection';
import { OctaneStatus } from './dto/ft/OctaneStatus';

const _logger: Logger = new Logger('eventHandler');
const UFT = 'uft';
const MBT = 'mbt';
const TESTING_TOOL_TYPE = 'testingToolType';

export const handleCurrentEvent = async (): Promise<void> => {
  _logger.info('BEGIN handleEvent ...');

  const event: ActionsEvent = context.payload;
  const eventName = context.eventName;

/*   if (event) {
    _logger.debug(`event = ${JSON.stringify(event)}`);
  } else {
    _logger.debug('event is null or undefined');
  } */

  const eventType = getEventType(event?.action || eventName);
  if (eventType === ActionsEventType.UNKNOWN_EVENT) {
    _logger.info('Unknown event type');
    return;
  }
  _logger.info(`eventType = ${event?.action || eventName}`);

  const serverUrl = context.serverUrl;
  const { owner, repo } = context.repo;
  const repoUrl = `${serverUrl}/${owner}/${repo}.git`;
  if (!repoUrl) {
    throw new Error('Event should contain repository data!');
  }
/*  const workflowFilePath = event.workflow?.path;
  const workflowName = event.workflow?.name;
  const workflowRunId = event.workflow_run?.id;
  const branchName = event.workflow_run?.head_branch;*/

  _logger.info(`Current repository URL: ${repoUrl}`);

  const workDir = process.cwd(); //.env.GITHUB_WORKSPACE || '.';

  _logger.info(`Working directory: ${workDir}`);
  let testingToolType = core.getInput(TESTING_TOOL_TYPE) ?? UFT;
  const toolType = (testingToolType.trim().toLowerCase() === MBT) ? ToolType.MBT : ToolType.UFT;
  _logger.info(`Testing tool type: ${toolType}`);
  const discovery = new Discovery(toolType, workDir);
  switch (eventType) {
    case ActionsEventType.WORKFLOW_RUN:
    case ActionsEventType.PUSH:
      const newCommitSha = await discovery.startScanning(repoUrl);
      const tests = discovery.getTests();
      const scmResxFiles = discovery.getScmResxFiles();

      if (_logger.isDebugEnabled()) {
        console.log(`Tests: ${tests.length}`);
        for (const t of tests) {
          console.log(`${t.name}, type = ${t.uftOneTestType}`);
          console.log(`  packageName: ${t.packageName}`);
          console.log(`  executable: ${t.executable}`);
          console.log(`  isMoved: ${t.isMoved}`);
          console.log(`  octaneStatus: ${OctaneStatus.getName(t.octaneStatus)}`);
          t.changeSetSrc && console.log(`  changeSetSrc: ${t.changeSetSrc}`);
          t.changeSetDst && console.log(`  changeSetDst: ${t.changeSetDst}`);
          if (t.actions && t.actions.length > 0) {
            console.log(`  Actions:`);
            for (const a of t.actions) {
              console.log(`    ${a.name}`);
              if (a.parameters && a.parameters.length > 0) {
                console.log(`      Parameters:`);
                for (const p of a.parameters) {
                  console.log(`        ${p.name} - ${UftoParamDirection.getName(p.direction)}`);
                }
              }
            }
          }
        }
        scmResxFiles?.length && console.log(`Resource files: ${scmResxFiles.length}`, scmResxFiles);
        for (const f of scmResxFiles) {
          console.log(`Resource file: ${f.name}`);
          console.log(`  oldName: ${f.oldName ?? ""}`);
          console.log(`  relativePath: ${f.relativePath}`);
          f.oldRelativePath ?? console.log(`  oldPath: ${f.oldRelativePath}`);
          console.log(`  changeType: ${OctaneStatus.getName(f.octaneStatus)}`);
          console.log(`  isMoved: ${f.isMoved ?? false}`);
          f.changeSetSrc && console.log(`  changeSetSrc: ${f.changeSetSrc}`);
          f.changeSetDst && console.log(`  changeSetDst: ${f.changeSetDst}`);
        }
      }

      // TODO sync the tests with Octane
      await saveSyncedCommit(newCommitSha);

      break;
    case ActionsEventType.WORKFLOW_FINISHED:
      _logger.info('WORKFLOW_FINISHED.');
      break;
    default:
      _logger.info(`default -> eventType = ${eventType}`);
      break;
  }

  _logger.info('END handleEvent ...');

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

