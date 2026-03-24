import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FALLBACK_TEMPLATE_URLS,
  fetchTemplateRepository,
  requiresDownloadActionPrompt,
  type FetchLike,
} from './template-repository';

interface MockResponseConfig {
  json?: unknown;
  ok?: boolean;
  text?: string;
}

function createMockFetch(
  responses: Record<string, unknown | MockResponseConfig>,
  requests: string[] = [],
): FetchLike {
  return async (input: string) => {
    requests.push(input);

    if (!(input in responses)) {
      throw new Error(`Unexpected fetch: ${input}`);
    }

    const payload = responses[input];
    const isConfiguredResponse = payload !== null
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && ('ok' in payload || 'json' in payload || 'text' in payload);

    const responseConfig = isConfiguredResponse
      ? payload as MockResponseConfig
      : { json: payload };

    const jsonPayload = responseConfig.json;
    const textPayload = responseConfig.text ?? (
      typeof jsonPayload === 'string' ? jsonPayload : JSON.stringify(jsonPayload)
    );

    return {
      ok: responseConfig.ok ?? true,
      async json() {
        return jsonPayload;
      },
      async text() {
        return textPayload;
      },
    };
  };
}

test('fetchTemplateRepository uses the manifest as the primary source when it is valid', async () => {
  const requests: string[] = [];
  const fetch = createMockFetch({
    'https://api.test/manifest.json': {
      generatedAt: '2026-03-24T18:19:31.633Z',
      templates: [
        {
          id: 'ume-omni-template-v2.1.1.json',
          name: 'UME Omni Template v2.1.1',
          url: 'https://raw.test/ume-omni-template-v2.1.1.json',
          version: 'v2.1.1',
          isDefault: true,
        },
        {
          id: 'ume-omni-template-v2.0.0.json',
          name: 'UME Omni Template v2.0.0',
          url: 'https://raw.test/ume-omni-template-v2.0.0.json',
          version: '2.0.0',
        },
        {
          id: 'ume-aiometadata-config-v2.1.json',
          name: 'UME AIOMetadata Config v2.1',
          url: 'https://raw.test/ume-aiometadata-config-v2.1.json',
          version: 'v2.1',
        },
        {
          id: 'ume-aiometadata-catalogs-only-v2.1.json',
          name: 'UME AIOMetadata Catalogs Only v2.1',
          url: 'https://raw.test/ume-aiometadata-catalogs-only-v2.1.json',
          version: 'v2.1',
        },
        {
          id: 'ume-aiostreams-template-v1.7.json',
          name: 'UME AIOStreams Template v1.7',
          url: 'https://raw.test/ume-aiostreams-template-v1.7.json',
          version: '1.7',
        },
      ],
    },
  }, requests);

  const repository = await fetchTemplateRepository(
    fetch,
    'https://api.test/root',
    'https://api.test/manifest.json',
  );

  assert.equal(repository.defaultFusionTemplate?.rawUrl, 'https://raw.test/ume-omni-template-v2.1.1.json');
  assert.deepEqual(
    repository.fusionTemplates.map((template) => template.version),
    ['v2.1.1', 'v2.0.0'],
  );
  assert.equal(repository.aiometadataTemplate?.rawUrl, 'https://raw.test/ume-aiometadata-config-v2.1.json');
  assert.equal(repository.aiometadataCatalogsOnlyTemplate?.rawUrl, 'https://raw.test/ume-aiometadata-catalogs-only-v2.1.json');
  assert.equal(repository.aiostreamsTemplate?.rawUrl, 'https://raw.test/ume-aiostreams-template-v1.7.json');
  assert.deepEqual(requests, ['https://api.test/manifest.json']);
});

test('fetchTemplateRepository supplements missing manifest kinds from the repository scan before fixed fallbacks', async () => {
  const fetch = createMockFetch({
    'https://api.test/manifest.json': {
      templates: [
        {
          id: 'ume-omni-template-v2.1.1.json',
          name: 'UME Omni Template v2.1.1',
          url: 'https://raw.test/ume-omni-template-v2.1.1.json',
          version: 'v2.1.1',
          isDefault: true,
        },
      ],
    },
    'https://api.test/root': [
      {
        name: 'ume-aiometadata-config-v2.1.json',
        path: 'ume-aiometadata-config-v2.1.json',
        type: 'file',
        url: 'https://api.test/root/ume-aiometadata-config-v2.1.json',
        download_url: 'https://raw.test/ume-aiometadata-config-v2.1.json',
      },
      {
        name: 'ume-aiometadata-catalogs-only-v2.1.json',
        path: 'ume-aiometadata-catalogs-only-v2.1.json',
        type: 'file',
        url: 'https://api.test/root/ume-aiometadata-catalogs-only-v2.1.json',
        download_url: 'https://raw.test/ume-aiometadata-catalogs-only-v2.1.json',
      },
      {
        name: 'ume-aiostreams-template-v1.7.json',
        path: 'ume-aiostreams-template-v1.7.json',
        type: 'file',
        url: 'https://api.test/file/aiostreams.json',
        download_url: 'https://raw.test/ume-aiostreams-template-v1.7.json',
      },
    ],
    'https://api.test/file/aiostreams.json': {
      encoding: 'base64',
      content: Buffer.from(JSON.stringify({ version: '1.7.0' }), 'utf8').toString('base64'),
    },
  });

  const repository = await fetchTemplateRepository(
    fetch,
    'https://api.test/root',
    'https://api.test/manifest.json',
  );

  assert.equal(repository.defaultFusionTemplate?.rawUrl, 'https://raw.test/ume-omni-template-v2.1.1.json');
  assert.equal(repository.aiometadataTemplate?.rawUrl, 'https://raw.test/ume-aiometadata-config-v2.1.json');
  assert.equal(repository.aiometadataCatalogsOnlyTemplate?.rawUrl, 'https://raw.test/ume-aiometadata-catalogs-only-v2.1.json');
  assert.equal(repository.aiostreamsTemplate?.rawUrl, 'https://raw.test/ume-aiostreams-template-v1.7.json');
});

test('fetchTemplateRepository falls back to the repository scan when the manifest is invalid', async () => {
  const fetch = createMockFetch({
    'https://api.test/manifest.json': {
      generatedAt: '2026-03-24T18:19:31.633Z',
      templates: {},
    },
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

  const repository = await fetchTemplateRepository(
    fetch,
    'https://api.test/root',
    'https://api.test/manifest.json',
  );

  assert.equal(repository.defaultFusionTemplate?.rawUrl, 'https://raw.test/fusion-v2.1.0.json');
  assert.equal(repository.defaultFusionTemplate?.version, 'v2.1.0');
  assert.equal(repository.aiostreamsTemplate?.rawUrl, 'https://raw.test/aiostreams-root.json');
  assert.equal(repository.aiostreamsTemplate?.version, 'v2.1.1');
});

test('fetchTemplateRepository falls back to fixed URLs when manifest and repository scan both fail', async () => {
  const fetch = createMockFetch({
    'https://api.test/manifest.json': {
      ok: false,
    },
    'https://api.test/root': {
      ok: false,
    },
  });

  const repository = await fetchTemplateRepository(
    fetch,
    'https://api.test/root',
    'https://api.test/manifest.json',
  );

  assert.equal(repository.defaultFusionTemplate?.rawUrl, FALLBACK_TEMPLATE_URLS.fusion);
  assert.equal(repository.aiometadataTemplate?.rawUrl, FALLBACK_TEMPLATE_URLS.aiometadata);
  assert.equal(repository.aiometadataCatalogsOnlyTemplate?.rawUrl, FALLBACK_TEMPLATE_URLS['aiometadata-catalogs-only']);
  assert.equal(repository.aiostreamsTemplate?.rawUrl, FALLBACK_TEMPLATE_URLS.aiostreams);
});

test('requiresDownloadActionPrompt only prompts for AIOStreams templates', () => {
  assert.equal(requiresDownloadActionPrompt('fusion'), false);
  assert.equal(requiresDownloadActionPrompt('aiometadata'), false);
  assert.equal(requiresDownloadActionPrompt('aiometadata-catalogs-only'), false);
  assert.equal(requiresDownloadActionPrompt('aiostreams'), true);
});

test('AIOStreams falls back to raw JSON when the repository scan content API version lookup fails', async () => {
  const fetch = createMockFetch({
    'https://api.test/manifest.json': {
      ok: false,
    },
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

  const repository = await fetchTemplateRepository(
    fetch,
    'https://api.test/root',
    'https://api.test/manifest.json',
  );

  assert.equal(repository.aiostreamsTemplate?.version, 'v2.1.1');
});
