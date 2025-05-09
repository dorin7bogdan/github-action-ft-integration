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
  private static _logger: Logger = new Logger('octaneClient');
  private static GITHUB_ACTIONS = 'github_actions';
  private static PLUGIN_VERSION = '25.2';
  private static _config = getConfig();
  private static _octane: Octane = new Octane({
    server: this._config.octaneUrl,
    sharedSpace: this._config.octaneSharedSpace,
    workspace: this._config.octaneWorkspace,
    user: this._config.octaneClientId,
    password: this._config.octaneClientSecret,
    headers: {
      'ALM-OCTANE-TECH-PREVIEW': true,
      'ALM-OCTANE-PRIVATE': true
    }
  });

  private static ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this._config.octaneSharedSpace}/workspaces/${this._config.octaneWorkspace}/analytics/ci`;
  private static ANALYTICS_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this._config.octaneSharedSpace}/analytics/ci`;

  public static sendEvents = async (events: CiEvent[], instanceId: string, url: string): Promise<void> => {
    this._logger.debug(`Sending events to server-side app (instanceId: ${instanceId}): ${JSON.stringify(events)}`);

    const ciServerInfo: CiServerInfo = {
      instanceId,
      type: this.GITHUB_ACTIONS,
      url,
      version: this.PLUGIN_VERSION,
      sendingTime: new Date().getTime()
    };

    const eventsToSend: CiEventsList = {
      server: ciServerInfo,
      events
    };

    await this._octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/events`,
      Octane.operationTypes.update,
      eventsToSend
    );
  };

  public static sendTestResult = async (testResult: string, instanceId: string, jobId: string, buildId: string): Promise<void> => {
    this._logger.debug(`Sending test results for job run with {jobId='${jobId}, buildId='${buildId}', instanceId='${instanceId}'}`);
    await this._octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/test-results?skip-errors=true&instance-id=${instanceId}&job-ci-id=${jobId}&build-ci-id=${buildId}`,
      Octane.operationTypes.create,
      testResult,
      { 'Content-Type': 'application/xml' }
    );
  };

  private static createCIServer = async (name: string, instanceId: string, url: string): Promise<CiServer> => {
    this._logger.debug(`Creating CI server with {name='${name}', instanceId='${instanceId}'}...`);
    const res = await this._octane.create('ci_servers', {
      name,
      instance_id: instanceId,
      server_type: this.GITHUB_ACTIONS,
      url: url
    })
    .fields('id,instance_id,name,server_type,url,plugin_version')
    .execute();
    return res.data[0];
  };

  public static getOrCreateCiServer = async (instanceId: string, name: string, url: string): Promise<CiServer> => {
    this._logger.debug(`Getting CI server with {instanceId='${instanceId}', name='${name}', url='${url}'}...`);

    const ciServerQuery = Query.field('instance_id').equal(this.escapeOctaneQueryValue(instanceId))
      .and(Query.field('server_type').equal(this.GITHUB_ACTIONS))
      .and(Query.field('name').equal(this.escapeOctaneQueryValue(name)))
      .and(Query.field('url').equal(this.escapeOctaneQueryValue(url)))
      .build();

    const res = await this._octane.get('ci_servers').fields('instance_id,plugin_version,url').query(ciServerQuery).execute();
    let ciServer;
    if (res?.total_count && res.data?.length) {
      ciServer = res.data[0];
    } else {
      ciServer = await this.createCIServer(name, instanceId, url);
      this.updatePluginVersion(instanceId);
      ciServer.plugin_version = this.PLUGIN_VERSION;
    }
    this._logger.debug("CI Server:", ciServer);
    return ciServer;
  };

  public static getCiServerByType = async (serverType: string): Promise<CiServer> => {
    this._logger.debug(`Getting default CI server ...`);

    const ciServerQuery = Query.field('server_type').equal(serverType).build();

    const ciServers = await this._octane.get('ci_servers').fields('id,instance_id,plugin_version').query(ciServerQuery).execute();
    if (!ciServers || ciServers.total_count === 0 || ciServers.data.length === 0) {
      throw new Error(`Default CI Server not found.`);
    }
    const ciServer = ciServers.data[0];
    this._logger.debug("CI Server:", ciServer);

    return ciServer;
  };

  public static getExecutors = async (ciServerId: number, name: string): Promise<CiExecutor[]> => {
    this._logger.debug(`Getting executors with ciServerId=${ciServerId} and name=${name} ...`);
    const executorsQuery = Query.field('ci_server').equal(Query.field('id').equal(ciServerId))
      .and(Query.field('name').equal(this.escapeOctaneQueryValue(name)))
      .build();

    //name,framework,test_runner_parameters,last_successful_sync,subtype,id,last_sync,next_sync,message,sync_status,ci_server{id},scm_repository{repository}
    const executors = await this._octane.get('executors').fields('id,name,subtype,framework').query(executorsQuery).execute();

    const arr = executors?.data ?? [];
    arr.forEach((e: CiExecutor) => {
      this._logger.debug("Test Runner:", e);
    });
    return arr;
  };

  public static createExecutor = async (body: CiExecutorBody): Promise<CiExecutor> => {
    this._logger.debug(`Creating executor with ${JSON.stringify(body)}...`);

    const e = await this._octane.create('executors', body).execute();

    if (!e || e.total_count === 0 || e.data.length === 0) {
      throw Error('Could not create the test runner entity.');
    }
    const exec = e.data[0];
    this._logger.debug("Test Runner:", exec);
    return exec;
  };

  public static getCiServerByInstanceId = async (instanceId: string): Promise<CiServer | null> => {
    this._logger.debug(`Getting CI server with {instanceId='${instanceId}'}...`);
    const ciServerQuery = Query.field('instance_id').equal(this.escapeOctaneQueryValue(`${instanceId}`)).build();

    const ciServers = await this._octane
      .get('ci_servers')
      .fields('instance_id')
      .query(ciServerQuery)
      .execute();

    return ciServers?.data?.length ? ciServers.data[0] : null;
  };

  public static getSharedSpaceName = async (sharedSpaceId: number): Promise<string> => {
    this._logger.debug(`Getting the name of the shared space with {id='${sharedSpaceId}'}...`);
    return (
      await this._octane.executeCustomRequest(
        `/api/shared_spaces?fields=name&query="id EQ ${sharedSpaceId}"`,
        Octane.operationTypes.get
      )
    ).data[0].name;
  };

  public static getOctaneVersion = async (): Promise<string> => {
    const requestHeaders = { 'ALM-OCTANE-TECH-PREVIEW': true };

    const response = await this._octane.executeCustomRequest(
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
    this._logger.info(`Getting features' statuses (on/off)...`);

    const response = await this._octane.executeCustomRequest(
      `${this.ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL}/github_feature_toggles`,
      Octane.operationTypes.get
    );

    return response;
  };

  private static updatePluginVersion = async (instanceId: String): Promise<void> => {
    const querystring = require('querystring');
    const sdk = '';
    const pluginVersion = this.PLUGIN_VERSION;
    const client_id = this._config.octaneClientId;
    const selfUrl = querystring.escape(this._config.repoUrl);
    this._logger.debug(`Updating CI Server's plugin_version to: '${this.PLUGIN_VERSION}'`);
    await this._octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/servers/${instanceId}/tasks?self-type=${this.GITHUB_ACTIONS}&api-version=1&sdk-version=${sdk}&plugin-version=${pluginVersion}&self-url=${selfUrl}&client-id=${client_id}&client-server-user=`,
      Octane.operationTypes.get
    );
  };

  private static escapeOctaneQueryValue(q: string): string {
    return (
      q && q.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    );
  }
}
