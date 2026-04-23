import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchAnimatedCoverWidgetBlueprints,
  fetchAnimatedCoverWidgetTemplateUrl,
  type AnimatedCoverPack,
} from './animated-covers';

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

test('fetchAnimatedCoverWidgetBlueprints prefers the snapshot cover image over the pack fallback', async () => {
  const manifestUrl = 'https://raw.githubusercontent.com/nobnobz/Omni-Template-Bot-Bid-Raiser/main/template-manifest.json';
  const snapshotUrl = 'https://raw.test/ume-omni-template-v3.1.json';
  const currentSnapshotBackgroundUrl = 'https://images.example/netflix-current.png';
  const stalePackBackgroundUrl = 'https://images.example/netflix-stale.png';

  const fetch = createMockFetch({
    [manifestUrl]: {
      templates: [
        {
          id: 'ume-omni-template-v3.1.json',
          isDefault: true,
          name: 'UME Omni Template v3.1',
          url: snapshotUrl,
          version: 'v3.1',
        },
      ],
    },
    [snapshotUrl]: {
      name: 'Unified Media Experience (UME) v3.1',
      date: '2026-04-22T17:07:10.116Z',
      includedKeys: [],
      values: {
        main_group_order: ['streaming'],
        main_catalog_groups: {
          streaming: {
            name: 'Streaming Services',
            posterType: 'Poster',
            subgroupNames: ['netflix'],
          },
        },
        subgroup_order: {
          streaming: ['netflix'],
        },
        catalog_groups: {
          netflix: {
            catalogs: ['movie::mdblist.netflix'],
          },
        },
        catalog_group_image_urls: {
          netflix: currentSnapshotBackgroundUrl,
        },
      },
    },
  });

  const packs: AnimatedCoverPack[] = [
    {
      coverCount: 1,
      covers: [
        {
          id: 'netflix',
          title: 'Netflix',
          videoURL: 'https://images.example/netflix.mp4',
          backgroundURL: stalePackBackgroundUrl,
        },
      ],
      defaultPreviewIndex: 0,
      filename: 'fusion-animated-covers-services.json',
      path: 'Other/fusion-animated-covers-services.json',
      previewImageUrl: stalePackBackgroundUrl,
      previewVideoUrl: 'https://images.example/netflix.mp4',
      rawUrl: 'https://raw.test/fusion-animated-covers-services.json',
      slug: 'services',
      title: 'Streaming Services',
    },
  ];

  const bundle = await fetchAnimatedCoverWidgetBlueprints(packs, fetch);
  const blueprint = bundle.blueprints.services;

  assert.ok(blueprint);
  assert.equal(blueprint.matchedCoverBackgroundUrls[0], currentSnapshotBackgroundUrl);
  assert.equal(blueprint.widget.dataSource.payload.items[0]?.backgroundImageURL, currentSnapshotBackgroundUrl);
});
