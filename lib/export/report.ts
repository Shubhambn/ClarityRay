import type { SafeResult } from '@/lib/clarity/postprocess';
import type { Persona } from '@/lib/persona/context';
import type { ModelInfo } from '@/hooks/useClarityRay';

export interface ReportInput {
  result: SafeResult;
  persona: Persona;
  modelInfo: ModelInfo | null;
  imageDataUrl?: string | null;
  heatmapDataUrl?: string | null;
  heatmapMethod?: 'contrast_attention_v1' | 'occlusion_sensitivity' | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tierLabel(tier: SafeResult['safetyTier']): string {
  if (tier === 'possible_finding') return 'Possible Finding';
  if (tier === 'low_confidence') return 'Low Confidence (Inconclusive)';
  return 'No Finding';
}

function tierHexColor(tier: SafeResult['safetyTier']): string {
  if (tier === 'possible_finding') return '#dc2626';
  if (tier === 'low_confidence') return '#d97706';
  return '#16a34a';
}

function tierHexBg(tier: SafeResult['safetyTier']): string {
  if (tier === 'possible_finding') return '#fef2f2';
  if (tier === 'low_confidence') return '#fffbeb';
  return '#f0fdf4';
}

function personaLabel(persona: Persona): string {
  if (persona === 'doctor') return 'Clinician Report';
  if (persona === 'researcher') return 'Research Report';
  if (persona === 'patient') return 'Patient Report';
  return 'Screening Report';
}

function dateStr(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function htmlHead(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;background:#fff;font-size:14px;line-height:1.6}
.page{max-width:740px;margin:0 auto;padding:48px 40px}
.hdr{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid #e5e7eb;margin-bottom:28px}
.logo{font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#111}
.logo span{color:#00c47a}
.meta{font-size:11px;color:#6b7280;text-align:right;line-height:1.8}
.sec-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid #f3f4f6}
.panel{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:16px}
.row{display:flex;justify-content:space-between;align-items:center;padding:4px 0}
.rl{color:#6b7280;font-size:12px}
.rv{font-size:12px;font-weight:600;text-align:right}
.bar-row{margin-bottom:8px}
.bar-lbl{display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px}
.bar-track{height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px}
.pill{display:inline-block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:2px 8px;border-radius:999px;margin:0 4px 6px 0}
.steps{padding-left:18px}
.steps li{margin-bottom:6px;font-size:13px;color:#374151}
.disclaimer{background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 16px;margin-top:20px;font-size:12px;color:#92400e}
.disclaimer strong{display:block;margin-bottom:4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.footer{margin-top:32px;padding-top:14px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af}
.scan-img{max-width:200px;max-height:200px;object-fit:contain;border-radius:6px;border:1px solid #e5e7eb;display:block}
@media print{
  .no-print{display:none!important}
  body{font-size:12px}
  .page{padding:24px 20px}
}
</style>
</head>
<body><div class="page">`;
}

function htmlClose(filename: string): string {
  return `<div class="no-print" style="position:fixed;bottom:24px;right:24px;display:flex;gap:10px;z-index:999">
  <button onclick="window.print()" style="background:#111;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;letter-spacing:.01em">
    Save as PDF / Print
  </button>
  <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">
    Close
  </button>
</div>
<script>
  // Auto-trigger print after fonts and images load
  window.addEventListener('load', function() { setTimeout(function(){ window.print(); }, 700); });
</script>
</div></body></html>`;
}

function htmlHeader(persona: Persona, modelInfo: ModelInfo | null): string {
  const modelName = modelInfo?.name ?? 'AI Screening Model';
  const scanDesc = [modelInfo?.modality, modelInfo?.bodypart].filter(Boolean).join(' / ');
  return `<div class="hdr">
  <div>
    <div class="logo">Clarity<span>Ray</span></div>
    <div style="font-size:11px;color:#6b7280;margin-top:3px">${personaLabel(persona)}</div>
    <div style="font-size:11px;color:#6b7280">${modelName}${scanDesc ? ` · ${scanDesc}` : ''}</div>
  </div>
  <div class="meta">
    <div style="font-weight:700;margin-bottom:2px">AI SCREENING REPORT</div>
    <div>${dateStr()}</div>
    <div>All processing local — data not transmitted</div>
  </div>
</div>`;
}

function htmlFindingCard(result: SafeResult): string {
  const color = tierHexColor(result.safetyTier);
  const bg = tierHexBg(result.safetyTier);
  const tier = tierLabel(result.safetyTier);
  const isRegression = result.task === 'regression';
  return `<div style="background:${bg};border:2px solid ${color}30;border-left:5px solid ${color};border-radius:10px;padding:22px 20px;margin-bottom:20px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
    <div style="flex:1">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:${color};font-weight:700;margin-bottom:6px">Primary Finding</div>
      <div style="font-size:21px;font-weight:700;color:${color}">${result.primaryFinding}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Safety tier: ${tier}</div>
    </div>
    ${!isRegression ? `<div style="text-align:right">
      <div style="font-size:40px;font-weight:800;line-height:1;color:${color}">${result.confidencePercent}%</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-top:2px">model confidence</div>
    </div>` : ''}
  </div>
  ${!isRegression ? `<div style="height:7px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin-top:16px">
    <div style="height:100%;width:${result.confidencePercent}%;background:${color};border-radius:4px"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:10px;color:#9ca3af;margin-top:3px"><span>0%</span><span>100%</span></div>` : ''}
</div>`;
}

function htmlProbBars(result: SafeResult): string {
  if (!result.classProbabilities?.length) return '';
  const bars = result.classProbabilities.map(({ label, probability }) => {
    const pct = (probability * 100).toFixed(1);
    const w = (probability * 100).toFixed(2);
    const isSuspicious = result.findings?.some(f => f.label === label && f.suspicious);
    const barColor = isSuspicious ? '#ef4444' : '#6366f1';
    return `<div class="bar-row">
      <div class="bar-lbl"><span>${label}</span><span style="font-weight:700">${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${barColor}"></div></div>
    </div>`;
  }).join('');
  return `<div style="margin-bottom:16px">
  <div class="sec-title">Output Probabilities</div>
  <div class="panel">${bars}</div>
</div>`;
}

function htmlFindingsList(result: SafeResult): string {
  const findings = result.findings;
  if (!findings?.length) return '';
  const items = findings.map(f => {
    const pct = (f.probability * 100).toFixed(1);
    const w = (f.probability * 100).toFixed(2);
    const color = f.suspicious ? '#ef4444' : '#22c55e';
    return `<div class="bar-row">
      <div class="bar-lbl">
        <span style="display:inline-flex;align-items:center;gap:6px"><span style="color:${color}">●</span>${f.label}</span>
        <span style="font-weight:700">${pct}%</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${color}"></div></div>
    </div>`;
  }).join('');
  return `<div style="margin-bottom:16px">
  <div class="sec-title">Findings (${findings.length})</div>
  <div class="panel">${items}</div>
</div>`;
}

function htmlSummaryPanel(text: string, title = 'Summary'): string {
  return `<div style="margin-bottom:16px">
  <div class="sec-title">${title}</div>
  <div class="panel"><p style="font-size:13px;line-height:1.7">${text}</p></div>
</div>`;
}

function htmlActionSteps(steps: string[], title: string, color: string): string {
  const items = steps.map(s => `<li>${s}</li>`).join('');
  return `<div style="margin-bottom:16px">
  <div class="sec-title">${title}</div>
  <div class="panel" style="border-left:4px solid ${color}"><ul class="steps">${items}</ul></div>
</div>`;
}

function htmlMetaTable(rows: [string, string][]): string {
  const items = rows.map(([k, v]) => `<div class="row">
    <span class="rl">${k}</span><span class="rv">${v}</span>
  </div>`).join('');
  return `<div style="margin-bottom:16px">
  <div class="sec-title">Model Metadata</div>
  <div class="panel">${items}</div>
</div>`;
}

function htmlDisclaimer(text: string): string {
  return `<div class="disclaimer"><strong>Important — Not a Diagnosis</strong>${text}</div>`;
}

function htmlFooter(persona: Persona, modelInfo: ModelInfo | null): string {
  return `<div class="footer">
  <span>ClarityRay AI Screening · ${personaLabel(persona)}${modelInfo?.id ? ` · ${modelInfo.id}` : ''}</span>
  <span>Generated ${dateStr()}</span>
</div>`;
}

function heatmapLabel(method: string | null | undefined): string {
  if (method === 'occlusion_sensitivity') return 'Model Heatmap (Occlusion)';
  if (method === 'contrast_attention_v1') return 'Contrast Overlay';
  return 'Heatmap';
}

function htmlScanImages(
  imageDataUrl: string | null | undefined,
  heatmapDataUrl: string | null | undefined,
  method: string | null | undefined,
): string {
  if (!imageDataUrl && !heatmapDataUrl) return '';

  const hmLabel = heatmapLabel(method);

  if (imageDataUrl && heatmapDataUrl) {
    return `<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;clear:both">
  <div>
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:5px">Original Scan</div>
    <img src="${imageDataUrl}" class="scan-img" alt="Original scan">
  </div>
  <div>
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:5px">${hmLabel}</div>
    <img src="${heatmapDataUrl}" class="scan-img" alt="${hmLabel}">
  </div>
</div>`;
  }

  const src = imageDataUrl ?? heatmapDataUrl ?? '';
  const label = imageDataUrl ? 'Scan' : hmLabel;
  return `<div style="float:right;margin:0 0 16px 20px">
  <div style="font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin-bottom:5px">${label}</div>
  <img src="${src}" class="scan-img" alt="${label}">
</div>`;
}

// ── Patient HTML ──────────────────────────────────────────────────────────────

function buildPatientHTML(input: ReportInput): string {
  const { result, persona, modelInfo, imageDataUrl, heatmapDataUrl, heatmapMethod } = input;
  const tier = result.safetyTier;
  const color = tierHexColor(tier);

  const nextSteps =
    tier === 'possible_finding'
      ? [
          'Contact your doctor or a specialist as soon as possible.',
          'Bring this report to your physician appointment.',
          'Do not change medications or treatments based on this AI result alone.',
          'Seek immediate care if symptoms are severe or worsening.',
        ]
      : tier === 'low_confidence'
      ? [
          'Discuss this result with your doctor at your next appointment.',
          'Ask your doctor whether a follow-up scan is recommended.',
          'This result is inconclusive — only a doctor can interpret it properly.',
        ]
      : [
          'No AI finding was detected. Discuss with your doctor as needed.',
          'Continue routine follow-up as advised by your physician.',
          'Contact your doctor if you have any symptoms or concerns.',
        ];

  return [
    htmlHead(`ClarityRay Patient Report — ${result.primaryFinding}`),
    htmlHeader(persona, modelInfo),
    htmlScanImages(imageDataUrl, heatmapDataUrl, heatmapMethod),
    htmlFindingCard(result),
    `<div style="margin-bottom:16px">
      <div class="sec-title">What does this mean?</div>
      <div class="panel"><p style="font-size:13px;line-height:1.7">${result.plainSummary}</p></div>
    </div>`,
    htmlActionSteps(nextSteps, 'What should I do?', color),
    htmlDisclaimer(result.disclaimer),
    `<div style="margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px">
      <p style="font-size:12px;color:#166534">This report was generated by ClarityRay. Your scan was processed entirely on this device — it was never uploaded to any server.</p>
    </div>`,
    htmlFooter(persona, modelInfo),
    htmlClose(`ClarityRay_Patient_Report`),
  ].join('\n');
}

// ── Doctor HTML ──────────────────────────────────────────────────────────────

function buildDoctorHTML(input: ReportInput): string {
  const { result, persona, modelInfo, imageDataUrl, heatmapDataUrl, heatmapMethod } = input;
  const tier = result.safetyTier;
  const color = tierHexColor(tier);
  const task = result.task ?? 'binary';
  const bodypart = modelInfo?.bodypart ?? 'region';
  const modality = modelInfo?.modality ?? 'scan';

  const interpretation =
    tier === 'possible_finding'
      ? `Pattern consistent with "${result.primaryFinding}" identified at ${result.confidencePercent}% confidence on ${modality} of ${bodypart}. Radiologist review and clinical correlation strongly recommended.`
      : tier === 'low_confidence'
      ? `Weak signal detected (${result.confidencePercent}% confidence). Model did not reach the reporting threshold. Clinical correlation and follow-up imaging may be warranted.`
      : `No significant abnormality pattern identified on ${modality} of ${bodypart} (${result.confidencePercent}% confidence). A negative AI result does not exclude disease.`;

  const actionSteps =
    tier === 'possible_finding'
      ? ['Arrange radiologist review of this scan.', 'Consider additional or confirmatory imaging.', 'Correlate with patient history and clinical presentation.', 'Document AI screening result in patient record.']
      : tier === 'low_confidence'
      ? ['Clinical correlation required before any action.', 'Consider repeat or follow-up imaging based on clinical context.', 'Interpret in conjunction with patient history.']
      : ['No immediate action indicated by AI screening.', 'Routine follow-up as clinically indicated.', 'Correlate with patient history and clinical findings.'];

  const isUnvalidated = modelInfo?.thresholds?.validation_status === 'unvalidated';

  const unvalidatedBanner = isUnvalidated
    ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e">
        <strong style="display:block;margin-bottom:2px">⚠ UNVALIDATED MODEL</strong>
        Not clinically validated — for research and screening support only.
      </div>` : '';

  const contextBadges = [
    modelInfo?.bodypart ? `<span class="pill" style="background:#f0f9ff;color:#075985;border:1px solid #bae6fd">${modelInfo.bodypart}</span>` : '',
    modelInfo?.modality ? `<span class="pill" style="background:#f0f9ff;color:#075985;border:1px solid #bae6fd">${modelInfo.modality}</span>` : '',
    task ? `<span class="pill" style="background:#f3f4f6;color:#374151;border:1px solid #e5e7eb">${task}</span>` : '',
  ].join('');

  const probSection = (task === 'multilabel' || task === 'multiclass')
    ? htmlFindingsList(result) + htmlProbBars(result)
    : htmlProbBars(result);

  return [
    htmlHead(`ClarityRay Clinical Report — ${result.primaryFinding}`),
    htmlHeader(persona, modelInfo),
    unvalidatedBanner,
    `<div style="margin-bottom:14px">${contextBadges}</div>`,
    htmlScanImages(imageDataUrl, heatmapDataUrl, heatmapMethod),
    htmlFindingCard(result),
    `<div style="margin-bottom:16px">
      <div class="sec-title">Interpretation</div>
      <div class="panel"><p style="font-size:13px;line-height:1.7">${interpretation}</p></div>
    </div>`,
    htmlActionSteps(actionSteps, 'Recommended Action', color),
    probSection,
    htmlSummaryPanel(result.plainSummary, 'Clinical Summary'),
    htmlMetaTable([
      ['Model', modelInfo?.name ?? '—'],
      ['Model ID', modelInfo?.id ?? '—'],
      ['Task type', task],
      ['Modality', modelInfo?.modality ?? '—'],
      ['Body region', modelInfo?.bodypart ?? '—'],
      ['Possible finding threshold', String(modelInfo?.thresholds?.possible_finding ?? '—')],
      ['Low confidence threshold', String(modelInfo?.thresholds?.low_confidence ?? '—')],
    ]),
    htmlDisclaimer(result.disclaimer),
    htmlFooter(persona, modelInfo),
    htmlClose(`ClarityRay_Clinical_Report`),
  ].join('\n');
}

// ── Researcher HTML ──────────────────────────────────────────────────────────

function buildResearcherHTML(input: ReportInput): string {
  const { result, persona, modelInfo, imageDataUrl, heatmapDataUrl, heatmapMethod } = input;
  const task = result.task ?? 'binary';

  const thresholdSection = `<div style="margin-bottom:16px">
    <div class="sec-title">Thresholds</div>
    <div class="panel">
      <div class="row"><span class="rl">possible_finding</span><span class="rv">${modelInfo?.thresholds?.possible_finding ?? '—'}</span></div>
      <div class="row"><span class="rl">low_confidence</span><span class="rv">${modelInfo?.thresholds?.low_confidence ?? '—'}</span></div>
      <div class="row"><span class="rl">validation_status</span><span class="rv">${modelInfo?.thresholds?.validation_status ?? '—'}</span></div>
    </div>
  </div>`;

  const sourceModelSection = modelInfo?.sourceModel
    ? `<div style="margin-bottom:16px">
        <div class="sec-title">Source Model</div>
        <div class="panel">
          <div class="row"><span class="rl">Family</span><span class="rv">${modelInfo.sourceModel.family}</span></div>
          <div class="row"><span class="rl">Source</span><span class="rv" style="max-width:60%;text-align:right;word-break:break-all">${modelInfo.sourceModel.source}</span></div>
          ${modelInfo.sourceModel.selected_findings?.length ? `<div class="row"><span class="rl">Selected findings</span><span class="rv" style="max-width:60%;text-align:right">${modelInfo.sourceModel.selected_findings.join(', ')}</span></div>` : ''}
        </div>
      </div>` : '';

  const findingsSection =
    (task === 'multilabel' || task === 'multiclass') && result.findings
      ? htmlFindingsList(result)
      : '';

  return [
    htmlHead(`ClarityRay Research Report — ${result.primaryFinding}`),
    htmlHeader(persona, modelInfo),
    htmlScanImages(imageDataUrl, heatmapDataUrl, heatmapMethod),
    htmlFindingCard(result),
    htmlProbBars(result),
    findingsSection,
    htmlSummaryPanel(result.plainSummary, 'Model Summary'),
    htmlMetaTable([
      ['Model', modelInfo?.name ?? '—'],
      ['Model ID', modelInfo?.id ?? '—'],
      ['Task type', task],
      ['Input shape', modelInfo?.inputShape?.join('×') ?? '—'],
      ['Activation', modelInfo?.activation ?? '—'],
      ['Output classes', String(modelInfo?.outputClasses?.length ?? '—')],
      ['Modality', modelInfo?.modality ?? '—'],
      ['Body region', modelInfo?.bodypart ?? '—'],
    ]),
    thresholdSection,
    sourceModelSection,
    htmlDisclaimer(result.disclaimer),
    htmlFooter(persona, modelInfo),
    htmlClose(`ClarityRay_Research_Report`),
  ].join('\n');
}

// ── Public: HTML ──────────────────────────────────────────────────────────────

export function buildReportHTML(input: ReportInput): string {
  if (input.persona === 'doctor') return buildDoctorHTML(input);
  if (input.persona === 'researcher') return buildResearcherHTML(input);
  return buildPatientHTML(input);
}

export function exportAsPDF(input: ReportInput): void {
  const html = buildReportHTML(input);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const win = window.open(url, '_blank', 'noopener,noreferrer');
  // Revoke the blob URL after the window has had time to load it.
  setTimeout(() => URL.revokeObjectURL(url), 3000);

  if (!win) {
    // Popup blocked — fall back to download so the user still gets the report.
    const a = document.createElement('a');
    a.href = url;
    a.download = `ClarityRay_Report_${input.result.primaryFinding.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

// ── Public: WhatsApp ──────────────────────────────────────────────────────────

export function buildWhatsAppText(input: ReportInput): string {
  const { result, persona, modelInfo } = input;
  const modelName = modelInfo?.name ?? 'AI Screening Model';
  const scanDesc = [modelInfo?.modality, modelInfo?.bodypart].filter(Boolean).join(' / ');
  const tier = tierLabel(result.safetyTier);
  const date = dateStr();

  const header = `🔬 *ClarityRay AI Screening Report*\n📅 ${date}`;
  const scanLine = scanDesc ? `🩻 Scan: ${scanDesc}` : '';
  const modelLine = `🤖 Model: ${modelName}`;

  if (persona === 'patient') {
    const guidance =
      result.safetyTier === 'possible_finding'
        ? '⚠️ *Action required* — Please contact your doctor as soon as possible.'
        : result.safetyTier === 'low_confidence'
        ? 'ℹ️ *Inconclusive* — Discuss with your doctor at your next appointment.'
        : '✅ *No finding detected* — Continue routine follow-up with your doctor.';

    return [
      header,
      scanLine,
      '',
      `🩺 *AI Finding:* ${result.primaryFinding}`,
      `📊 *Confidence:* ${result.confidencePercent}%`,
      `🏷️ *Status:* ${tier}`,
      '',
      result.plainSummary,
      '',
      guidance,
      '',
      '⚠️ This is an AI screening result — _not a medical diagnosis_. Always consult your physician.',
      '',
      '_Generated by ClarityRay — all processing done locally on your device._',
    ].filter(Boolean).join('\n');
  }

  if (persona === 'doctor') {
    const findingsBlock = result.findings?.length
      ? `\n📋 *Flagged labels (${result.findings.length}):*\n${result.findings.map(f => `  • ${f.label}: ${(f.probability * 100).toFixed(1)}%`).join('\n')}`
      : '';

    return [
      header,
      modelLine,
      scanLine,
      '',
      `🔍 *Primary Finding:* ${result.primaryFinding}`,
      `📊 *Confidence:* ${result.confidencePercent}%`,
      `🏷️ *Risk Tier:* ${tier}`,
      findingsBlock,
      '',
      `📝 *Interpretation:*\n${result.plainSummary}`,
      '',
      `⚠️ ${result.disclaimer}`,
      '',
      '_ClarityRay — browser-local inference, data never transmitted._',
    ].filter(Boolean).join('\n');
  }

  // researcher
  const topProbs = result.classProbabilities
    ?.slice(0, 8)
    .map(({ label, probability }) => `  ${label}: ${(probability * 100).toFixed(1)}%`)
    .join('\n') ?? '';

  const findingsBlock = result.findings?.length
    ? `\n📋 *Reported Findings:*\n${result.findings.map(f => `  • ${f.label} (${(f.probability * 100).toFixed(0)}%)`).join('\n')}`
    : '';

  return [
    header,
    modelLine,
    scanLine ? `🩻 Scan: ${scanDesc}` : '',
    `⚙️ Task: ${result.task ?? 'binary'}`,
    '',
    `🔍 *Primary Detection:* ${result.primaryFinding}`,
    `📊 *Confidence:* ${result.confidencePercent}%`,
    `🏷️ *Safety Tier:* ${tier}`,
    topProbs ? `\n📈 *Class Probabilities:*\n${topProbs}` : '',
    findingsBlock,
    '',
    result.plainSummary,
    '',
    result.disclaimer,
    '',
    `_ClarityRay Research Report · ${date}_`,
  ].filter(Boolean).join('\n');
}

export function shareWhatsApp(input: ReportInput): void {
  const text = buildWhatsAppText(input);
  // wa.me opens the WhatsApp app on mobile and WhatsApp Web on desktop
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
