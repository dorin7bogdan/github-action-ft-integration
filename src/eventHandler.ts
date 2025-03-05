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
import {
  buildExecutorCiId,
  buildExecutorName,
  getOrCreateExecutor,
  sendExecutorFinishEvent,
  sendExecutorStartEvent
} from './service/executorService';
import CiParameter from './dto/octane/events/CiParameter';
import * as core from '@actions/core';

const LOGGER: Logger = new Logger('eventHandler');

export const handleEvent = async (event: ActionsEvent): Promise<void> => {
  const eventType = getEventType(event);
  const repositoryOwner = event.repository?.owner.login;
  const repositoryName = event.repository?.name;
  const workflowFilePath = event.workflow?.path;
  const workflowName = event.workflow?.name;
  const workflowRunId = event.workflow_run?.id;
  const branchName = event.workflow_run?.head_branch;

  if (!repositoryOwner || !repositoryName) {
    throw new Error('Event should contain repository data!');
  }

  core.info('BEGIN handleEvent ...');

  switch (eventType) {
    case ActionsEventType.WORKFLOW_QUEUED:
      core.info('WORKFLOW_QUEUED...');
      break;
    case ActionsEventType.WORKFLOW_STARTED:
      core.info('WORKFLOW_STARTED...');
      break;
    case ActionsEventType.WORKFLOW_FINISHED:
      core.info('WORKFLOW_FINISHED.');
      break;
    case ActionsEventType.UNKNOWN_EVENT:
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
