import { expect, test } from '@playwright/test';

test('run brain model inference on brain CT image', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/models/brain-ctscan-cancer');
  
  await page.evaluate(() => {
    localStorage.setItem('clarityray_persona_v1', 'doctor');
    localStorage.setItem('clarityray_consent_v1', 'accepted');
    localStorage.setItem('clarityray_selected_model', 'brain-ctscan-cancer');
  });

  await page.goto('http://127.0.0.1:3000/analysis');
  
  await expect(page.getByText('System ready', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  console.log('System is ready for brain CT model.');

  // Upload brain CT scan
  const brainPath = 'c:/Users/Public/Project-Suuuuuuuuuuuuuuuuuuu/clarity/ClarityRay/uploads/brain_ct_scan.png';
  console.log('Uploading brain CT scan...');
  await page.locator('input[type="file"]').setInputFiles(brainPath);

  // Wait for complete
  await expect(page.getByText('Analysis complete', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  console.log('--- BRAIN CT SCAN RESULT ---');
  let resultText = await page.locator('div.panel-sm').first().innerText().catch(() => 'no findings list');
  console.log('Output panel:\n', resultText);

  // Assert correct predictions for brain tumor scan
  expect(resultText).toContain('Possible glioma finding\n99.1%');
  expect(resultText).toContain('No suspicious brain finding\n0.9%');
});
