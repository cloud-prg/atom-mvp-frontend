import { mockApi } from './mockApi';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const demoMode = import.meta.env.VITE_DEMO_MODE !== 'false' || !apiBaseUrl;

export const api = mockApi;
export const runtime = {
  apiBaseUrl,
  demoMode,
  providerLabel: demoMode ? 'Demo providers' : 'API providers',
};

