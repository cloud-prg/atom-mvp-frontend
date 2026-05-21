import { mockApi } from './mockApi';
import { createRealApi } from './realApi';
import type { ApiClient } from './types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const demoMode = import.meta.env.VITE_DEMO_MODE !== 'false' || !apiBaseUrl;
const oauthBaseUrl = apiBaseUrl || 'http://127.0.0.1:8000';

export function selectApiClient(options: { apiBaseUrl?: string; demoMode: boolean }): ApiClient {
  if (options.demoMode || !options.apiBaseUrl) {
    return mockApi;
  }
  return createRealApi({ baseUrl: options.apiBaseUrl });
}

export const api = selectApiClient({ apiBaseUrl, demoMode });
export const runtime = {
  apiBaseUrl,
  demoMode,
  githubLoginUrl: `${oauthBaseUrl.replace(/\/+$/, '')}/api/auth/oauth/github/login`,
  providerLabel: demoMode ? 'Demo providers' : 'API providers',
};
