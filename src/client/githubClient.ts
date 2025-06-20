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

import { getOctokit, context } from '@actions/github';
import { ActionsJob } from '../dto/github/ActionsJob';
import Artifact from '../dto/github/Artifact';
import Commit from '../dto/github/Commit';
import WorkflowRun from '../dto/github/WorkflowRun';
import WorkflowRunStatus from '../dto/github/WorkflowRunStatus';
import { Logger } from '../utils/logger';
import FileContent from '../dto/github/FileContent';
import * as core from '@actions/core';
import { getConfig } from '../config/config';
const _config = getConfig();
export default class GitHubClient {
  private static _logger: Logger = new Logger('githubClient');

  private static octokit = getOctokit(getConfig().githubToken);

  public static getWorkflowPath = async (headSHA: string): Promise<string> => {
      const token = core.getInput('githubToken', { required: true });
      const octokit = getOctokit(token);

      try {
        const { data: workflowRuns } = await octokit.rest.actions.listWorkflowRunsForRepo({
          owner: _config.owner,
          repo: _config.repo,
          event: 'push',
          head_sha: headSHA,
          status: 'in_progress'
        });

        if (workflowRuns.workflow_runs.length === 0) {
          throw new Error(`No in-progress workflow runs found for SHA ${headSHA}`);
        }

        const currentRunId = context.runId;
        const currentRun = workflowRuns.workflow_runs.find(run => run.id === currentRunId);
        if (!currentRun) {
          throw new Error(`Current workflow run (ID: ${currentRunId}) not found for SHA ${headSHA}`);
        }
        return currentRun.path; // e.g., .github/workflows/gha-ft-integration.yml
      } catch (error) {
        console.error('Error fetching workflow path:', error);
        throw error; // Re-throw to allow caller to handle
      }
    }

  public static getWorkflowRunJobs = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<ActionsJob[]> => {
    this._logger.debug(
      `Getting all jobs for workflow run with {run_id='${workflowRunId}'}...`
    );

    return await this.octokit.paginate(
      this.octokit.rest.actions.listJobsForWorkflowRun,
      {
        owner,
        repo,
        run_id: workflowRunId,
        per_page: 100
      },
      response => response.data
    );
  };

  public static getJob = async (
    owner: string,
    repo: string,
    jobId: number
  ): Promise<ActionsJob> => {
    this._logger.debug(`Getting job with {job_id='${jobId}'}...`);

    return (
      await this.octokit.rest.actions.getJobForWorkflowRun({
        owner,
        repo,
        job_id: jobId
      })
    ).data;
  };

  public static getWorkflowRunsTriggeredBeforeByStatus = async (
    owner: string,
    repo: string,
    beforeTime: number,
    workflowId: number,
    status: WorkflowRunStatus
  ): Promise<WorkflowRun[]> => {
    this._logger.debug(
      `Getting workflow runs before '${beforeTime}' with {workflow_id='${workflowId}', status='${status}'}...`
    );

    return (
      await this.octokit.paginate(
        this.octokit.rest.actions.listWorkflowRuns,
        {
          owner,
          repo,
          workflow_id: workflowId,
          event: 'workflow_run',
          status,
          per_page: 100
        },
        response => response.data
      )
    ).filter(run => new Date(run.run_started_at!).getTime() < beforeTime);
  };

  public static getWorkflowRun = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<WorkflowRun> => {
    this._logger.debug(
      `Getting workflow run with {run_id='${workflowRunId}'}...`
    );

    return (
      await this.octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: workflowRunId
      })
    ).data;
  };

  public static getWorkflowRunArtifacts = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<Artifact[]> => {
    this._logger.debug(
      `Getting artifacts for workflow run with {run_id='${workflowRunId}'}...`
    );

    return await this.octokit.paginate(
      this.octokit.rest.actions.listWorkflowRunArtifacts,
      { owner, repo, run_id: workflowRunId, per_page: 100 },
      response => response.data
    );
  };

  public static downloadArtifact = async (
    owner: string,
    repo: string,
    artifactId: number
  ): Promise<ArrayBuffer> => {
    this._logger.info(
      `Downloading artifact with {artifactId='${artifactId}'}...`
    );

    return <ArrayBuffer>(
      await this.octokit.rest.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: artifactId,
        archive_format: 'zip'
      })
    ).data;
  };

  public static getCommitIds = async (
    owner: string,
    repo: string,
    branch: string,
    since: Date
  ): Promise<string[]> => {
    const isoFormattedSince = since.toISOString();
    this._logger.debug(
      `Getting commits since '${isoFormattedSince}' for branch '${branch}'...`
    );

    return <string[]>(
      await this.octokit.paginate(
        this.octokit.rest.repos.listCommits,
        {
          owner,
          repo,
          sha: branch,
          since: isoFormattedSince,
          per_page: 100
        },
        response => response.data
      )
    ).map(commit => commit.sha);
  };

  public static getCommit = async (
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<Commit> => {
    this._logger.trace(`Getting commit with {ref='${commitSha}'}...`);

    return (
      await this.octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: commitSha
      })
    ).data;
  };

  public static getPullRequestCommitIds = async (
    owner: string,
    repo: string,
    pullRequestNumber: number
  ): Promise<string[]> => {
    this._logger.debug(
      `Getting commits for pull request with {pull_number='${pullRequestNumber}'}...`
    );

    return <string[]>(
      await this.octokit.paginate(
        this.octokit.rest.pulls.listCommits,
        {
          owner,
          repo,
          pull_number: pullRequestNumber
        },
        response => response.data
      )
    ).map(commit => commit.sha);
  };

  public static getDownloadLogsUrl = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<string | undefined> => {
    this._logger.info(
      `Downloading logs for workflow with {run_id='${workflowRunId}'}...`
    );

    const response = await this.octokit.rest.actions.downloadWorkflowRunLogs({
      owner: owner,
      repo,
      run_id: workflowRunId,
      archive_format: 'zip'
    });

    if (!response.url) {
      this._logger.warn(
        `Couldn't get the location of the logs files for workflow with {run_id='${workflowRunId}'}...`
      );
    }

    return response.url;
  };

  public static getWorkflowFile = async (
    owner: string,
    repo: string,
    workflowFileName: string,
    branchName?: string
  ): Promise<FileContent> => {
    this._logger.info(
      `Getting the configuration file for workflow with {workflowFileName='${workflowFileName}'}...`
    );

    const response = await this.octokit.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner: owner,
        repo: repo,
        path: `.github/workflows/${workflowFileName}`,
        ...(branchName && { ref: branchName })
      }
    );

    return <FileContent>response.data;
  };
}
