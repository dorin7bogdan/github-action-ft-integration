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

import OctaneClient from '../client/octaneClient';
import ActionsEvent from '../dto/github/ActionsEvent';
import CiEventCause from '../dto/octane/events/CiEventCause';
import CiParameter from '../dto/octane/events/CiParameter';
import {
  CiEventType,
  MultiBranchType,
  PhaseType
} from '../dto/octane/events/CiTypes';
import CiExecutor from '../dto/octane/general/CiExecutor';
import CiServer from '../dto/octane/general/CiServer';
import { Logger } from '../utils/logger';
import { generateRootExecutorEvent } from './ciEventsService';

const _logger: Logger = new Logger('executorService');

const getExecutor = async (ciServerId: number, name: string): Promise<CiExecutor | null> => {
  let executors = await OctaneClient.getExecutors(ciServerId, name);

  if (executors.length === 0) {
    return null;
  }
  return executors[0];
};

const getOrCreateExecutor = async (name: string, framework: string, ciServerId: number): Promise<CiExecutor> => {
  const executor = await getExecutor(ciServerId, name);

  if (executor) {
    return executor;
  }

  return await OctaneClient.createExecutor({
    name: name,
    subtype: 'test_runner',
    framework: {
      id: getFrameworkId(framework),
      type: 'list_node'
    },
    ci_server: {
      id: ciServerId,
      type: 'ci_server'
    }
  });
};

const sendExecutorStartEvent = async (
  event: ActionsEvent,
  executorName: string,
  executorCiId: string,
  parentCiId: string,
  buildCiId: string,
  runNumber: string,
  branchName: string,
  startTime: number,
  baseUrl: string,
  parameters: CiParameter[],
  causes: CiEventCause[],
  ciServer: CiServer
): Promise<void> => {
  const startEvent = generateRootExecutorEvent(
    event,
    executorName,
    executorCiId,
    buildCiId,
    runNumber,
    branchName,
    startTime,
    CiEventType.STARTED,
    parameters,
    causes,
    MultiBranchType.CHILD,
    parentCiId,
    PhaseType.INTERNAL
  );

  await OctaneClient.sendEvents([startEvent], ciServer.instance_id, baseUrl);
};

const sendExecutorFinishEvent = async (
  event: ActionsEvent,
  executorName: string,
  executorCiId: string,
  parentCiId: string,
  buildCiId: string,
  runNumber: string,
  branchName: string,
  startTime: number,
  baseUrl: string,
  parameters: CiParameter[],
  causes: CiEventCause[],
  ciServer: CiServer
): Promise<void> => {
  const finishEvent = generateRootExecutorEvent(
    event,
    executorName,
    executorCiId,
    buildCiId,
    runNumber,
    branchName,
    startTime,
    CiEventType.FINISHED,
    parameters,
    causes,
    MultiBranchType.CHILD,
    parentCiId
  );

  await OctaneClient.sendEvents([finishEvent], ciServer.instance_id, baseUrl);
};

const buildExecutorName = (
  executorNamePattern: string,
  repositoryOwner: string,
  repositoryName: string,
  workflowName: string,
  workflowFileName: string
): string => {
  return executorNamePattern
    .replace('${repository_owner}', repositoryOwner)
    .replace('${repository_name}', repositoryName)
    .replace('${workflow_name}', workflowName)
    .replace('${workflow_file_name}', workflowFileName);
};

const buildExecutorCiId = (
  repositoryOwner: string,
  repositoryName: string,
  workflowFileName: string,
  branchName?: string
): string => {
  return branchName
    ? `${repositoryOwner}/${repositoryName}/${workflowFileName}/executor/${branchName}`
    : `${repositoryOwner}/${repositoryName}/${workflowFileName}/executor`;
};

const getFrameworkId = (framework: string): string => {
  let frameworkId;

  switch (framework) {
    case 'mbt':
      frameworkId = 'list_node.je.framework.mbt';
      break;
    default:
      frameworkId = 'list_node.je.framework.uft';
  }
  return frameworkId;
};

export {
  getExecutor,
  getOrCreateExecutor,
  buildExecutorName,
  buildExecutorCiId,
  sendExecutorStartEvent,
  sendExecutorFinishEvent
};
