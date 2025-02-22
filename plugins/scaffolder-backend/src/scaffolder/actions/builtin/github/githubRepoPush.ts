/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';
import {
  GithubCredentialsProvider,
  ScmIntegrationRegistry,
} from '@backstage/integration';
import { Octokit } from 'octokit';
import { createTemplateAction } from '../../createTemplateAction';
import { parseRepoUrl } from '../publish/util';
import { getOctokitOptions, initRepoPushAndProtect } from './helpers';
import * as inputProps from './inputProperties';
import * as outputProps from './outputProperties';

/**
 * Creates a new action that initializes a git repository of the content in the workspace
 * and publishes it to GitHub.
 *
 * @public
 */
export function createGithubRepoPushAction(options: {
  integrations: ScmIntegrationRegistry;
  config: Config;
  githubCredentialsProvider?: GithubCredentialsProvider;
}) {
  const { integrations, config, githubCredentialsProvider } = options;

  return createTemplateAction<{
    repoUrl: string;
    description?: string;
    defaultBranch?: string;
    protectDefaultBranch?: boolean;
    protectEnforceAdmins?: boolean;
    gitCommitMessage?: string;
    gitAuthorName?: string;
    gitAuthorEmail?: string;
    requireCodeOwnerReviews?: boolean;
    requiredStatusCheckContexts?: string[];
    requireBranchesToBeUpToDate?: boolean;
    sourcePath?: string;
    token?: string;
  }>({
    id: 'github:repo:push',
    description:
      'Initializes a git repository of contents in workspace and publishes it to GitHub.',
    schema: {
      input: {
        type: 'object',
        required: ['repoUrl'],
        properties: {
          repoUrl: inputProps.repoUrl,
          requireCodeOwnerReviews: inputProps.requireCodeOwnerReviews,
          requiredStatusCheckContexts: inputProps.requiredStatusCheckContexts,
          requireBranchesToBeUpToDate: inputProps.requireBranchesToBeUpToDate,
          defaultBranch: inputProps.defaultBranch,
          protectDefaultBranch: inputProps.protectDefaultBranch,
          protectEnforceAdmins: inputProps.protectEnforceAdmins,
          gitCommitMessage: inputProps.gitCommitMessage,
          gitAuthorName: inputProps.gitAuthorName,
          gitAuthorEmail: inputProps.gitAuthorEmail,
          sourcePath: inputProps.sourcePath,
          token: inputProps.token,
        },
      },
      output: {
        type: 'object',
        properties: {
          remoteUrl: outputProps.remoteUrl,
          repoContentsUrl: outputProps.repoContentsUrl,
        },
      },
    },
    async handler(ctx) {
      const {
        repoUrl,
        defaultBranch = 'master',
        protectDefaultBranch = true,
        protectEnforceAdmins = true,
        gitCommitMessage = 'initial commit',
        gitAuthorName,
        gitAuthorEmail,
        requireCodeOwnerReviews = false,
        requiredStatusCheckContexts = [],
        requireBranchesToBeUpToDate = true,
        token: providedToken,
      } = ctx.input;

      const { owner, repo } = parseRepoUrl(repoUrl, integrations);

      if (!owner) {
        throw new InputError('Invalid repository owner provided in repoUrl');
      }

      const octokitOptions = await getOctokitOptions({
        integrations,
        credentialsProvider: githubCredentialsProvider,
        token: providedToken,
        repoUrl,
      });

      const client = new Octokit(octokitOptions);

      const targetRepo = await client.rest.repos.get({ owner, repo });

      const remoteUrl = targetRepo.data.clone_url;
      const repoContentsUrl = `${targetRepo.data.html_url}/blob/${defaultBranch}`;

      await initRepoPushAndProtect(
        remoteUrl,
        octokitOptions.auth,
        ctx.workspacePath,
        ctx.input.sourcePath,
        defaultBranch,
        protectDefaultBranch,
        protectEnforceAdmins,
        owner,
        client,
        repo,
        requireCodeOwnerReviews,
        requiredStatusCheckContexts,
        requireBranchesToBeUpToDate,
        config,
        ctx.logger,
        gitCommitMessage,
        gitAuthorName,
        gitAuthorEmail,
      );

      ctx.output('remoteUrl', remoteUrl);
      ctx.output('repoContentsUrl', repoContentsUrl);
    },
  });
}
