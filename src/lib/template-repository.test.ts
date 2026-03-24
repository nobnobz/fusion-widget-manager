import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchTemplateRepository,
  requiresDownloadActionPrompt,
  type FetchLike,
} from './template-repository';

function createMockFetch(responses: Record<string, unknown>): FetchLike {
  return async (input: string) => {
    if (!(input in responses)) {
      throw new Error(`Unexpected fetch: ${input}`);
    }

    const payload = responses[input];
    return {
      ok: true,
      async json() {
        return payload;
      },
      async text() {
        return typeof payload === 'string' ? payload : JSON.stringify(payload);
      },
    };
  };
}

test('fetchTemplateRepository prefers versions from JSON content and falls back to filenames', async () => {
  const fetch = createMockFetch({
    'https://api.test/root': [
      {
        name: 'ume-omni-template-v1.0.0.json',
        path: 'ume-omni-template-v1.0.0.json',
        type: 'file',
        url: 'https://api.test/root/ume-omni-template-v1.0.0.json',
        download_url: 'https://raw.test/fusion.json',
      },
      {
        name: 'ume-aiometadata-config-v1.5.0.json',
        path: 'ume-aiometadata-config-v1.5.0.json',
        type: 'file',
        url: 'https://api.test/root/ume-aiometadata-config-v1.5.0.json',
        download_url: 'https://raw.test/aiometadata.json',
      },
      {
        name: 'ume-aiometadata-catalogs-only-v1.4.0.json',
        path: 'ume-aiometadata-catalogs-only-v1.4.0.json',
        type: 'file',
        url: 'https://api.test/root/ume-aiometadata-catalogs-only-v1.4.0.json',
        download_url: 'https://raw.test/aiometadata-catalogs-only.json',
      },
      {
        name: 'ume-aiostreams-template-latest.json',
        path: 'ume-aiostreams-template-latest.json',
        type: 'file',
        url: 'https://api.test/file/aiostreams.json',
        download_url: 'https://raw.test/aiostreams.json',
      },
    ],
    'https://api.test/file/aiostreams.json': {
      encoding: 'base64',
      content: Buffer.from(JSON.stringify({ version: '2.1.1' }), 'utf8').toString('base64'),
    },
  });

  const repository = await fetchTemplateRepository(fetch, 'https://api.test/root');

  assert.equal(repository.defaultFusionTemplate?.version, 'v1.0.0');
  assert.equal(repository.aiometadataTemplate?.version, 'v1.5.0');
  assert.equal(repository.aiometadataCatalogsOnlyTemplate?.version, 'v1.4.0');
  assert.equal(repository.aiostreamsTemplate?.version, 'v2.1.1');
});

test('fetchTemplateRepository chooses the newest actual version instead of the root file', async () => {
  const fetch = createMockFetch({
    'https://api.test/root': [
      {
        name: 'ume-omni-template.json',
        path: 'ume-omni-template.json',
        type: 'file',
        url: 'https://api.test/root/ume-omni-template.json',
        download_url: 'https://raw.test/fusion-root.json',
      },
      {
        name: 'ume-aiostreams-template.json',
        path: 'ume-aiostreams-template.json',
        type: 'file',
        url: 'https://api.test/file/aiostreams-root.json',
        download_url: 'https://raw.test/aiostreams-root.json',
      },
      {
        name: 'Older Versions',
        path: 'Older Versions',
        type: 'dir',
        url: 'https://api.test/root/older',
        download_url: null,
      },
    ],
    'https://api.test/root/older': [
      {
        name: 'ume-omni-template-v2.1.0.json',
        path: 'Older Versions/ume-omni-template-v2.1.0.json',
        type: 'file',
        url: 'https://api.test/root/older/ume-omni-template-v2.1.0.json',
        download_url: 'https://raw.test/fusion-v2.1.0.json',
      },
      {
        name: 'ume-aiostreams-template-v3.0.0.json',
        path: 'Older Versions/ume-aiostreams-template-v3.0.0.json',
        type: 'file',
        url: 'https://api.test/file/aiostreams-v3.0.0.json',
        download_url: 'https://raw.test/aiostreams-v3.0.0.json',
      },
    ],
    'https://api.test/file/aiostreams-root.json': {
      encoding: 'base64',
      content: Buffer.from('{"version":"2.1.1",}', 'utf8').toString('base64'),
    },
    'https://api.test/file/aiostreams-v3.0.0.json': {
      encoding: 'base64',
      content: Buffer.from('{"version":"1.7.0",}', 'utf8').toString('base64'),
    },
  });

  const repository = await fetchTemplateRepository(fetch, 'https://api.test/root');

  assert.equal(repository.defaultFusionTemplate?.rawUrl, 'https://raw.test/fusion-v2.1.0.json');
  assert.equal(repository.defaultFusionTemplate?.version, 'v2.1.0');
  assert.equal(repository.aiostreamsTemplate?.rawUrl, 'https://raw.test/aiostreams-root.json');
  assert.equal(repository.aiostreamsTemplate?.version, 'v2.1.1');
});

test('requiresDownloadActionPrompt only prompts for AIOStreams templates', () => {
  assert.equal(requiresDownloadActionPrompt('fusion'), false);
  assert.equal(requiresDownloadActionPrompt('aiometadata'), false);
  assert.equal(requiresDownloadActionPrompt('aiometadata-catalogs-only'), false);
  assert.equal(requiresDownloadActionPrompt('aiostreams'), true);
});

test('AIOMetadata keeps using the filename even if the file content has a different version', async () => {
  const fetch = createMockFetch({
    'https://api.test/root': [
      {
        name: 'ume-aiometadata-config-v2.1.json',
        path: 'ume-aiometadata-config-v2.1.json',
        type: 'file',
        url: 'https://api.test/file/aiometadata.json',
        download_url: 'https://raw.test/aiometadata.json',
      },
    ],
  });

  const repository = await fetchTemplateRepository(fetch, 'https://api.test/root');

  assert.equal(repository.aiometadataTemplate?.version, 'v2.1');
});

test('AIOMetadata catalogs-only templates are tracked separately from the full config template', async () => {
  const fetch = createMockFetch({
    'https://api.test/root': [
      {
        name: 'ume-aiometadata-config-v2.1.json',
        path: 'ume-aiometadata-config-v2.1.json',
        type: 'file',
        url: 'https://api.test/file/aiometadata-full.json',
        download_url: 'https://raw.test/aiometadata-full.json',
      },
      {
        name: 'ume-aiometadata-catalogs-only-v2.3.json',
        path: 'ume-aiometadata-catalogs-only-v2.3.json',
        type: 'file',
        url: 'https://api.test/file/aiometadata-catalogs-only.json',
        download_url: 'https://raw.test/aiometadata-catalogs-only.json',
      },
    ],
  });

  const repository = await fetchTemplateRepository(fetch, 'https://api.test/root');

  assert.equal(repository.aiometadataTemplate?.filename, 'ume-aiometadata-config-v2.1.json');
  assert.equal(repository.aiometadataCatalogsOnlyTemplate?.filename, 'ume-aiometadata-catalogs-only-v2.3.json');
});

test('AIOStreams falls back to raw JSON when the GitHub contents API version lookup fails', async () => {
  const fetch = createMockFetch({
    'https://api.test/root': [
      {
        name: 'ume-aiostreams-template-v1.7.json',
        path: 'ume-aiostreams-template-v1.7.json',
        type: 'file',
        url: 'https://api.test/file/aiostreams.json',
        download_url: 'https://raw.test/aiostreams.json',
      },
    ],
    'https://api.test/file/aiostreams.json': {
      encoding: 'utf8',
      content: '{"version":"broken"}',
    },
    'https://raw.test/aiostreams.json': '{"version":"2.1.1",}',
  });

  const repository = await fetchTemplateRepository(fetch, 'https://api.test/root');

  assert.equal(repository.aiostreamsTemplate?.version, 'v2.1.1');
});
