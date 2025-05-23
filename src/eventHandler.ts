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
import { buildExecutorCiId, buildExecutorName, getOrCreateExecutor } from './service/executorService';
import CiParameter from './dto/octane/events/CiParameter';
import Discovery from './discovery/Discovery';
import { UftoParamDirection } from './dto/ft/UftoParamDirection';
import { OctaneStatus } from './dto/ft/OctaneStatus';
import { fetchTestsFromOctane } from './service/testsService';
import DiscoveryResult from './discovery/DiscoveryResult';
import { mbtPrepDiscoveryRes4Sync } from './discovery/mbtDiscoveryResultPreparer';
import CiServer from './dto/octane/general/CiServer';
import CiJob from './dto/octane/general/CiJob';
import { getOrCreateCiJob } from './service/ciJobService';

const _config = getConfig();
const _logger: Logger = new Logger('eventHandler');

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

/*  const workflowFilePath = event.workflow?.path;
  const workflowName = event.workflow?.name;
  const workflowRunId = event.workflow_run?.id;
  const branchName = event.workflow_run?.head_branch;*/
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
      await doTestSync(discoveryRes);
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

const getCiServerInstanceId = (useOldCiServer: boolean = false) => {
  return useOldCiServer ? `GHA/${_config.octaneSharedSpace}` : `GHA-${_config.owner}`;
};

const getCiServerName = async (useOldCiServer: boolean = false) => {
  if (useOldCiServer) {
    const sharedSpaceName = await OctaneClient.getSharedSpaceName(_config.octaneSharedSpace);
    return `GHA/${sharedSpaceName}`;
  } else {
    return `GHA-${_config.owner}`;
  }
};

const getExecutorName = () => {
  return `GHA-${_config.owner}-${_config.repo}`;
}

const hasExecutorParameters = (configParameters: CiParameter[] | undefined): boolean => {
  if (!configParameters) {
    return false;
  }

  const requiredParameters = ['suiteRunId', 'executionId', 'testsToRun'];
  const foundNames = new Set(configParameters.map(param => param.name));
  return requiredParameters.every(name => foundNames.has(name));
};

const isMinSyncIntervalElapsed = async (minSyncInterval: number) => {
  const lastSyncedTimestamp = await getSyncedTimestamp();
  const currentTimestamp = new Date().getTime();
  const timeDiffSeconds = Math.floor((currentTimestamp - lastSyncedTimestamp) / 1000);
  return timeDiffSeconds > minSyncInterval;
}

const doTestSync = async (discoveryRes: DiscoveryResult) => { /*, event: ActionsEvent*/
  //const ciFteServer = await OctaneClient.getCiServerByType("fte_cloud");
  const ciServerInstanceId = getCiServerInstanceId();
  const ciServerName = await getCiServerName();
  const configParameters: CiParameter[] = [];
  const workflow = "Debug GitHub Action"; // TODO remove hardcoded value
  const workflowFileName = "gha-ft-integration.yml"; // TODO remove hardcoded value
  const branchName = "main";// event.workflow_run?.head_branch;
  const executorCiId = buildExecutorCiId(_config.owner, _config.repo, workflowFileName, branchName);
  const executorName = buildExecutorName(_config.pipelineNamePattern, _config.owner, _config.repo, workflow, workflowFileName);

  const ciServer = await OctaneClient.getOrCreateCiServer(ciServerInstanceId, ciServerName);
  const ciJob = await getOrCreateCiJob(executorName, executorCiId, ciServer, branchName, configParameters);
  _logger.debug(`Executor job: id: ${ciJob.id}, name: ${ciJob.name}, ci_id: ${ciJob.ci_id}`);

  //const tr = await getOrCreateExecutor(executorName, ciJob.id, _config.testingTool, ciServer);
  const tr = await OctaneClient.createTestRunner(ciServer.id, Number(ciJob.id));
  _logger.debug(`Test runner: ${tr.id}, name: ${tr.name}, subtype: ${tr.subtype}`);
  //const x = await fetchTestsFromOctane(discoveryResult.getAllTests());
  const executorId = tr.id;
  //await mbtPrepDiscoveryRes4Sync(discoveryRes);
  //await dispatchDiscoveryResults(executorId, discoveryRes);
}

