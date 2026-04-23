import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAnimatedCoverWidgetTemplateUrl } from './animated-covers';

interface MockResponseConfig {
  json?: unknown;
  ok?: boolean;
}

function createMockFetch(
  responses: Record<string, unknown | MockResponseConfig>,
): (input: string, init?: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }> {
  return async (input: string) => {
    if (!(input in responses)) {
      throw new Error(`Unexpected fetch: ${input}`);
    }

    const payload = responses[input];
    const isConfiguredResponse = payload !== null
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && ('ok' in payload || 'json' in payload);

    const responseConfig = isConfiguredResponse
      ? payload as MockResponseConfig
      : { json: payload };

    return {
      ok: responseConfig.ok ?? true,
      async json() {
        return responseConfig.json;
      },
    };
  };
}

test('fetchAnimatedCoverWidgetTemplateUrl prefers the newest UME snapshot over an older default', async () => {
  const manifestUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/template-manifest.json';
  const newestSnapshotUrl = 'https://raw.test/ume-omni-template-v3.1.0.json';

  const fetch = createMockFetch({
    [manifestUrl]: {
      templates: [
        {
          id: 'ume-omni-template-v2.1.1.json',
          isDefault: true,
          name: 'UME Omni Template v2.1.1',
          url: 'https://raw.test/ume-omni-template-v2.1.1.json',
          version: 'v2.1.1',
        },
        {
          id: 'ume-omni-template-v3.1.0.json',
          name: 'UME Omni Template v3.1.0',
          url: newestSnapshotUrl,
          version: 'v3.1.0',
        },
      ],
    },
  });

  const selectedUrl = await fetchAnimatedCoverWidgetTemplateUrl(fetch);

  assert.equal(selectedUrl, newestSnapshotUrl);
});
