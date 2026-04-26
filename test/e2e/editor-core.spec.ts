import { expect, test } from '@playwright/test';
import {
  createStoredAppState,
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

test('opens the Fusion setup guide with dynamic template and recommended AIOMetadata instances', async ({ page }) => {
  await gotoWelcomePage(page);

  await page.locator('[data-testid^="open-setup-guide"]:visible').first().click();

  const guide = page.getByTestId('fusion-setup-guide');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Fusion Setup Guide');
  await expect(guide).toContainText('Load a setup');
  await expect(guide).toContainText('Export the required AIOMetadata catalogs');
  await expect(guide).toContainText('Add the catalogs to AIOMetadata');
  await expect(guide).toContainText('Sync your manifest in Fusion Manager');
  await expect(guide).toContainText('Export to Fusion');

  const stableLink = guide.getByRole('link', { name: /AIOMetadata Midnight/i });
  await expect(stableLink).toHaveAttribute('href', 'https://aiometadatafortheweebs.midnightignite.me/configure/');

  const nightlyLink = guide.getByRole('link', { name: /AIOMetadata Yeb/i });
  await expect(nightlyLink).toHaveAttribute('href', 'https://aiometadata.fortheweak.cloud/configure/');

  const templateButton = guide.getByRole('button', { name: /UME AIOMetadata Template v9\.9\.9/i });
  await expect(templateButton).toBeVisible();
});

test('opens the AIOS UME formatter modal from the welcome screen', async ({ page }) => {
  await gotoWelcomePage(page);

  await expect(page.getByTestId('featured-formatter-card')).toBeVisible();

  await page.getByTestId('featured-formatter-card').click();

  const formatterDialog = page.locator('[role="dialog"]').filter({ hasText: 'UME Formatter for AIOStreams' }).last();
  await expect(formatterDialog).toBeVisible();
  await expect(formatterDialog).toContainText('Copy URL');
  await expect(formatterDialog).toContainText('go to Formatter, tap the import icon');
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

test('disconnects a synced AIOMetadata manifest from the setup modal', async ({ page }) => {
  const fixture = getAuditFixture('medium');

  await mockManifest(page, fixture);
  await gotoWelcomePage(page);

  await page.getByTestId('welcome-load-template').click();
  if (!(await page.getByText('AIOMetadata synced').isVisible())) {
    await page.getByRole('button', { name: /Sync Manifest|Edit/i }).click();
    const manifestUrlField = page.getByTestId('manifest-url-input');
    const manifestUrlFieldTag = await manifestUrlField.evaluate((element) => element.tagName);

    if (manifestUrlFieldTag === 'INPUT' || manifestUrlFieldTag === 'TEXTAREA') {
      await manifestUrlField.fill(fixture.manifestUrl);
      await page.getByTestId('manifest-sync-submit').click();
    }
  }

  await expect(page.getByText('AIOMetadata synced')).toBeVisible();

  await page.getByTestId('manifest-settings-button').click();
  await expect(page.getByText('Synced', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Disconnect AIOMetadata manifest' }).click();

  await expect(page.getByText('Synced', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('manifest-url-input')).toHaveCount(1);
  await expect(page.getByTestId('manifest-url-input')).toHaveValue('');
});

test('keeps the manifest url field in view on mobile after focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'This assertion targets the mobile layout.');

  const fixture = getAuditFixture('medium');

  await mockManifest(page, fixture);
  await gotoWelcomePage(page);

  await page.getByTestId('welcome-load-template').click();
  if (!(await page.getByText('AIOMetadata synced').isVisible())) {
    await page.getByRole('button', { name: /Sync Manifest|Edit/i }).click();
    const manifestUrlField = page.getByTestId('manifest-url-input');

    await expect(manifestUrlField).toBeVisible();
    await manifestUrlField.click();

    const scrollContainer = page.getByTestId('manifest-modal-scroll');
    await expect(scrollContainer).toBeVisible();

    await expect.poll(async () => {
      return scrollContainer.evaluate((element) => (element as HTMLElement).scrollTop);
    }).toBeGreaterThan(0);

    await expect(manifestUrlField).toBeInViewport();
  }
});

test('keeps the manifest actions visible on mobile when the url is empty', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'This assertion targets the mobile layout.');

  await gotoWelcomePage(page);
  await page.getByTestId('welcome-load-template').click();
  if (!(await page.getByText('AIOMetadata synced').isVisible())) {
    await page.getByRole('button', { name: /Sync Manifest|Edit/i }).click();
    const manifestUrlField = page.getByTestId('manifest-url-input');

    await expect(manifestUrlField).toBeVisible();
    await manifestUrlField.fill('https://fixtures.example/aiometadata/manifest.json');
    await page.getByTestId('manifest-sync-submit').click();
  }

  await page.getByTestId('manifest-settings-button').click();
  await page.getByRole('button', { name: 'Disconnect AIOMetadata manifest' }).click();

  const manifestUrlField = page.getByTestId('manifest-url-input');
  await expect(manifestUrlField).toBeVisible();
  await expect(manifestUrlField).toHaveValue('');
  await expect(page.getByTestId('manifest-sync-submit')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeInViewport();
});

test('merges a partial import and keeps the result after reload', async ({ page }) => {
  const fixture = getAuditFixture('medium');
  const mergeFixture = createMergeImportFixture(fixture);

  await gotoSeededSelectionPage(page, fixture);

  await page.getByTestId('merge-import-button').click();
  await page.getByTestId('merge-import-textarea').fill(JSON.stringify(mergeFixture, null, 2));
  
  // Selection Station: New UI requires explicit selection
  await page.getByTestId('import-select-all').click();
  
  await page.getByTestId('merge-widgets-submit').click();

  await expect(page.getByTestId('success-import-message')).toBeVisible();
  await expect(page.getByTestId('success-widgets-added')).toHaveText('1');

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

test('shows the item title visibility toggle inside configuration and preview', async ({ page }) => {
  const fixture = getAuditFixture('small');
  const widgetId = 'collection-visibility-widget';
  const itemId = 'collection-visibility-item';
  const itemName = 'Preview Toggle Item';
  const storedState = createStoredAppState({
    ...fixture,
    config: {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: [
        {
          id: widgetId,
          title: 'Preview Toggle Collection',
          type: 'collection.row',
          dataSource: {
            kind: 'collection',
            payload: {
              items: [
                {
                  id: itemId,
                  name: itemName,
                  hideTitle: false,
                  layout: 'Wide',
                  backgroundImageURL: 'https://images.example/preview-toggle-item.jpg',
                  dataSources: [
                    {
                      sourceType: 'aiometadata',
                      kind: 'addonCatalog',
                      payload: {
                        addonId: fixture.manifestUrl,
                        catalogId: `movie::${fixture.manifestCatalogs[0]!.id}`,
                        catalogType: fixture.manifestCatalogs[0]!.displayType || fixture.manifestCatalogs[0]!.type,
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
    trash: [],
    itemTrash: [],
  });

  await page.addInitScript((entries) => {
    Object.entries(entries).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
  }, storedState);

  await page.goto('/');
  await expect(page.getByTestId('new-widget-button')).toBeVisible();

  await page.getByTestId(`widget-card-${widgetId}`).scrollIntoViewIfNeeded();
  await page.getByTestId(`widget-card-${widgetId}`).click();

  // Item Header Expansion
  const itemHeader = (await page.viewportSize())?.width && (await page.viewportSize())!.width < 640
    ? page.getByTestId('item-editor-header-mobile').first()
    : page.getByTestId('item-editor-header').first();

  await expect(itemHeader).toBeVisible();
  await itemHeader.click();

  const hideTitleSwitch = page.getByRole('switch', { name: 'Hide item title' });
  if ((await hideTitleSwitch.getAttribute('aria-checked')) === 'true') {
    await hideTitleSwitch.click();
  }

  await expect(hideTitleSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText(itemName, { exact: true }).last()).toBeVisible();

  await hideTitleSwitch.click();

  await expect(hideTitleSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Hidden')).toBeVisible();
  await expect
    .poll(async () => {
      return page.evaluate(({ targetWidgetId, targetItemId }: { targetWidgetId: string; targetItemId: string }) => {
        const raw = window.localStorage.getItem('fusion-widgets-config');
        if (!raw) {
          return null;
        }

        const parsed = JSON.parse(raw) as {
          widgets?: Array<{
            id: string;
            dataSource?: { payload?: { items?: Array<{ id: string; hideTitle?: boolean }> } };
          }>;
        };
        const widget = parsed.widgets?.find((entry) => entry.id === targetWidgetId);
        return widget?.dataSource?.payload?.items?.find((entry) => entry.id === targetItemId)?.hideTitle ?? null;
      }, { targetWidgetId: widgetId, targetItemId: itemId });
    })
    .toBe(true);
});

test('shows moved items in review and applies cross-widget moves without duplication', async ({ page }) => {
  const baseFixture = getAuditFixture('small');
  const sourceItem = {
    id: 'move-item-1',
    name: 'Moved Item',
    hideTitle: false,
    layout: 'Wide' as const,
    backgroundImageURL: 'https://images.example/move-item-1.jpg',
    dataSources: [
      {
        sourceType: 'aiometadata' as const,
        kind: 'addonCatalog' as const,
        payload: {
          addonId: baseFixture.manifestUrl,
          catalogId: 'movie::fixture-movie-001',
          catalogType: 'movie',
        },
      },
    ],
  };

  const storedState = createStoredAppState({
    ...baseFixture,
    config: {
      exportType: 'fusionWidgets',
      exportVersion: 1,
      widgets: [
        {
          id: 'collection-source',
          title: 'Source Collection',
          type: 'collection.row',
          dataSource: {
            kind: 'collection',
            payload: {
              items: [sourceItem],
            },
          },
        },
        {
          id: 'collection-target',
          title: 'Target Collection',
          type: 'collection.row',
          dataSource: {
            kind: 'collection',
            payload: {
              items: [],
            },
          },
        },
      ],
    },
    trash: [],
    itemTrash: [],
  });

  await page.addInitScript((entries) => {
    Object.entries(entries).forEach(([key, value]) => {
      window.localStorage.setItem(key, value);
    });
  }, storedState);

  await page.goto('/');
  await expect(page.getByTestId('new-widget-button')).toBeVisible();

  const importPayload = {
    exportType: 'fusionWidgets',
    exportVersion: 1,
    widgets: [
      {
        id: 'collection-target',
        title: 'Target Collection',
        type: 'collection.row',
        dataSource: {
          kind: 'collection',
          payload: {
            items: [sourceItem],
          },
        },
      },
    ],
  };

  await page.getByTestId('merge-import-button').click();
  await page.getByTestId('merge-import-textarea').fill(JSON.stringify(importPayload, null, 2));
  await expect(page.getByText('Moved')).toBeVisible();
  
  // Selection Station: New UI requires explicit selection
  await page.getByTestId('import-select-all').click();
  
  await page.getByTestId('merge-widgets-submit').click();
  await expect(page.getByTestId('success-import-message')).toBeVisible();
  await expect(page.getByTestId('success-items-updated')).toHaveText('1');

  await expect.poll(async () => {
    return page.evaluate(() => {
      const raw = window.localStorage.getItem('fusion-widgets-config');
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as {
        widgets?: Array<{
          id: string;
          dataSource?: { payload?: { items?: Array<{ id: string }> } };
        }>;
      };

      const widgets = parsed.widgets || [];
      return {
        sourceItems: widgets.find((widget) => widget.id === 'collection-source')?.dataSource?.payload?.items?.map((item) => item.id) || [],
        targetItems: widgets.find((widget) => widget.id === 'collection-target')?.dataSource?.payload?.items?.map((item) => item.id) || [],
      };
    });
  }).toEqual({
    sourceItems: [],
    targetItems: ['move-item-1'],
  });
});

test('applies AIOMetadata export settings only after save and resets unsaved dialog changes', async ({ page }) => {
  const fixture = getAuditFixture('small');

  await gotoSeededSelectionPage(page, fixture);
  await openExportDialog(page);
  await page.getByRole('button', { name: 'AIOMETADATA' }).click();

  const widgetSettingsButton = page.getByRole('button', { name: 'Open export settings for Audit Collection 001' });
  await widgetSettingsButton.click();

  let settingsDialog = page.locator('[role="dialog"]').filter({ hasText: 'AIOMetadata settings' }).last();
  await expect(settingsDialog).toContainText('Audit Collection 001');
  await expect(settingsDialog.getByRole('button', { name: /Use Default Sorting/i })).toBeVisible();

  await settingsDialog.getByRole('button', { name: /Use Default Sorting/i }).click();
  await page.getByRole('button', { name: 'Random', exact: true }).click();
  await page.keyboard.press('Escape');

  await widgetSettingsButton.click();
  settingsDialog = page.locator('[role="dialog"]').filter({ hasText: 'AIOMetadata settings' }).last();
  await expect(settingsDialog.getByRole('button', { name: /Use Default Sorting/i })).toBeVisible();

  await settingsDialog.getByRole('button', { name: /Use Default Sorting/i }).click();
  await page.getByRole('button', { name: 'Random', exact: true }).click();
  await settingsDialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByTestId('export-preview-textarea')).toHaveValue(/"sort": "random"/);
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

test('keeps the setup guide usable on mobile', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'This assertion targets the mobile layout.');

  await gotoWelcomePage(page);

  await page.locator('[data-testid^="open-setup-guide"]:visible').first().click();

  const guide = page.getByTestId('fusion-setup-guide');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Recommended AIOMetadata instances');

  await guide.locator('div').filter({ hasText: 'Export to Fusion' }).last().scrollIntoViewIfNeeded();
  await expect(guide).toContainText('Settings -> Widgets -> Import');
});
