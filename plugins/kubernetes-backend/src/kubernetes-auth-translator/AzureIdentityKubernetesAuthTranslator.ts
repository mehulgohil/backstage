/*
 * Copyright 2020 The Backstage Authors
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

import { Logger } from 'winston';
import { KubernetesAuthTranslator } from './types';
import { AzureClusterDetails } from '../types/types';
import {
  AccessToken,
  DefaultAzureCredential,
  TokenCredential,
} from '@azure/identity';

const aksScope = '6dae42f8-4368-4678-94ff-3960e28e3630/.default'; // This scope is the same for all Azure Managed Kubernetes

export class AzureIdentityKubernetesAuthTranslator
  implements KubernetesAuthTranslator
{
  private accessToken: AccessToken = { token: '', expiresOnTimestamp: 0 };
  private newToken: Promise<string> | undefined;

  constructor(
    private readonly logger: Logger,
    private readonly tokenCredential: TokenCredential = new DefaultAzureCredential(),
  ) {}

  async decorateClusterDetailsWithAuth(
    clusterDetails: AzureClusterDetails,
  ): Promise<AzureClusterDetails> {
    const clusterDetailsWithAuthToken: AzureClusterDetails = Object.assign(
      {},
      clusterDetails,
    );

    clusterDetailsWithAuthToken.serviceAccountToken = await this.getToken();
    return clusterDetailsWithAuthToken;
  }

  private async getToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken.token;
    }

    if (!this.newToken) {
      this.newToken = this.fetchNewToken();
    }

    return this.newToken;
  }

  private async fetchNewToken(): Promise<string> {
    try {
      this.logger.info('Fetching new Azure token for AKS');

      const newAccessToken = await this.tokenCredential.getToken(aksScope, {
        requestOptions: { timeout: 10_000 }, // 10 seconds
      });
      if (!newAccessToken) {
        throw new Error('AccessToken is null');
      }

      this.accessToken = newAccessToken;
    } catch (err) {
      this.logger.error('Unable to fetch Azure token', err);
      // don't throw the error, so the existing token will be re-used until we're able to fetch a new token
    }

    this.newToken = undefined;
    return this.accessToken.token;
  }

  private isTokenValid(): boolean {
    // Set tokens to expire 15 minutes before its actual expiry time
    const expiresOn = this.accessToken.expiresOnTimestamp - 15 * 60 * 1000;
    return expiresOn >= Date.now();
  }
}
