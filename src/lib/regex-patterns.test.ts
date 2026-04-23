import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRegexPatternPacks } from './regex-patterns';

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

test('fetchRegexPatternPacks keeps minimalistic available when the GitHub directory listing fails', async () => {
  const directoryUrl = 'https://api.github.com/repos/nobnobz/Omni-Template-Bot-Bid-Raiser/contents/Other?ref=main';
  const classicUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume.json';
  const coloredUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-colored.json';
  const copyUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-copy.json';
  const coloredCopyUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-colored-copy.json';
  const minimalisticUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/Other/fusion-tags-ume-minimalistic.json';

  const fetch = createMockFetch({
    [directoryUrl]: {
      ok: false,
      json: [],
    },
    [classicUrl]: {
      filters: [
        { name: 'Classic', imageURL: 'https://images.example/classic.png' },
      ],
      groups: [],
    },
    [coloredUrl]: {
      filters: [
        { name: 'Colored', imageURL: 'https://images.example/colored.png' },
      ],
      groups: [],
    },
    [copyUrl]: {
      filters: [
        { name: 'Classic Copy', imageURL: 'https://images.example/copy.png' },
      ],
      groups: [],
    },
    [coloredCopyUrl]: {
      filters: [
        { name: 'Colored Copy', imageURL: 'https://images.example/colored-copy.png' },
      ],
      groups: [],
    },
    [minimalisticUrl]: {
      filters: [
        { name: 'Minimalistic', imageURL: 'https://images.example/minimalistic.png' },
      ],
      groups: [],
    },
  });

  const packs = await fetchRegexPatternPacks(fetch);

  assert.equal(packs.some((pack) => pack.slug === 'minimalistic'), true);
  assert.equal(packs.find((pack) => pack.slug === 'minimalistic')?.title, 'Minimalistic');
});
