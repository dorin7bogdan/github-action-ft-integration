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
import { Logger } from '../utils/logger';
import CiExecutor from '../dto/octane/general/CiExecutor';
import CiExecutorBody from '../dto/octane/general/bodies/CiExecutorBody';
import CiServer from '../dto/octane/general/CiServer';
import CiServerInfo from '../dto/octane/general/CiServerInfo';
import { Entity } from '../dto/octane/general/Entity';
import { escapeQueryVal } from '../utils/utils';
import { EntityConstants } from '../dto/octane/general/EntityConstants';
import FolderBody from '../dto/octane/general/bodies/FolderBody';
import Folder from '../dto/octane/general/Folder';
import UnitBody, { UnitParamBody } from '../dto/octane/general/bodies/UnitBody';
import Unit, { UnitParam } from '../dto/octane/general/Unit';
import CiJob from '../dto/octane/general/CiJob';
import CiJobBody from '../dto/octane/general/bodies/CiJobBody';
const { ID, COLLECTION_NAME: MODEL_ITEMS, NAME, LOGICAL_NAME, ENTITY_NAME: MODEL_ITEM, ENTITY_SUBTYPE: MODEL_FOLDER, SUBTYPE, PARENT } = EntityConstants.ModelFolder;
const { COLLECTION_NAME: AUTOMATED_TESTS, TEST_RUNNER } = EntityConstants.AutomatedTest;
const { REPOSITORY_PATH } = EntityConstants.MbtUnit;
const SERVER_TYPE = 'server_type';
const CI_SERVERS = 'ci_servers';
const CI_SERVER = 'ci_server';
const SCM_REPOSITORY = 'scm_repository';
const TESTING_TOOL_TYPE = 'testing_tool_type';
const INSTANCE_ID = 'instance_id';
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
  private static CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this._config.octaneSharedSpace}/workspaces/${this._config.octaneWorkspace}`;
  private static CI_API_URL = `/api/shared_spaces/${this._config.octaneSharedSpace}/workspaces/${this._config.octaneWorkspace}`;

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
    const res = await this._octane.create(CI_SERVERS, {
      name,
      instance_id: instanceId,
      server_type: this.GITHUB_ACTIONS,
      url: url
    }).fields('id,instance_id,name,server_type,url,plugin_version')
      .execute();
    return res.data[0];
  };

  public static getOrCreateCiServer = async (instanceId: string, name: string): Promise<CiServer> => {
    this._logger.debug(`Getting CI server with {instanceId='${instanceId}', url='${this._config.repoUrl}'}...`);

    const ciServerQuery = Query.field(INSTANCE_ID).equal(escapeQueryVal(instanceId))
      .and(Query.field(SERVER_TYPE).equal(this.GITHUB_ACTIONS))
      .and(Query.field('url').equal(escapeQueryVal(this._config.repoUrl)))
      .build();

    const res = await this._octane.get(CI_SERVERS).fields('instance_id,plugin_version,url,is_connected').query(ciServerQuery).execute();
    let ciServer;
    if (res?.total_count && res.data?.length) {
      ciServer = res.data[0];
    } else {
      ciServer = await this.createCIServer(name, instanceId, this._config.repoUrl);
      this.updatePluginVersion(instanceId);
      ciServer.plugin_version = this.PLUGIN_VERSION;
    }
    this._logger.debug("CI Server:", ciServer);
    return ciServer;
  };

  public static getCiServerByType = async (serverType: string): Promise<CiServer> => {
    this._logger.debug(`Getting default CI server ...`);

    const ciServerQuery = Query.field(SERVER_TYPE).equal(serverType).build();

    const ciServers = await this._octane.get(CI_SERVERS).fields('id,instance_id,plugin_version').query(ciServerQuery).execute();
    if (!ciServers || ciServers.total_count === 0 || ciServers.data.length === 0) {
      throw new Error(`Default CI Server not found.`);
    }
    const ciServer = ciServers.data[0];
    this._logger.debug("CI Server:", ciServer);

    return ciServer;
  };

  public static getExecutors = async (ciServerId: number, name: string, subType: string): Promise<CiExecutor[]> => {
    this._logger.debug(`Getting executors with ciServerId=${ciServerId} and name=${name} ...`);
    const executorsQuery = Query.field(CI_SERVER).equal(Query.field(ID).equal(ciServerId))
      .and(Query.field(NAME).equal(escapeQueryVal(name)))
      .and(Query.field(SUBTYPE).equal(subType))
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
    try {

      this._logger.debug(`Creating executor with ${JSON.stringify(body)}...`);

      const e = await this._octane.create('executors', body).execute();

      if (!e || e.total_count === 0 || e.data.length === 0) {
        throw Error('Could not create the test runner entity.');
      }
      const exec = e.data[0];
      this._logger.debug("Test Runner:", exec);
      return exec;
    } catch (error: any) {
      this._logger.error(`Error creating executor: ${error?.message}`);
      throw error;
    }
  };

  //TODO retest this method when fixed in Octane
  public static createTestRunner = async (ciServerId: number, ciJobId: number): Promise<CiExecutor> => {
    const obj = {
      name: "GHA Executor created From SDK",
      framework: {
        id: "list_node.je.framework.mbt",
        // name: "UFT",
        type: "list_node"
        // logical_name: "list_node.je.framework.uft"
      },
      ci_server: {
        id: ciServerId,
        type: "ci_server"
      },
      ci_job: {
        id: ciJobId,
        type: 'ci_job'
      },
      scm_repository: { id: 1004, "type": "scm_repository" } //      scm_type: 2, scm_url: "https://github.com/dorin7bogdan/ufto-tests.git"
    };
    const body = JSON.stringify(obj);
    this._logger.debug(`Creating test_runner with ${body}...`);

    //const e = await this._octane.create('test_runners', obj).execute();
    const headers = { 'ALM-OCTANE-TECH-PREVIEW': true }; //, 'ALM-OCTANE-PRIVATE': true 
    const e = await this._octane.executeCustomRequest(`${this.CI_INTERNAL_API_URL}/je/test_runners/uft"`, Octane.operationTypes.create, body, headers);

    if (!e || e.total_count === 0 || e.data.length === 0) {
      throw Error('Could not create the test runner entity.');
    }
    const exec = e.data[0];
    this._logger.debug("Test Runner:", exec);
    return exec;
  };

  public static getCiServerByInstanceId = async (instanceId: string): Promise<CiServer | null> => {
    this._logger.debug(`Getting CI server with {instanceId='${instanceId}'}...`);
    const ciServerQuery = Query.field(INSTANCE_ID).equal(escapeQueryVal(`${instanceId}`)).build();

    const ciServers = await this._octane.get(CI_SERVERS).fields(INSTANCE_ID).query(ciServerQuery).execute();
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

  public static fetchAutomatedTestsAgainstScmRepository = async (testNames: string[] = [], linkedToScmRepo: boolean = false): Promise<Map<string, Entity>> => {
    this._logger.debug(`Getting automated tests linked to SCM repository ...`);
    const testingToolTypeId = this.getTestingToolTypeId(this._config.testingTool);
    const qry = Query.field(TESTING_TOOL_TYPE).equal(Query.field(ID).equal(testingToolTypeId));

    if (testNames?.length) {
      const arr = testNames.map(name => escapeQueryVal(name));
      const namesQry = Query.field(NAME).inComparison(arr).build();
      namesQry.length <= 3000 && qry.and(namesQry);
    }

    const scmRepoId = this.getScmRepositoryId(this._config.repoUrl);
    if (linkedToScmRepo) {
      qry.and(Query.field(SCM_REPOSITORY).equal(Query.field(ID).equal(scmRepoId)));
    } else {
      qry.and(Query.field(SCM_REPOSITORY).equal(Query.field(ID).equal(scmRepoId))).not();
    }

    const q = qry.build();
    const entities = await this._octane.get(AUTOMATED_TESTS).fields('id,name,package,executable,description,test_runner').query(q).execute();

    const arr = entities?.data ?? [];
    const mappedTests = this.mapEntitiesByPackageAndName(arr);

    mappedTests.size && this._logger.debug("Tests:");
    mappedTests.forEach((e: Entity, k: string) => {
      this._logger.debug(k, e);
    });

    return mappedTests;
  };

  public static fetchUnits = async (query: Query): Promise<Unit[]> => {
    this._logger.debug(`Getting units (model_items) ...`);
    const q = query.build();
    const res = await this._octane.get(MODEL_ITEMS).fields('id,name,description,repository_path,parent,test_runner').query(q).execute();
    const arr: Unit[] = res?.data ?? [];
    arr.forEach(u => {
      this._logger.debug("Unit:", u);
    });
    return arr;
  }

  public static fetchUnitsFromFolders(scmRepositoryId: number, folderNames: ReadonlyArray<string>): Promise<Unit[]> {
    if (!folderNames || folderNames.length === 0) {
      return Promise.resolve([]);
    };
    this._logger.debug(`Getting units (model_items) ...`);
    const qry1 = Query.field(SCM_REPOSITORY).equal(Query.field(ID).equal(scmRepositoryId));
    const qry2 = folderNames.map(folderName => Query.field(PARENT).equal(Query.field(NAME).equal(folderName))).reduce((acc, curr) => acc.or(curr), Query.NULL);
    const q = qry1.and(qry2).build();
    return this.fetchUnits(q);
  }

  public static getRunnerDedicatedFolder = async (executorId: number): Promise<Folder | null> => {
    const qry = Query.field(TEST_RUNNER).equal(Query.field(ID).equal(executorId))
      .and(Query.field(SUBTYPE).equal(MODEL_FOLDER))
      .build();

    const res = await this._octane.get(MODEL_ITEMS).query(qry).execute();
    return res?.data?.length ? res.data[0] : null;
  }

  public static getGitMirrorFolder = async (): Promise<Folder | null> => {
    const qry = Query.field(LOGICAL_NAME).equal("mbt.discovery.unit.default_folder_name").build();
    const res = await this._octane.get(MODEL_ITEMS).query(qry).execute();
    return res?.data?.length ? res.data[0] : null;
  }

  public static fetchChildFolders = async (parentFolder: Folder, nameFilters: string[] = []): Promise<Folder[]> => {
    let q = Query.field(PARENT).equal(Query.field(ID).equal(parentFolder.id))
      .and(Query.field(SUBTYPE).equal(MODEL_FOLDER));

    if (nameFilters?.length) {
      q = q.and(Query.field(NAME).inComparison(nameFilters));
    }

    const qry = q.build();
    const res = await this._octane.get(MODEL_ITEMS).query(qry).fields("id,name,type,subtype").execute();
    return res?.data ?? [];
  }

  public static createFolders = async (names: Set<string>, gitMirrorAutodiscoveryFolder: Folder): Promise<Map<string, Folder>> => {
    if (names.size === 0) return new Map<string, Folder>();
    this._logger.debug(`Creating ${names.size} folders ...`);

    const folderBodies: FolderBody[] = Array.from(names, folderName => ({
      type: MODEL_ITEM,
      subtype: MODEL_FOLDER,
      name: folderName,
      parent: {
        id: gitMirrorAutodiscoveryFolder.id,
        name: gitMirrorAutodiscoveryFolder.name
      }
    }));
    const res = await this._octane.create(MODEL_ITEMS, folderBodies).fields('id,name,type,subtype').execute();
    const folders: Folder[] = res?.data ?? [];
    const foldersMap: Map<string, Folder> = new Map<string, Folder>(
      folders.map(folder => [folder.name, folder])
    );
    return foldersMap;
  };

  public static updateFolders = async (folders: FolderBody[]): Promise<Folder[]> => {
    if (folders?.length) {
      this._logger.debug(`Updating ${folders.length} folders ...`);
      const res = await this._octane.update(MODEL_ITEMS, folders).execute();
      const updatedFolders: Folder[] = res?.data ?? [];
      this._logger.debug(`Updated folders: ${updatedFolders.length}`);
      return updatedFolders;
    }
    return [];
  }

  public static createUnits = async (unitsToAdd: UnitBody[], paramsToAdd: UnitParamBody[]) => {
    this._logger.debug(`Creating ${unitsToAdd.length} units ...`);
    const res = await this._octane.create(MODEL_ITEMS, unitsToAdd).fields(REPOSITORY_PATH).execute();
    const postedUnitEntities: Unit[] = res?.data ?? [];
    const unitEntities: Map<string, Unit> = new Map();
    for (const unit of postedUnitEntities) {
      if (!unit) {
        this._logger.warn('Null or undefined unit found');
        continue;
      }
      if (unit.repository_path) {
        if (unitEntities.has(unit.repository_path)) {
          this._logger.warn(`Duplicate repository_path found: ${unit.repository_path}`);
        }
        unitEntities.set(unit.repository_path, unit);
      } else {
        this._logger.warn(`Unit without repository_path found: ${unit.id}`);
      }
    }
    if (unitEntities.size === 0) return;

    this._logger.info(`Successfully added ${unitEntities.size} new units.`);

    this._logger.info(`Dispatching ${paramsToAdd.length} new unit parameters ...`);

    // !!! IMPORTANT: replace parent unit entities for parameters in order to save their relations
    for (const param of paramsToAdd) {
      const parentUnit = param.model_item;
      if (parentUnit.repository_path && unitEntities.has(parentUnit.repository_path)) {
        const newParentUnit = unitEntities.get(parentUnit.repository_path);
        param.model_item = { data: newParentUnit };
      } else {
        this._logger.warn(`Unit parameter ${param.name} has no model_item.`);
      }
    }
    // add parameters
    const res2 = await this._octane.create("entity_parameters", paramsToAdd).execute();
    const unitParams: UnitParam[] = res2?.data ?? [];
    this._logger.info(`Successfully added ${unitParams.length} new unit parameters.`);
  }

  public static updateUnits = async (units: UnitBody[]) => {
    if (!units || units.length === 0) return;
    this._logger.debug(`Updating ${units.length} units ...`);
    const res = await this._octane.update(MODEL_ITEMS, units).execute();
    const updatedUnits: Unit[] = res?.data ?? [];
    this._logger.debug(`Updated units: ${updatedUnits.length}`);
    return updatedUnits;
  }

  private static getScmRepositoryId = async (repoURL: string): Promise<number> => {
    this._logger.debug(`Getting SCM Repository with {url='${repoURL}'} ...`);
    const scmRepoQuery = Query.field('url').equal(escapeQueryVal(repoURL)).build();
    const scmRepos = await this._octane.get('scm_repository_roots').fields(ID).query(scmRepoQuery).execute();
    if (!scmRepos || scmRepos.total_count === 0 || scmRepos.data.length === 0) {
      throw new Error(`SCM Repository not found.`);
    }
    const scmRepoId = scmRepos.data[0].id;
    this._logger.debug("SCM Repository:", scmRepoId);
    return scmRepoId;
  }

  private static mapEntitiesByPackageAndName = (entities: Entity[]): Map<string, Entity> => {
    const groupedEntities = new Map<string, Entity>();
    for (const entity of entities) {
      groupedEntities.set(`${entity.getStringValue("package")}#${entity.getName()}`, entity);
    }
    return groupedEntities;
  }

  private static getTestingToolTypeId = (testingTool: string): string => {
    return `list_node.testing_tool_type.${testingTool}`;
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

  public static getTestRunnerVersion = async (executorId: number, techPreview: boolean = false): Promise<string> => {
    const headers = techPreview ? { 'ALM-OCTANE-TECH-PREVIEW': true } : undefined; //, 'ALM-OCTANE-PRIVATE': true 
    const e = await this._octane.executeCustomRequest(`${this.CI_API_URL}/executors/${executorId}/version`, Octane.operationTypes.get, undefined, headers);
    if (!e || e.total_count === 0 || e.data.length === 0) {
      throw Error('Could not get the test runner version.');
    }
    return e.data[0];
  }

  public static getCiJob = async (
    ciId: string,
    ciServer: CiServer
  ): Promise<CiJob | undefined> => {
    this._logger.debug(
      `Getting job with {ci_id='${ciId}, ci_server.id='${ciServer.id}'}...`
    );

    const jobQuery = Query.field('ci_id')
      .equal(escapeQueryVal(ciId))
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .build();

    const ciJobs = await this._octane
      .get('ci_jobs')
      .fields('id,ci_id,name,ci_server{name,instance_id}')
      .query(jobQuery)
      .execute();

    if (!ciJobs || ciJobs.total_count === 0 || ciJobs.data.length === 0) {
      return undefined;
    }

    return ciJobs.data[0];
  };

  public static createCiJob = async (ciJob: CiJobBody): Promise<CiJob> => {
    this._logger.debug(
      `Creating job with {ci_id='${ciJob.jobCiId}', ci_server.id='${ciJob.ciServer?.id}'}...`
    );

    const ciJobToCreate = {
      name: ciJob.name,
      parameters: ciJob.parameters,
      ci_id: ciJob.jobCiId,
      ci_server: {
        id: ciJob.ciServer?.id,
        type: ciJob.ciServer?.type
      },
      branch: ciJob.branchName
    };

    const ciJobs = await this._octane.create('ci_jobs', ciJobToCreate).execute();

    if (!ciJobs || ciJobs.total_count === 0 || ciJobs.data.length === 0) {
      throw Error('Could not create the CI job entity.');
    }

    return ciJobs.data[0];
  };
}
