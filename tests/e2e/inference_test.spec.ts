import { expect, test } from '@playwright/test';

test('run chest model inference on normal vs cancer images', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/models/densenet121-chest');
  
  await page.evaluate(() => {
    localStorage.setItem('clarityray_persona_v1', 'doctor');
    localStorage.setItem('clarityray_consent_v1', 'accepted');
  });

  await page.goto('http://127.0.0.1:3000/analysis');
  
  await expect(page.getByText('System ready', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  console.log('System is ready for DenseNet121 Chest.');

  // 1. Upload Normal Image
  const normalPath = 'c:/Users/Public/Project-Suuuuuuuuuuuuuuuuuuu/clarity/ClarityRay/uploads/normal_chest_xray.png';
  console.log('Uploading normal image...');
  await page.locator('input[type="file"]').setInputFiles(normalPath);

  // Wait for complete
  await expect(page.getByText('Analysis complete', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  console.log('--- NORMAL IMAGE RESULT ---');
  let normalResultText = await page.locator('div.panel-sm').first().innerText().catch(() => 'no findings list');
  console.log('Output panel:\n', normalResultText);
  
  // Assert correct predictions for normal chest x-ray
  expect(normalResultText).toContain('Normal\n59.9%');
  expect(normalResultText).toContain('Lung Cancer\n40.1%');
  
  // 2. Upload Cancer Image
  const cancerPath = 'c:/Users/Public/Project-Suuuuuuuuuuuuuuuuuuu/clarity/ClarityRay/uploads/cancer_chest_xray.png';
  console.log('Uploading cancer image...');
  await page.locator('input[type="file"]').setInputFiles(cancerPath);

  // Wait for complete
  await expect(page.getByText('Analyzing...', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Analysis complete', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  console.log('--- CANCER IMAGE RESULT ---');
  let cancerResultText = await page.locator('div.panel-sm').first().innerText().catch(() => 'no findings list');
  console.log('Output panel:\n', cancerResultText);

  // Assert correct predictions for cancer chest x-ray
  expect(cancerResultText).toContain('Normal\n46.5%');
  expect(cancerResultText).toContain('Lung Cancer\n53.5%');
});
