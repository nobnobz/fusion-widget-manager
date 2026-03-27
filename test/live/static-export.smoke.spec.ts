import { expect, test } from '@playwright/test';
import { getAuditFixture } from '../fixtures/audit-fixtures';
import {
  gotoSeededSelectionPage,
  mockTemplateRepository,
  openExportDialog,
} from '../support/app-harness';

test.beforeEach(async ({ page }) => {
  await mockTemplateRepository(page, getAuditFixture('small'));
});

test('static export keeps the editor interactive with seeded local storage', async ({ page }) => {
  const fixture = getAuditFixture('small');

  await gotoSeededSelectionPage(page, fixture);
  await expect(page.getByTestId('new-widget-button')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('new-widget-button')).toBeVisible();

  await openExportDialog(page);
  await expect(page.getByTestId('export-preview-textarea')).toHaveValue(/"widgets"/);
});
