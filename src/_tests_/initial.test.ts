import { getOctokit } from '@actions/github';
import fs from 'fs';
import TestResources from '../test/TestResources';
import { Octane } from '@microfocus/alm-octane-js-rest-sdk';
import { GitHub } from '@actions/github/lib/utils';
import { sleep } from '../utils/utils';
import Query from '@microfocus/alm-octane-js-rest-sdk/dist/lib/query';
import CiServer from '../dto/octane/general/CiServer';
import { version } from 'os';

let octokit: InstanceType<typeof GitHub>;
let octane: Octane;
let config: any;
let owner: string;
let repo: string;
let sharedSpaceName: string;
let mainBranch: string;
let secondBranch: string;

let isSecondBranchCreated: boolean;

interface Workflow {
  id: number;
  name: string;
}

interface PullRequestDetails {
  numberOfPullRequests: number;
  numberOfCommits: number;
}

interface RepositoryDetails {
  default_branch: string;
}

const getRepository = async (
  owner: string,
  repo: string
): Promise<RepositoryDetails> => {
  return (
    await octokit.rest.repos.get({
      owner: owner,
      repo: repo
    })
  ).data;
};

const triggerWorkflowRun = async (
  owner: string,
  repo: string,
  workflowRunId: number,
  branch: string
): Promise<number> => {
  return (
    await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: owner,
        repo: repo,
        workflow_id: workflowRunId,
        ref: branch
      }
    )
  ).status;
};

const createCommit = async (branch: string) => {
  console.log('Creating a New Commit ....');

  const lastCommit = await octokit.request(
    'GET /repos/{owner}/{repo}/commits/{ref}',
    {
      owner: owner,
      repo: repo,
      ref: branch
    }
  );

  const blobUTF8 = await octokit.request(
    'POST /repos/{owner}/{repo}/git/blobs',
    {
      owner: owner,
      repo: repo,
      content: 'New Blob',
      encoding: 'utf-8'
    }
  );

  const tree = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
    owner: owner,
    repo: repo,
    base_tree: lastCommit.data.sha,
    tree: [
      {
        path: 'file.rb',
        mode: '100644',
        type: 'blob',
        sha: blobUTF8.data.sha
      }
    ]
  });

  const commit = await octokit.request(
    'POST /repos/{owner}/{repo}/git/commits',
    {
      owner: owner,
      repo: repo,
      message: 'my new test commit',
      author: {
        name: 'Madalin Tiutiu',
        email: 'Madalin.Tiutiu@microfocus.com',
        date: new Date().toISOString()
      },
      parents: [lastCommit.data.sha],
      tree: tree.data.sha
    }
  );

  await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
    owner: owner,
    repo: repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha
  });
};

const getWorkflowByName = async (
  owner: string,
  repo: string,
  workflowName: string
): Promise<Workflow[]> => {
  return (
    await octokit.paginate(
      octokit.rest.actions.listRepoWorkflows,
      {
        owner,
        repo,
        event: 'workflow',
        per_page: 100
      },
      response => response.data
    )
  ).filter(workflow => workflow.name === workflowName);
};

const runsToWait = async (
  owner: string,
  repo: string,
  status: 'queued' | 'in_progress' | 'requested'
): Promise<number> => {
  return (
    await octokit.paginate(
      octokit.rest.actions.listWorkflowRunsForRepo,
      {
        owner,
        repo,
        status: status,
        per_page: 100
      },
      response => response.data
    )
  ).length;
};

const pollForRunsToFinish = async (
  owner: string,
  repo: string
): Promise<void> => {
  let done = false;
  let retryCount = 2;
  while (!done) {
    const runsToWaitFor =
      (await runsToWait(owner, repo, 'in_progress')) +
      (await runsToWait(owner, repo, 'queued')) +
      (await runsToWait(owner, repo, 'requested'));
    if (runsToWaitFor === 0 && retryCount >= 0) {
      retryCount--;
    } else if (runsToWaitFor > 0) {
      retryCount = 2;
    }
    if (retryCount === -1) {
      done = true;
    }
    console.log(`${runsToWaitFor} runs still not completed!`);
    await sleep(3000);
  }
};

/* const escapeOctaneQueryValue = (q) => {
    return q && q.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
} */

const getCiServerOrCreate = async (
    createOnAbsence = true
  ): Promise<CiServer> => {
    const instanceId = `GHA-${owner}`;
    console.log(`Getting CI server with {instanceId='${instanceId}'}...`);
    try {
        const reqAll = octane.get('ci_servers').fields('instance_id,plugin_version,url');
        const allCiServers = await reqAll.execute();
        console.log(`CI servers total count = ${allCiServers.total_count}`);

        const ciServerQuery = Query.field('instance_id').equal(instanceId).build();
        const req = octane.get('ci_servers').fields('instance_id,plugin_version,url').query(ciServerQuery);
        const ciServers = await req.execute();
        if ( !ciServers || ciServers.total_count === 0 || ciServers.data.length === 0 ) {
            if (createOnAbsence) {
                return await createCiServer(instanceId);
            } else {
                throw new Error(`Failed to create CI Server with instanceId='${instanceId}'.`);
            }
        }
        return ciServers.data[0];
    } catch (error: Error | any) {
        console.error(error?.message);
        throw new Error(error?.message);
    }
};

const createCiServer = async (id:string): Promise<CiServer> => {
    console.log('Creating the CI Server...');
    try {
        let req = octane.create('ci_servers', {
                    name: id,
                    instance_id: id,
                    server_type: 'github_actions',
                    url: config.serverBaseUrl
                });
        let res = await req.fields('instance_id').execute();
        let ciServer = res.data[0];
        console.log(`CI Server = ${ciServer.id}`);
        return ciServer;
    } catch (error: Error | any) {
        console.error(error?.message);
        throw new Error(error?.message);
    }
};

const createBranch = async (rootBranch: string, newBranch: string) => {
  const lastCommit = await octokit.request(
    'GET /repos/{owner}/{repo}/commits/{ref}',
    {
      owner: owner,
      repo: repo,
      ref: rootBranch
    }
  );

  await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner: owner,
    repo: repo,
    ref: `refs/heads/${newBranch}`,
    sha: lastCommit.data.sha
  });
};

const createBranchAndPullRequest = async (branch: string) => {
  await createBranch(mainBranch, branch);
  await createCommit(branch);
  await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner: owner,
    repo: repo,
    title: 'Test Pull Request',
    head: branch,
    base: mainBranch
  });
};

beforeAll(async () => {
  config = JSON.parse(
    fs.readFileSync(TestResources.OCTANE_CONFIG_PATH).toString()
  );
/*  workflowsToRun = JSON.parse(
    fs.readFileSync(TestResources.WORKFLOW_TO_RUN_PATH).toString()
  );*/

  octane = new Octane({
    server: config.octaneUrl,
    sharedSpace: config.octaneSharedSpace,
    workspace: config.octaneWorkspace,
    user: config.octaneClientId,
    password: config.octaneClientSecret,
    headers: {
      'ALM-OCTANE-TECH-PREVIEW': true,
      'ALM-OCTANE-PRIVATE': true
    }
  });

  owner = config.serverBaseUrl.split('/').at(-2);
  repo = config.serverBaseUrl.split('/').at(-1);

  console.log(`Getting the Octokit instance...`);
  octokit = getOctokit(config.githubToken || process.env.GITHUB_TOKEN);

  console.log(`Getting the Octane workspace name...`);
  sharedSpaceName = (
    await octane.executeCustomRequest(
      `/api/shared_spaces?fields=name&query="id EQ ${config.octaneSharedSpace}"`,
      Octane.operationTypes.get
    )
  ).data[0].name;

  console.log(`Getting the default branch of the repository...`);
  mainBranch = (await getRepository(owner, repo)).default_branch;
  secondBranch = 'second-branch';
  isSecondBranchCreated = false;
});

afterEach(async () => {
/*   await octane
    .delete('ci_servers')
    .query(Query.field('name').equal(`GHA-${owner}`).build())
    .execute(); */

  if (isSecondBranchCreated) {
    await octokit.request('DELETE /repos/{owner}/{repo}/git/refs/{ref}', {
      owner: owner,
      repo: repo,
      ref: `heads/${secondBranch}`
    });
  }
});

describe('End to end integration tests', () => {
  jest.setTimeout(10 * 60 * 1000);
  test('Create CI Server Test', async () => {
    let ciServer = await getCiServerOrCreate();
    console.log(`Checking the results...`);
    expect(ciServer).toBeDefined();
    expect(ciServer.id).toBeDefined();
    expect(ciServer.instance_id).toBeDefined();
  });
});
