import { expect, test } from '@playwright/test';
import {
  TEMPLATE_MANIFEST_URL,
  FALLBACK_TEMPLATE_URLS,
} from '../../src/lib/template-repository';

test.describe('live integration endpoints', () => {
  test.skip(!process.env.ENABLE_NETWORK_LIVE_SMOKE, 'Set ENABLE_NETWORK_LIVE_SMOKE=1 to run external endpoint checks.');

  test('template manifest is reachable', async ({ request }) => {
    const response = await request.get(TEMPLATE_MANIFEST_URL);

    expect(response.ok()).toBeTruthy();

    const json = await response.json();
    expect(Array.isArray(json.templates)).toBeTruthy();
    expect(json.templates.length).toBeGreaterThan(0);
  });

  test('fallback fusion template is reachable', async ({ request }) => {
    const response = await request.get(FALLBACK_TEMPLATE_URLS.fusion);

    expect(response.ok()).toBeTruthy();

    const json = await response.json();
    expect(Array.isArray(json.widgets)).toBeTruthy();
  });

  test('optional live manifest responds with catalogs when provided', async ({ request }) => {
    test.skip(!process.env.LIVE_MANIFEST_URL, 'Set LIVE_MANIFEST_URL to validate a real AIOMetadata manifest endpoint.');

    const response = await request.get(process.env.LIVE_MANIFEST_URL!);
    expect(response.ok()).toBeTruthy();

    const json = await response.json();
    expect(Array.isArray(json.catalogs)).toBeTruthy();
  });
});
