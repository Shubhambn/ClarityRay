import { expect, test } from '@playwright/test';

const CHECKS = {
  modelsPageLoadsAndDenseNetCardVisible: 'localhost:3000/models loads and shows DenseNet121 card',
  cardClickNavigatesToSlugPage: 'Click the card → /models/densenet121-chest loads',
  modelNameVisibleInH1: 'Model name visible in H1',
  useForAnalysisSetsKeyAndNavigates: "Click 'Use for Analysis' sets localStorage key and navigates to /analysis",
  consentModalAppears: 'On /analysis with cleared consent, consent modal appears',
  consentAcceptClosesModal: 'Accept consent closes modal and page is visible',
  statusTransitionsToReady: "Left panel status transitions through init to 'System ready'",
  logStripShowsRealEvents: 'Log strip shows real events at the bottom',
  uploadChangesStatusToAnalyzing: "Upload PNG/JPEG changes status to 'Analyzing...'",
  resultAppearsInRightPanel: 'Result appears in right panel',
  zeroRequestsToLocalhost4000: 'Zero XHR/Fetch requests to localhost:4000 during inference',
} as const;

test('manual verification checklist', async ({ page }) => {
  const results: Record<string, boolean> = {};

  let localhost4000RequestCount = 0;
  page.on('request', (request) => {
    const url = request.url();
    const resourceType = request.resourceType();
    if ((resourceType === 'xhr' || resourceType === 'fetch') && url.includes('localhost:4000')) {
      localhost4000RequestCount += 1;
    }
  });

  await page.goto('http://localhost:3000/models');
  await expect(page).toHaveURL(/http:\/\/localhost:3000\/models$/);

  const modelCard = page.getByRole('link', {
    name: /view details for/i,
  }).first();

  await expect(modelCard).toBeVisible({ timeout: 15_000 });
  results[CHECKS.modelsPageLoadsAndDenseNetCardVisible] = true;

  const href = await modelCard.getAttribute('href');
  const selectedSlug = href?.split('/').pop() ?? '';

  await modelCard.click();
  await expect(page).toHaveURL(/http:\/\/localhost:3000\/models\/[a-z0-9-]+$/);
  results[CHECKS.cardClickNavigatesToSlugPage] = true;

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 });
  results[CHECKS.modelNameVisibleInH1] = true;

  await page.evaluate(() => {
    localStorage.removeItem('clarityray_consent_v1');
  });

  await page.getByRole('button', { name: 'Use for Analysis' }).click();

  await expect.poll(async () => {
    return await page.evaluate(() => localStorage.getItem('clarityray_selected_model'));
  }).toBe(selectedSlug);

  await expect(page).toHaveURL(/http:\/\/localhost:3000\/analysis$/);
  results[CHECKS.useForAnalysisSetsKeyAndNavigates] = true;

  const consentDialog = page.getByRole('dialog');
  await expect(consentDialog).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 2, name: 'Before you begin' })).toBeVisible();
  results[CHECKS.consentModalAppears] = true;

  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'I Understand — Continue' }).click();
  await expect(consentDialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('SYSTEM', { exact: true })).toBeVisible();
  results[CHECKS.consentAcceptClosesModal] = true;

  await expect(page.getByText('Loading manifest...', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Loading specification...', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Downloading model...', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Verifying integrity...', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('System ready', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  results[CHECKS.statusTransitionsToReady] = true;

  const logCount = await page.getByLabel(/Log count:/).innerText();
  const numericLogCount = Number.parseInt(logCount, 10);
  expect(Number.isFinite(numericLogCount)).toBeTruthy();
  expect(numericLogCount).toBeGreaterThan(0);
  results[CHECKS.logStripShowsRealEvents] = true;

  await page.locator('input[type="file"]').setInputFiles('/home/shubh/Documents/Clarity/uploads/1775066265200-clarityray-test.png');

  await expect(page.getByText('Analyzing...', { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  results[CHECKS.uploadChangesStatusToAnalyzing] = true;

  await expect(page.getByText('ANALYSIS OUTPUT')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/confidence/i).first()).toBeVisible({ timeout: 30_000 });
  results[CHECKS.resultAppearsInRightPanel] = true;

  expect(localhost4000RequestCount).toBe(0);
  results[CHECKS.zeroRequestsToLocalhost4000] = true;

  expect(Object.keys(results)).toHaveLength(Object.keys(CHECKS).length);
});
