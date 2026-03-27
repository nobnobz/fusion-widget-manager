import { expect, test } from '@playwright/test';
import {
  getAuditFixture,
  serializeFixture,
} from '../fixtures/audit-fixtures';
import {
  dragWidget,
  gotoSeededSelectionPage,
  gotoWelcomePage,
  mockTemplateRepository,
  openExportDialog,
} from '../support/app-harness';
import {
  flushPerformanceReport,
  recordPerformanceMetric,
} from '../support/perf-report';

const budgets = {
  drag: 2_500,
  exportPreview: 4_000,
  importLargeFixture: 10_000,
  longTaskCount: 12,
  searchFilter: 1_500,
  titleTyping: 2_000,
};

test.afterAll(() => {
  flushPerformanceReport();
});

test.beforeEach(async ({ page }) => {
  await mockTemplateRepository(page, getAuditFixture('large'));
  await page.addInitScript(() => {
    const entries: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      entries.push(...list.getEntries());
    });

    observer.observe({ entryTypes: ['longtask'] });
    (window as Window & { __auditLongTasks?: PerformanceEntry[] }).__auditLongTasks = entries;
  });
});

test('records import and export preview timings for the large fixture', async ({ page }) => {
  const fixture = getAuditFixture('large');

  await gotoWelcomePage(page);
  await page.getByTestId('welcome-import-textarea').fill(serializeFixture(fixture));

  const importStart = Date.now();
  await page.getByTestId('welcome-load-configuration').click();
  await expect(page.getByTestId('new-widget-button')).toBeVisible();
  const importDuration = Date.now() - importStart;

  const exportStart = Date.now();
  await openExportDialog(page);
  const exportDuration = Date.now() - exportStart;

  const longTaskCount = await page.evaluate(() => {
    return ((window as Window & { __auditLongTasks?: PerformanceEntry[] }).__auditLongTasks || []).length;
  });

  recordPerformanceMetric({
    scenario: 'large-fixture',
    metric: 'import',
    value: importDuration,
    budget: budgets.importLargeFixture,
    unit: 'ms',
  });
  recordPerformanceMetric({
    scenario: 'large-fixture',
    metric: 'export-preview',
    value: exportDuration,
    budget: budgets.exportPreview,
    unit: 'ms',
  });
  recordPerformanceMetric({
    scenario: 'large-fixture',
    metric: 'long-tasks',
    value: longTaskCount,
    budget: budgets.longTaskCount,
    unit: 'count',
  });

  expect(importDuration).toBeLessThan(budgets.importLargeFixture);
  expect(exportDuration).toBeLessThan(budgets.exportPreview);
  expect(longTaskCount).toBeLessThanOrEqual(budgets.longTaskCount);
});

test('records search, editing, and drag timings on the stress fixture', async ({ page }) => {
  const fixture = getAuditFixture('stress');
  const firstWidget = fixture.config.widgets[0];
  const secondWidget = fixture.config.widgets[1];

  if (!firstWidget || !secondWidget) {
    throw new Error('Stress fixture does not have enough widgets.');
  }

  await gotoSeededSelectionPage(page, fixture);

  const searchStart = Date.now();
  await page.getByTestId('widget-search').fill(firstWidget.title);
  await expect(page.getByTestId(`widget-card-${firstWidget.id}`)).toBeVisible();
  const searchDuration = Date.now() - searchStart;

  await page.getByTestId('widget-card-' + firstWidget.id).click();
  const titleInput = page.getByLabel('Widget Title').first();
  const typingStart = Date.now();
  await titleInput.fill(`${firstWidget.title} Tuned`);
  const typingDuration = Date.now() - typingStart;

  await page.getByTestId('widget-search').fill('');
  const dragStart = Date.now();
  await dragWidget(page, firstWidget.id, secondWidget.id);
  const dragDuration = Date.now() - dragStart;

  recordPerformanceMetric({
    scenario: 'stress-fixture',
    metric: 'search-filter',
    value: searchDuration,
    budget: budgets.searchFilter,
    unit: 'ms',
  });
  recordPerformanceMetric({
    scenario: 'stress-fixture',
    metric: 'title-typing',
    value: typingDuration,
    budget: budgets.titleTyping,
    unit: 'ms',
  });
  recordPerformanceMetric({
    scenario: 'stress-fixture',
    metric: 'drag',
    value: dragDuration,
    budget: budgets.drag,
    unit: 'ms',
  });

  expect(searchDuration).toBeLessThan(budgets.searchFilter);
  expect(typingDuration).toBeLessThan(budgets.titleTyping);
  expect(dragDuration).toBeLessThan(budgets.drag);
});
