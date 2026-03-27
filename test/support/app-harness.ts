import { expect, type Page } from '@playwright/test';
import {
  TEMPLATE_MANIFEST_URL,
  TEMPLATE_REPOSITORY_CONTENTS_URL,
} from '../../src/lib/template-repository';
import {
  type AuditFixture,
  createStoredAppState,
  getAuditFixture,
} from '../fixtures/audit-fixtures';

const templateUrls = {
  aiometadata: 'https://fixtures.example/templates/aiometadata.json',
  aiometadataCatalogsOnly: 'https://fixtures.example/templates/aiometadata-catalogs-only.json',
  aiostreams: 'https://fixtures.example/templates/aiostreams.json',
  fusion: 'https://fixtures.example/templates/fusion.json',
};

function buildTemplateManifest() {
  return {
    templates: [
      {
        id: 'ume-omni-template-v9.9.9.json',
        isDefault: true,
        name: 'UME Omni Template v9.9.9',
        url: templateUrls.fusion,
        version: 'v9.9.9',
      },
      {
        id: 'ume-aiometadata-config-v9.9.9.json',
        name: 'UME AIOMetadata Config v9.9.9',
        url: templateUrls.aiometadata,
        version: 'v9.9.9',
      },
      {
        id: 'ume-aiometadata-catalogs-only-v9.9.9.json',
        name: 'UME AIOMetadata Catalogs Only v9.9.9',
        url: templateUrls.aiometadataCatalogsOnly,
        version: 'v9.9.9',
      },
      {
        id: 'ume-aiostreams-template-v9.9.9.json',
        name: 'UME AIOStreams Template v9.9.9',
        url: templateUrls.aiostreams,
        version: 'v9.9.9',
      },
    ],
  };
}

function buildTemplatePayload(url: string, fixture: AuditFixture) {
  if (url === templateUrls.fusion) {
    return fixture.config;
  }

  return {
    version: 'v-fixture',
    catalogs: fixture.manifestCatalogs,
  };
}

async function addJsonFetchMocks(page: Page, entries: Record<string, unknown>) {
  await page.addInitScript((mockEntries) => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();

      if (url in mockEntries) {
        return new Response(JSON.stringify(mockEntries[url]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }

      return originalFetch(input, init);
    };
  }, entries);
}

export async function mockTemplateRepository(page: Page, fixture: AuditFixture = getAuditFixture('small')) {
  await addJsonFetchMocks(page, {
    [TEMPLATE_MANIFEST_URL]: buildTemplateManifest(),
    [TEMPLATE_REPOSITORY_CONTENTS_URL]: [],
    [templateUrls.fusion]: buildTemplatePayload(templateUrls.fusion, fixture),
    [templateUrls.aiometadata]: buildTemplatePayload(templateUrls.aiometadata, fixture),
    [templateUrls.aiometadataCatalogsOnly]: buildTemplatePayload(templateUrls.aiometadataCatalogsOnly, fixture),
    [templateUrls.aiostreams]: buildTemplatePayload(templateUrls.aiostreams, fixture),
  });
}

export async function mockManifest(page: Page, fixture: AuditFixture, manifestUrl = fixture.manifestUrl) {
  await addJsonFetchMocks(page, {
    [manifestUrl]: {
      catalogs: fixture.manifestCatalogs,
    },
  });
}

export async function seedFixtureState(page: Page, fixture: AuditFixture, manifestSynced = true) {
  const storedState = createStoredAppState(fixture, manifestSynced);

  await page.addInitScript((entries) => {
    const hasExistingState = window.localStorage.getItem('fusion-widgets-config') !== null;
    if (hasExistingState) {
      return;
    }

    Object.entries(entries).forEach(([key, value]) => {
      if (window.localStorage.getItem(key) === null) {
        window.localStorage.setItem(key, value);
      }
    });
  }, storedState);
}

export async function gotoWelcomePage(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('welcome-import-textarea')).toBeVisible();
}

export async function gotoSeededSelectionPage(page: Page, fixture: AuditFixture, manifestSynced = true) {
  await seedFixtureState(page, fixture, manifestSynced);
  await page.goto('/');
  await expect(page.getByTestId('new-widget-button')).toBeVisible();
}

export async function getWidgetTitles(page: Page) {
  return page.locator('[data-testid^="widget-card-"] h3').allTextContents();
}

export async function dragWidget(page: Page, sourceWidgetId: string, targetWidgetId: string) {
  const sourceHandle = page.getByTestId(`widget-handle-${sourceWidgetId}`).first();
  const targetCard = page.getByTestId(`widget-card-${targetWidgetId}`).first();

  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetCard.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('Could not resolve drag targets.');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}

export async function openExportDialog(page: Page) {
  await page.getByTestId('export-button').click();
  await expect(page.getByRole('dialog')).toContainText('Export JSON');
  await expect(page.getByTestId('export-preview-textarea')).toBeVisible();
}
