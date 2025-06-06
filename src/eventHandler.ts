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
import { saveSyncedCommit, getSyncedCommit, getSyncedTimestamp } from './utils/utils';
import { context } from '@actions/github';
import { getOrCreateTestRunner } from './service/executorService';
import Discovery from './discovery/Discovery';
import { UftoParamDirection } from './dto/ft/UftoParamDirection';
import { OctaneStatus } from './dto/ft/OctaneStatus';
import DiscoveryResult from './discovery/DiscoveryResult';
import { mbtPrepDiscoveryRes4Sync } from './discovery/mbtDiscoveryResultPreparer';
import { getOrCreateCiJob } from './service/ciJobService';
import { dispatchDiscoveryResults } from './discovery/mbtDiscoveryResultDispatcher';
import path from 'node:path';
import GitHubClient from './client/githubClient';

const _config = getConfig();
const _logger: Logger = new Logger('eventHandler');

export const handleCurrentEvent = async (): Promise<void> => {
  _logger.info('BEGIN handleEvent ...');

  const event: ActionsEvent = context.payload;
  const eventName = context.eventName;

  //event && _logger.debug(`event = ${JSON.stringify(event)}`);

  const eventType = getEventType(event?.action || eventName);
  if (eventType === ActionsEventType.UNKNOWN_EVENT) {
    _logger.info('Unknown event type');
    return;
  }
  _logger.info(`eventType = ${event?.action || eventName}`);

  let workflowPath: string | undefined;
  if (eventType === ActionsEventType.PUSH) {
    workflowPath = await GitHubClient.getWorkflowPath(event.after!);
  } else {
    workflowPath = (typeof event.workflow === 'string') ? event.workflow : event.workflow?.path;
  }

  //const workflowName = event.workflow?.name;
  //const workflowRunId = event.workflow_run?.id;
  const ref: string | undefined = event.ref;
  let branchName: string | undefined;

  if (ref && ref.startsWith('refs/heads/')) {
    branchName = ref.replace('refs/heads/', '');
  } else {
    branchName = event.workflow_run?.head_branch; // Fallback for other event types
  }

  if (!branchName) {
    //branchName = "main"; // Default branch name if not provided
    throw new Error('Could not determine branch name!');
  }

  if (!workflowPath) {
//    workflowPath = "gha-ft-integration.yml";
    throw new Error('Event should contain workflow file path!');
  }
  const workflowFilename = path.basename(workflowPath, path.extname(workflowPath));

  _logger.info(`Current repository URL: ${_config.repoUrl}`);

  const workDir = process.cwd(); //.env.GITHUB_WORKSPACE || '.';
  _logger.info(`Working directory: ${workDir}`);
  _logger.info(`Testing tool type: ${_config.testingTool.toUpperCase()}`);
  const discovery = new Discovery(workDir);
  switch (eventType) {
    case ActionsEventType.WORKFLOW_RUN:
    case ActionsEventType.PUSH:
      const oldCommit = await getSyncedCommit();
      if (oldCommit) {
        const minSyncInterval = _config.minSyncInterval;
        _logger.info(`minSyncInterval = ${minSyncInterval} seconds.`);
        const isIntervalElapsed = await isMinSyncIntervalElapsed(minSyncInterval);
        if (!isIntervalElapsed) {
          _logger.warn(`The minimum time interval of ${minSyncInterval} seconds has not yet elapsed since the last sync.`);
          return;
        }
      }
      const discoveryRes = await discovery.startScanning(oldCommit);
      const tests = discoveryRes.getAllTests();
      const scmResxFiles = discoveryRes.getScmResxFiles();

      if (_logger.isDebugEnabled()) {
        console.log(`Tests: ${tests.length}`);
        for (const t of tests) {
          console.log(`${t.name}, type = ${t.uftOneTestType}`);
          console.log(`  packageName: ${t.packageName}`);
          console.log(`  executable: ${t.executable}`);
          console.log(`  isMoved: ${t.isMoved ?? false}`);
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
      await doTestSync(discoveryRes, workflowFilename, branchName!);
      const newCommit = discoveryRes.getNewCommit();
      if (newCommit !== oldCommit) {
        await saveSyncedCommit(newCommit);
      }
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

const isMinSyncIntervalElapsed = async (minSyncInterval: number) => {
  const lastSyncedTimestamp = await getSyncedTimestamp();
  const currentTimestamp = new Date().getTime();
  const timeDiffSeconds = Math.floor((currentTimestamp - lastSyncedTimestamp) / 1000);
  return timeDiffSeconds > minSyncInterval;
}

const doTestSync = async (discoveryRes: DiscoveryResult, workflowFileName: string, branch: string) => {
  const ciServerInstanceId = `GHA-MBT-${_config.owner}`;
  const ciServerName = `GHA-MBT-${_config.owner}`;
  const executorCiId = `GHA-MBT-${_config.owner}.${_config.repo}.${branch}.${workflowFileName}`;
  const executorName = executorCiId;

  const ciServer = await OctaneClient.getOrCreateCiServer(ciServerInstanceId, ciServerName);
  const ciJob = await getOrCreateCiJob(executorName, executorCiId, ciServer, branch);
  _logger.debug(`Ci Job id: ${ciJob.id}, name: ${ciJob.name}, ci_id: ${ciJob.ci_id}`);
  const tr = await getOrCreateTestRunner(executorName, ciServer.id, ciJob);
  _logger.debug(`ci_server.id: ${tr.ci_server.id}, ci_job.id: ${tr.ci_job.id}, scm_repository.id: ${tr.scm_repository.id}`);
  await mbtPrepDiscoveryRes4Sync(tr.id, tr.scm_repository.id, discoveryRes);
  await dispatchDiscoveryResults(tr.id, tr.scm_repository.id, discoveryRes);
}

