import { describe, expect, it } from 'vitest';
import { selectApiClient } from './client';
import { mockApi } from './mockApi';

describe('selectApiClient', () => {
  it('uses mock API when demo mode is enabled', () => {
    expect(selectApiClient({ apiBaseUrl: 'http://localhost:8000', demoMode: true })).toBe(mockApi);
  });

  it('uses mock API when no API base URL is configured', () => {
    expect(selectApiClient({ demoMode: false })).toBe(mockApi);
  });

  it('uses real API when demo mode is disabled and API base URL exists', () => {
    expect(selectApiClient({ apiBaseUrl: 'http://localhost:8000', demoMode: false })).not.toBe(mockApi);
  });
});
