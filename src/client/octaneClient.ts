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

import { Octane } from '@microfocus/alm-octane-js-rest-sdk';
import Query from '@microfocus/alm-octane-js-rest-sdk/dist/lib/query';
import { getConfig } from '../config/config';
import CiEvent from '../dto/octane/events/CiEvent';
import CiEventsList from '../dto/octane/events/CiEventsList';
import CiServerBody from '../dto/octane/general/bodies/CiServerBody';
import { isVersionGreaterOrEqual } from '../utils/utils';
import { Logger } from '../utils/logger';
import CiExecutor from '../dto/octane/general/CiExecutor';
import CiExecutorBody from '../dto/octane/general/bodies/CiExecutorBody';
import CiServer from '../dto/octane/general/CiServer';
import CiServerInfo from '../dto/octane/general/CiServerInfo';
import CiJob from '../dto/octane/general/CiJob';

export default class OctaneClient {
  private static LOGGER: Logger = new Logger('octaneClient');

  private static GITHUB_ACTIONS_SERVER_TYPE = 'github_actions';
  private static GITHUB_ACTIONS_PLUGIN_VERSION = '25.1.1';
  private static config = getConfig();
  private static octane: Octane = new Octane({
    server: this.config.octaneUrl,
    sharedSpace: this.config.octaneSharedSpace,
    workspace: this.config.octaneWorkspace,
    user: this.config.octaneClientId,
    password: this.config.octaneClientSecret,
    headers: {
      'ALM-OCTANE-TECH-PREVIEW': true,
      'ALM-OCTANE-PRIVATE': true
    }
  });

  private static ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this.config.octaneSharedSpace}/workspaces/${this.config.octaneWorkspace}/analytics/ci`;
  private static ANALYTICS_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this.config.octaneSharedSpace}/analytics/ci`;
  private static ANALYTICS_CI_API_URL = `/api/shared_spaces/${this.config.octaneSharedSpace}/workspaces/${this.config.octaneWorkspace}/analytics/ci`;

  public static setAnalyticsSharedSpace = (sharedSpace: string) => {
    this.ANALYTICS_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${sharedSpace}/analytics/ci`;
  };

  public static setOctane = (newOctane: Octane) => {
    this.octane = newOctane;
  };

  public static sendEvents = async (
    events: CiEvent[],
    instanceId: string,
    url: string
  ): Promise<void> => {
    this.LOGGER.debug(
      `Sending events to server-side app (instanceId: ${instanceId}): ${JSON.stringify(events)}`
    );

    const ciServerInfo: CiServerInfo = {
      instanceId,
      type: this.GITHUB_ACTIONS_SERVER_TYPE,
      url,
      version: this.GITHUB_ACTIONS_PLUGIN_VERSION,
      sendingTime: new Date().getTime()
    };

    const eventsToSend: CiEventsList = {
      server: ciServerInfo,
      events
    };

    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/events`,
      Octane.operationTypes.update,
      eventsToSend
    );
  };

  public static sendTestResult = async (
    testResult: string,
    instanceId: string,
    jobId: string,
    buildId: string
  ): Promise<void> => {
    this.LOGGER.debug(
      `Sending test results for job run with {jobId='${jobId}, buildId='${buildId}', instanceId='${instanceId}'}`
    );

    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/test-results?skip-errors=true&instance-id=${instanceId}&job-ci-id=${jobId}&build-ci-id=${buildId}`,
      Octane.operationTypes.create,
      testResult,
      { 'Content-Type': 'application/xml' }
    );
  };

  public static createCIServer = async (
    name: string,
    instanceId: string,
    url: string
  ): Promise<CiServer> => {
    this.LOGGER.debug(
      `Creating CI server with {name='${name}', instanceId='${instanceId}'}...`
    );

    return (
      await this.octane
        .create('ci_servers', {
          name,
          instance_id: instanceId,
          server_type: this.GITHUB_ACTIONS_SERVER_TYPE,
          url: url
        })
        .fields('instance_id')
        .execute()
    ).data[0];
  };

  public static getCiServerOrCreate = async (
    instanceId: string,
    projectName: string,
    baseUri: string,
    createOnAbsence = false
  ): Promise<CiServer> => {
    this.LOGGER.debug(`Getting CI server with {instanceId='${instanceId}'}...`);

    const ciServerQuery = Query.field('instance_id')
      .equal(this.escapeOctaneQueryValue(instanceId))
      .build();

    const ciServers = await this.octane
      .get('ci_servers')
      .fields('instance_id,plugin_version,url')
      .query(ciServerQuery)
      .execute();
    if (
      !ciServers ||
      ciServers.total_count === 0 ||
      ciServers.data.length === 0
    ) {
      if (createOnAbsence) {
        return await this.createCIServer(projectName, instanceId, baseUri);
      } else {
        throw new Error(
          `CI Server '${projectName} (instanceId='${instanceId}'))' not found.`
        );
      }
    }
    return ciServers.data[0];
  };

  public static getExecutors = async (
    ciJobId: string,
    ciServer: CiServer
  ): Promise<CiJob[]> => {
    this.LOGGER.debug(
      `Getting executor jobs with {id='${ciJobId}', ci_server.id='${ciServer.id}'}...`
    );

    const executorsQuery = Query.field('id')
      .equal(this.escapeOctaneQueryValue(ciJobId))
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .and(Query.field('executor').notEqual(Query.NULL_REFERENCE))
      .build();

    const executors = await this.octane
      .get('ci_jobs')
      .fields('ci_id,name,ci_server{name,instance_id},executor{name,subtype}')
      .query(executorsQuery)
      .execute();

    if (
      !executors ||
      executors.total_count === 0 ||
      executors.data.length === 0
    ) {
      return [];
    }

    return executors.data;
  };

  public static createExecutor = async (
    executor: CiExecutorBody
  ): Promise<CiExecutor> => {
    this.LOGGER.debug(`Creating executor with ${JSON.stringify(executor)}...`);

    const executors = await this.octane.create('executors', executor).execute();

    if (
      !executors ||
      executors.total_count === 0 ||
      executors.data.length === 0
    ) {
      throw Error('Could not create the test runner entity.');
    }

    return executors.data[0];
  };

  public static getCiServer = async (
    instanceId: string
  ): Promise<CiServerBody | undefined> => {
    this.LOGGER.debug(`Getting CI server with {instanceId='${instanceId}'}...`);

    const ciServerQuery = Query.field('instance_id')
      .equal(this.escapeOctaneQueryValue(instanceId))
      .build();

    const ciServers = await this.octane
      .get('ci_servers')
      .fields('instance_id')
      .query(ciServerQuery)
      .execute();

    if (
      !ciServers ||
      ciServers.total_count === 0 ||
      ciServers.data.length === 0
    ) {
      return undefined;
    }
    return ciServers.data[0];
  };

  public static getSharedSpaceName = async (
    sharedSpaceId: number
  ): Promise<string> => {
    this.LOGGER.debug(
      `Getting the name of the shared space with {id='${sharedSpaceId}'}...`
    );
    return (
      await this.octane.executeCustomRequest(
        `/api/shared_spaces?fields=name&query="id EQ ${sharedSpaceId}"`,
        Octane.operationTypes.get
      )
    ).data[0].name;
  };

  public static getCiJob = async (
    ciId: string,
    ciServer: CiServer
  ): Promise<CiJob | undefined> => {
    this.LOGGER.debug(
      `Getting job with {ci_id='${ciId}, ci_server.id='${ciServer.id}'}...`
    );

    const jobQuery = Query.field('ci_id')
      .equal(this.escapeOctaneQueryValue(ciId))
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .build();

    const ciJobs = await this.octane
      .get('ci_jobs')
      .fields('id,ci_id,name,ci_server{name,instance_id}')
      .query(jobQuery)
      .execute();

    if (!ciJobs || ciJobs.total_count === 0 || ciJobs.data.length === 0) {
      return undefined;
    }

    return ciJobs.data[0];
  };

  public static updatePluginVersionIfNeeded = async (
    instanceId: String,
    ciServer: CiServerBody
  ): Promise<void> => {
    this.LOGGER.info(`Current CI Server version: '${ciServer.plugin_version}'`);
    if (
      !ciServer.plugin_version ||
      isVersionGreaterOrEqual(
        this.GITHUB_ACTIONS_PLUGIN_VERSION,
        ciServer.plugin_version
      )
    ) {
      this.LOGGER.info(
        `Updating CI Server version to: '${this.GITHUB_ACTIONS_PLUGIN_VERSION}'`
      );
      await this.updatePluginVersion(instanceId);
    }
  };

  public static getOctaneVersion = async (): Promise<string> => {
    const requestHeaders = {
      'ALM-OCTANE-TECH-PREVIEW': true
    };

    const response = await this.octane.executeCustomRequest(
      this.ANALYTICS_CI_INTERNAL_API_URL + '/servers/connectivity/status',
      Octane.operationTypes.get,
      undefined,
      requestHeaders
    );

    return response.octaneVersion;
  };

  /**
   * Gets a map containing the experiments related to GitHub Actions and their
   * activation status.
   * @returns Object containing the names of the experiments as keys and the
   * activation status (true if on, false if off) as value.
   */
  public static getFeatureToggles = async (): Promise<{
    [key: string]: boolean;
  }> => {
    this.LOGGER.info(`Getting features' statuses (on/off)...`);

    const response = await this.octane.executeCustomRequest(
      `${this.ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL}/github_feature_toggles`,
      Octane.operationTypes.get
    );

    return response;
  };

  private static updatePluginVersion = async (
    instanceId: String
  ): Promise<void> => {
    const querystring = require('querystring');
    const sdk = '';
    const pluginVersion = this.GITHUB_ACTIONS_PLUGIN_VERSION;
    const client_id = this.config.octaneClientId;
    const selfUrl = querystring.escape(this.config.serverBaseUrl);
    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/servers/${instanceId}/tasks?self-type=${this.GITHUB_ACTIONS_SERVER_TYPE}&api-version=1&sdk-version=${sdk}&plugin-version=${pluginVersion}&self-url=${selfUrl}&client-id=${client_id}&client-server-user=`,
      Octane.operationTypes.get
    );
  };

  private static escapeOctaneQueryValue(q: string): string {
    return (
      q && q.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    );
  }
}
