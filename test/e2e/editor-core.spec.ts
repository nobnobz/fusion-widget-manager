import { expect, test } from '@playwright/test';
import {
  createMergeImportFixture,
  getAuditFixture,
  serializeFixture,
} from '../fixtures/audit-fixtures';
import {
  dragWidget,
  getWidgetTitles,
  gotoSeededSelectionPage,
  gotoWelcomePage,
  mockManifest,
  mockTemplateRepository,
  openExportDialog,
} from '../support/app-harness';

test.beforeEach(async ({ page }) => {
  await mockTemplateRepository(page, getAuditFixture('medium'));
});

test('imports a fixture from the welcome screen and opens export preview', async ({ page }) => {
  const fixture = getAuditFixture('small');
  const firstWidget = fixture.config.widgets[0]!;
  const lastWidget = fixture.config.widgets[fixture.config.widgets.length - 1]!;

  await gotoWelcomePage(page);
  await page.getByTestId('welcome-import-textarea').fill(serializeFixture(fixture));
  await page.getByTestId('welcome-load-configuration').click();

  await expect(page.getByTestId('new-widget-button')).toBeVisible();
  await expect(
    page.getByTestId(`widget-card-${firstWidget.id}`).getByRole('heading', { name: firstWidget.title }),
  ).toBeVisible();

  await page.getByTestId('widget-search').fill(firstWidget.title);
  await expect(page.getByTestId(`widget-card-${firstWidget.id}`)).toBeVisible();
  await expect(page.getByTestId(`widget-card-${lastWidget.id}`)).toHaveCount(0);

  await openExportDialog(page);
  await expect(page.getByTestId('export-preview-textarea')).toHaveValue(/"exportType": "fusionWidgets"/);
});

test('loads the mocked template, syncs the manifest, and creates a widget', async ({ page }) => {
  const fixture = getAuditFixture('medium');

  await mockManifest(page, fixture);
  await gotoWelcomePage(page);

  await expect(page.getByTestId('welcome-load-template')).toBeEnabled();
  await page.getByTestId('welcome-load-template').click();
  await expect(page.getByTestId('new-widget-button')).toBeVisible();

  if (!(await page.getByText('AIOMetadata synced').isVisible())) {
    await page.getByRole('button', { name: /Sync Manifest|Edit/i }).click();
    await page.getByTestId('manifest-url-input').fill(fixture.manifestUrl);
    await page.getByTestId('manifest-sync-submit').click();
  }

  await expect(page.getByText('AIOMetadata synced')).toBeVisible();

  await page.getByTestId('new-widget-button').click();
  await page.getByTestId('new-widget-title-input').fill('Audit Added Widget');
  await page.getByTestId('new-widget-submit').click();

  await expect(
    page.locator('[data-testid^="widget-card-"]').filter({ hasText: 'Audit Added Widget' }).first(),
  ).toBeVisible();
});

test('merges a partial import and keeps the result after reload', async ({ page }) => {
  const fixture = getAuditFixture('medium');
  const mergeFixture = createMergeImportFixture(fixture);

  await gotoSeededSelectionPage(page, fixture);

  await page.getByTestId('merge-import-button').click();
  await page.getByTestId('merge-import-textarea').fill(JSON.stringify(mergeFixture, null, 2));
  await page.getByTestId('merge-widgets-submit').click();

  await expect(page.getByText('Import successful!')).toBeVisible();
  await expect(page.getByText(/Added: 1/)).toBeVisible();

  await page.getByTestId('import-dialog-close').click();
  await expect(
    page.locator('[data-testid^="widget-card-"]').filter({ hasText: 'Audit Merge Widget' }).first(),
  ).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const raw = window.localStorage.getItem('fusion-widgets-config');
        if (!raw) {
          return false;
        }

        const parsed = JSON.parse(raw) as { widgets?: Array<{ title?: string }> };
        return Boolean(parsed.widgets?.some((widget) => widget.title === 'Audit Merge Widget'));
      });
    })
    .toBe(true);
  await page.reload();

  await expect(
    page.locator('[data-testid^="widget-card-"]').filter({ hasText: 'Audit Merge Widget' }).first(),
  ).toBeVisible();
});

test('moves a widget to trash and restores it', async ({ page }) => {
  test.skip(test.info().project.name === 'mobile-chrome', 'Trash actions use desktop-only affordances in the automated suite.');

  const fixture = getAuditFixture('small');
  const widgetId = fixture.config.widgets[0]!.id;

  await gotoSeededSelectionPage(page, fixture);

  await page.getByTestId(`widget-card-${widgetId}`).getByTitle('Move widget to trash').first().click();
  await expect(page.getByTestId(`widget-card-${widgetId}`)).toHaveCount(0);

  await page.getByRole('button', { name: /Trash \(/ }).click();
  await page.getByRole('button', { name: 'Restore' }).first().click();

  await expect(page.getByTestId(`widget-card-${widgetId}`)).toBeVisible();
});

test('reorders widgets through drag and drop on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Drag and drop is benchmarked with desktop pointer input.');

  const fixture = getAuditFixture('small');
  const [firstWidget, secondWidget] = fixture.config.widgets;
  if (!firstWidget || !secondWidget) {
    throw new Error('Fixture did not contain enough widgets for drag and drop.');
  }

  await gotoSeededSelectionPage(page, fixture);

  const before = await getWidgetTitles(page);
  await dragWidget(page, firstWidget.id, secondWidget.id);
  const after = await getWidgetTitles(page);

  expect(before[0]).toBe(firstWidget.title);
  expect(after[0]).toBe(secondWidget.title);
});
