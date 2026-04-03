import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertAiometadataImportToFusion,
  isAiometadataImportPayload,
} from './aiometadata-import';
import { parseFusionConfig, MANIFEST_PLACEHOLDER } from './widget-domain';

test('convertAiometadataImportToFusion detects AIOMetadata widget payloads', () => {
  const payload = {
    widgets: [
      {
        id: 'letterboxd.nVqt6',
        type: 'movie',
        name: 'Top 250 Films with the Most Fans',
        enabled: true,
        showInHome: true,
        source: 'letterboxd',
        cacheTTL: 86400,
        enableRatingPosters: true,
        metadata: {
          identifier: 'nVqt6',
        },
      },
    ],
  };

  assert.equal(isAiometadataImportPayload(payload), true);
  const converted = convertAiometadataImportToFusion(payload);
  assert.ok(converted);
  assert.equal(converted?.widgets.length, 1);
  assert.equal(converted?.widgets[0]?.type, 'row.classic');
  if (!converted || converted.widgets[0]?.type !== 'row.classic') {
    throw new Error('Expected row.classic widget.');
  }

  assert.equal(converted.widgets[0].title, 'Top 250 Films with the Most Fans');
  assert.equal(converted.widgets[0].cacheTTL, 86400);
  assert.equal(converted.widgets[0].presentation.badges.providers, false);
  assert.equal(converted.widgets[0].presentation.badges.ratings, true);
  assert.equal(converted.widgets[0].dataSource.kind, 'addonCatalog');
  if (converted.widgets[0].dataSource.kind !== 'addonCatalog') {
    throw new Error('Expected addon catalog payload.');
  }
  assert.equal(converted.widgets[0].dataSource.payload.addonId, MANIFEST_PLACEHOLDER);
  assert.equal(converted.widgets[0].dataSource.payload.catalogId, 'movie::letterboxd.nVqt6');
  assert.equal(converted.widgets[0].dataSource.payload.catalogType, 'movie');
});

test('isAiometadataImportPayload ignores normal fusion exports', () => {
  assert.equal(isAiometadataImportPayload({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'row-1',
        title: 'Normal Row',
        type: 'row.classic',
      },
    ],
  }), false);
});

test('isAiometadataImportPayload ignores unrelated widget arrays without letterboxd source', () => {
  assert.equal(isAiometadataImportPayload({
    widgets: [
      {
        id: 'row-1',
        name: 'Random Payload',
        type: 'movie',
      },
    ],
  }), false);
});

test('convertAiometadataImportToFusion prefers metadata.identifier and skips hidden entries', () => {
  const converted = convertAiometadataImportToFusion({
    widgets: [
      {
        id: 'letterboxd.WRONG',
        name: 'Imported',
        enabled: true,
        showInHome: true,
        source: 'letterboxd',
        metadata: {
          identifier: 'right-id',
        },
      },
      {
        id: 'letterboxd.hidden',
        name: 'Hidden',
        enabled: true,
        showInHome: false,
        source: 'letterboxd',
      },
    ],
  });

  assert.ok(converted);
  assert.equal(converted?.widgets.length, 1);
  if (!converted || converted.widgets[0]?.type !== 'row.classic') {
    throw new Error('Expected row.classic widget.');
  }

  assert.equal(converted.widgets[0].dataSource.kind, 'addonCatalog');
  if (converted.widgets[0].dataSource.kind !== 'addonCatalog') {
    throw new Error('Expected addon catalog payload.');
  }
  assert.equal(converted.widgets[0].dataSource.payload.catalogId, 'movie::letterboxd.right-id');
  assert.equal(converted.widgets[0].cacheTTL, 43200);
  assert.equal(converted.widgets[0].presentation.badges.ratings, true);
});

test('convertAiometadataImportToFusion supports catalog-only payloads and id fallback', () => {
  const converted = convertAiometadataImportToFusion({
    catalogs: [
      {
        id: 'letterboxd.5zIiY',
        type: 'movie',
        name: 'Shows',
        enabled: true,
        source: 'letterboxd',
        cacheTTL: 7200,
      },
    ],
  });

  assert.ok(converted);
  assert.equal(converted?.widgets.length, 1);
  if (!converted || converted.widgets[0]?.type !== 'row.classic') {
    throw new Error('Expected row.classic widget.');
  }

  assert.equal(converted.widgets[0].title, 'Shows');
  assert.equal(converted.widgets[0].cacheTTL, 7200);
  assert.equal(converted.widgets[0].dataSource.kind, 'addonCatalog');
  if (converted.widgets[0].dataSource.kind !== 'addonCatalog') {
    throw new Error('Expected addon catalog payload.');
  }
  assert.equal(converted.widgets[0].dataSource.payload.catalogId, 'movie::letterboxd.5zIiY');
});

test('parseFusionConfig normalizes imported letterboxd addon catalogs', () => {
  const parsed = parseFusionConfig({
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'row-letterboxd',
        title: 'Letterboxd',
        type: 'row.classic',
        cacheTTL: 86400,
        limit: 20,
        presentation: {
          aspectRatio: 'poster',
          cardStyle: 'medium',
          badges: {
            providers: false,
            ratings: true,
          },
        },
        dataSource: {
          kind: 'addonCatalog',
          payload: {
            addonId: MANIFEST_PLACEHOLDER,
            catalogId: 'movie::letterboxd.nVqt6',
            catalogType: 'movie',
          },
        },
      },
    ],
  });

  if (parsed.widgets[0]?.type !== 'row.classic') {
    throw new Error('Expected row.classic widget.');
  }

  assert.equal(parsed.widgets[0].dataSource.kind, 'addonCatalog');
  if (parsed.widgets[0].dataSource.kind !== 'addonCatalog') {
    throw new Error('Expected addon catalog payload.');
  }
  assert.equal(parsed.widgets[0].dataSource.payload.catalogId, 'movie::letterboxd.nVqt6');
  assert.equal(parsed.widgets[0].dataSource.payload.catalogType, 'movie');
});
