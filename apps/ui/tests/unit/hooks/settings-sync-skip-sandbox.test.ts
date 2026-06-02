/**
 * Regression test: skipSandboxWarning must survive the
 * sync → localStorage cache → startup hydrate round-trip.
 *
 * Bug (historical):
 *   skipSandboxWarning was missing from SETTINGS_FIELDS_TO_SYNC in use-settings-sync.ts.
 *   Every settings sync rewrote the `automaker-settings-cache` localStorage entry from
 *   that list, so the flag was silently dropped from the cache. On the next startup the
 *   FAST_HYDRATE path (__root.tsx) hydrates skipSandboxWarning ONLY from that cache, so
 *   it reverted to the default `false` and the "Sandbox Environment Not Detected" dialog
 *   reappeared on every server/page restart — even after the user checked
 *   "Do not show this warning again". The value was correct on the server the whole time.
 *
 * These tests exercise the real sync code path (forceSyncSettingsToServer) and the real
 * startup read-back path (parseLocalStorageSettings + hydrateStoreFromSettings).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the HTTP client so forceSyncSettingsToServer() performs no real network call.
const updateGlobalMock = vi.fn();
vi.mock('@/lib/http-api-client', () => ({
  getHttpApiClient: () => ({ settings: { updateGlobal: updateGlobalMock } }),
  waitForApiKeyInit: vi.fn().mockResolvedValue(undefined),
}));

import { useAppStore } from '@/store/app-store';
import { forceSyncSettingsToServer } from '@/hooks/use-settings-sync';
import {
  parseLocalStorageSettings,
  hydrateStoreFromSettings,
} from '@/hooks/use-settings-migration';
import type { GlobalSettings } from '@automaker/types';

const CACHE_KEY = 'automaker-settings-cache';

describe('skipSandboxWarning sync round-trip', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // mockReset is enabled globally, so (re)install the resolved value each test.
    updateGlobalMock.mockResolvedValue({ success: true });
    useAppStore.setState({ skipSandboxWarning: false });
  });

  it('sends skipSandboxWarning to the server and writes it to the startup cache on sync', async () => {
    useAppStore.setState({ skipSandboxWarning: true });

    const ok = await forceSyncSettingsToServer();
    expect(ok).toBe(true);

    // It must be part of the payload synced to the server...
    const sentToServer = updateGlobalMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sentToServer.skipSandboxWarning).toBe(true);

    // ...and, crucially, written into the localStorage cache the FAST_HYDRATE
    // startup path reads from. Before the fix this key was absent.
    const cacheRaw = window.localStorage.getItem(CACHE_KEY);
    expect(cacheRaw).toBeTruthy();
    expect((JSON.parse(cacheRaw as string) as GlobalSettings).skipSandboxWarning).toBe(true);
  });

  it('restores skipSandboxWarning=true from the cache on the next startup hydrate', async () => {
    useAppStore.setState({ skipSandboxWarning: true });
    await forceSyncSettingsToServer();

    // Simulate a fresh page load: reset the store to its default, then hydrate
    // from the cache exactly like the FAST_HYDRATE startup path does.
    useAppStore.setState({ skipSandboxWarning: false });

    const cached = parseLocalStorageSettings();
    expect(cached?.skipSandboxWarning).toBe(true);

    hydrateStoreFromSettings(cached as GlobalSettings);
    expect(useAppStore.getState().skipSandboxWarning).toBe(true);
  });
});
