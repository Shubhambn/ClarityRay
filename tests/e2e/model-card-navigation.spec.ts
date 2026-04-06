import { expect, test } from '@playwright/test';

test('model card click navigates to /models/[slug] via client transition', async ({ page }) => {
  const modelSummary = {
    id: 'demo-lung-model',
    slug: 'demo-lung-model',
    name: 'Demo Lung Model',
    bodypart: 'chest',
    modality: 'xray',
    status: 'published',
    published_at: '2026-04-01T00:00:00.000Z',
    current_version: {
      id: 'demo-lung-model@1.0.0',
      version: '1.0.0',
      onnx_url: '/models/demo-lung-model/model.onnx',
      clarity_url: '/models/demo-lung-model/clarity.json',
      file_size_mb: 12.3,
      is_current: true,
    },
  };

  const modelDetail = {
    ...modelSummary,
    validation: {
      passed: true,
      ran_at: '2026-04-02T00:00:00.000Z',
      checks: [{ name: 'shape', passed: true, message: 'ok' }],
    },
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = request.url();
    const resourceType = request.resourceType();

    if (resourceType === 'document') {
      await route.continue();
      return;
    }

    if (requestUrl.endsWith('/health')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, models_count: 1 }),
      });
      return;
    }

    if (/\/models\/demo-lung-model(?:\?.*)?$/.test(requestUrl)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(modelDetail),
      });
      return;
    }

    if (/\/models(?:\?.*)?$/.test(requestUrl)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          models: [modelSummary],
          total: 1,
          page: 1,
          limit: 25,
        }),
      });
      return;
    }

    await route.continue();
  });

  const documentRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'document') {
      documentRequests.push(request.url());
    }
  });

  await page.goto('/models');
  await expect(page.getByLabel('Loading models')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'View details for Demo Lung Model' })).toBeVisible();

  const baselineDocumentRequests = documentRequests.length;

  await page.getByRole('link', { name: 'View details for Demo Lung Model' }).click();

  await expect(page).toHaveURL(/\/models\/demo-lung-model$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Demo Lung Model' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use for Analysis' })).toBeVisible();

  expect(documentRequests.length).toBe(baselineDocumentRequests);
});
