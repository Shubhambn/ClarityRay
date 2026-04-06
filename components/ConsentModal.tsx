'use client';

import { useMemo, useState } from 'react';

const CONSENT_KEY = 'clarityray_consent_v1';

interface ConsentModalProps {
  onAccept: () => void;
}

export function ConsentModal({ onAccept }: ConsentModalProps) {
  const [checked, setChecked] = useState<boolean>(false);

  const handleAccept = (): void => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    onAccept();
  };

  const bodyText = useMemo(
    () =>
      `ClarityRay uses AI to identify possible findings in chest X-rays.
This is a screening tool — it is not a diagnostic tool and cannot
replace evaluation by a qualified medical professional.

• All analysis runs locally on your device. Nothing is uploaded.
• Results may be inaccurate. The AI model has known limitations.
• Do not make medical decisions based on these results alone.
• Always consult a licensed physician for diagnosis and treatment.`,
    []
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4" aria-modal="true" role="dialog">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl sm:p-8">
        <h2 className="text-2xl font-semibold text-slate-900">Before you begin</h2>

        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{bodyText}</p>

        <label className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span className="text-sm text-slate-800">I understand this is a screening tool, not a medical diagnosis.</span>
        </label>

        <button
          type="button"
          className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={!checked}
          onClick={handleAccept}
        >
          I Understand — Continue
        </button>
      </div>
    </div>
  );
}
