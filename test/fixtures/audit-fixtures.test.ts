import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditFixtures,
  createMergeImportFixture,
  createStoredAppState,
  malformedFixtures,
} from './audit-fixtures';

test('audit fixture sizes scale up from small to stress', () => {
  assert.ok(auditFixtures.small.config.widgets.length < auditFixtures.medium.config.widgets.length);
  assert.ok(auditFixtures.medium.config.widgets.length < auditFixtures.large.config.widgets.length);
  assert.ok(auditFixtures.large.config.widgets.length < auditFixtures.stress.config.widgets.length);
});

test('stored app state mirrors the local storage keys expected by the app', () => {
  const storedState = createStoredAppState(auditFixtures.small);

  assert.equal(typeof storedState['fusion-widgets-config'], 'string');
  assert.equal(typeof storedState['fusion-widget-manifest-catalogs'], 'string');
  assert.equal(typeof storedState['fusion-widget-manifest-content'], 'string');
});

test('merge import fixture contains one duplicate and one new widget', () => {
  const mergeFixture = createMergeImportFixture(auditFixtures.medium);

  assert.equal(mergeFixture.widgets.length, 2);
  assert.equal(mergeFixture.widgets[0]?.title, auditFixtures.medium.config.widgets[0]?.title);
  assert.equal(mergeFixture.widgets[1]?.title, 'Audit Merge Widget');
});

test('malformed fixtures cover invalid JSON and structural errors', () => {
  assert.match(malformedFixtures.invalidJsonText, /widgets/);

  const missingExportType = JSON.parse(malformedFixtures.missingExportType);
  assert.equal(Array.isArray(missingExportType.widgets), true);
  assert.equal('exportType' in missingExportType, false);
});
