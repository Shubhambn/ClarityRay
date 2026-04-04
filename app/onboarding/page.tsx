'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePersona } from '@/lib/persona/context';
import type { Persona } from '@/lib/persona/context';

/* ── Types ── */
type Step = 1 | 2 | 3;

/* ── Icons ── */
function IconTerminal() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function IconCross() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2v20M2 12h20" />
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function IconPerson() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

/* ── Persona card data ── */
interface PersonaCardDef {
  id: Persona;
  Icon: () => React.ReactElement;
  title: string;
  description: string;
  badge: string;
}

const PERSONA_CARDS: PersonaCardDef[] = [
  {
    id: 'researcher',
    Icon: IconTerminal,
    title: 'Developer / Researcher',
    description: 'Show raw probabilities, inference timing, system logs, and technical model metadata.',
    badge: 'Technical view',
  },
  {
    id: 'doctor',
    Icon: IconCross,
    title: 'Clinician / Radiologist',
    description: 'Show structured clinical findings with confidence levels and interpretation guidance.',
    badge: 'Clinical view',
  },
  {
    id: 'patient',
    Icon: IconPerson,
    title: 'Patient / General',
    description: 'Show plain-language results only. Hide technical data. Always recommend physician consultation.',
    badge: 'Simple view',
  },
];

/* ── Flow diagram step data ── */
const FLOW_STEPS = [
  { label: 'Upload scan', description: 'Select a PNG or JPEG chest X-ray from your device.' },
  { label: 'Local processing', description: 'Image is decoded and normalized entirely in your browser.' },
  { label: 'AI inference', description: 'ONNX model runs in WebAssembly — no server contact.' },
  { label: 'Your results', description: 'Findings and heatmap render locally on your screen.' },
];

/* ── Trust statements ── */
const TRUST_ITEMS = [
  'No image leaves your browser',
  'Model runs in WebAssembly, not on a server',
  'Results are screening indicators, not diagnoses',
];

/* ── Step indicator ── */
function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="onb-step-indicator">
      {([1, 2, 3] as Step[]).map((n) => (
        <div key={n} className={`onb-step-dot ${step === n ? 'onb-step-dot--active' : ''} ${step > n ? 'onb-step-dot--done' : ''}`}>
          <span className="onb-step-num">{n}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Persona card ── */
function PersonaCard({
  card,
  selected,
  onSelect,
}: {
  card: PersonaCardDef;
  selected: boolean;
  onSelect: (id: Exclude<Persona, null>) => void;
}) {
  return (
    <button
      type="button"
      className={`onb-persona-card ${selected ? 'onb-persona-card--selected' : ''}`}
      onClick={() => onSelect(card.id as Exclude<Persona, null>)}
      aria-pressed={selected}
    >
      <div className="onb-persona-icon">
        <card.Icon />
      </div>
      <div className="onb-persona-body">
        <span className="onb-persona-title">{card.title}</span>
        <span className="onb-persona-desc">{card.description}</span>
      </div>
      <span className="onb-persona-badge">{card.badge}</span>
    </button>
  );
}

/* ── Step 1: Select persona ── */
function StepSelectPersona({
  selected,
  onSelect,
  onContinue,
}: {
  selected: Exclude<Persona, null> | null;
  onSelect: (id: Exclude<Persona, null>) => void;
  onContinue: () => void;
}) {
  return (
    <div className="onb-step-content">
      <h1 className="onb-title">Who are you?</h1>
      <p className="onb-subtitle">This helps us show you the right level of detail.</p>

      <div className="onb-persona-list">
        {PERSONA_CARDS.map((card) => (
          <PersonaCard key={card.id} card={card} selected={selected === card.id} onSelect={onSelect} />
        ))}
      </div>

      <div className="onb-actions">
        <button
          type="button"
          className="onb-btn-primary"
          onClick={onContinue}
          disabled={selected === null}
        >
          Continue <IconArrowRight />
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: System overview ── */
function StepSystemOverview({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) {
  return (
    <div className="onb-step-content">
      <h1 className="onb-title">How ClarityRay works</h1>

      {/* Flow diagram */}
      <div className="onb-flow">
        {FLOW_STEPS.map((s, i) => (
          <div key={s.label} className="onb-flow-item">
            <div className="onb-flow-node">
              <span className="onb-flow-node-label">{s.label}</span>
            </div>
            <p className="onb-flow-desc">{s.description}</p>
            {i < FLOW_STEPS.length - 1 && (
              <div className="onb-flow-arrow" aria-hidden="true">→</div>
            )}
          </div>
        ))}
      </div>

      {/* Trust statements */}
      <ul className="onb-trust-list">
        {TRUST_ITEMS.map((item) => (
          <li key={item} className="onb-trust-item">
            <span className="onb-trust-check" aria-hidden="true">✓</span>
            {item}
          </li>
        ))}
      </ul>

      <div className="onb-actions onb-actions--row">
        <button type="button" className="onb-btn-ghost" onClick={onBack}>
          <IconArrowLeft /> Back
        </button>
        <button type="button" className="onb-btn-primary" onClick={onContinue}>
          Continue <IconArrowRight />
        </button>
      </div>
    </div>
  );
}

/* ── Step 3: Safety acknowledgment ── */
function StepSafetyAck({
  onBegin,
  onBack,
}: {
  onBegin: () => void;
  onBack: () => void;
}) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="onb-step-content">
      <h1 className="onb-title">Before you begin</h1>

      <div className="onb-safety-block">
        <p className="onb-safety-text">
          ClarityRay is a screening tool. It is not a diagnostic device
          and cannot replace evaluation by a qualified medical professional.
        </p>
        <ul className="onb-safety-list">
          <li>Analysis runs locally. Nothing is uploaded.</li>
          <li>Results may be inaccurate. The AI model has known limitations.</li>
          <li>Do not make medical decisions based on these results alone.</li>
          <li>Always consult a licensed physician for diagnosis and treatment.</li>
        </ul>
      </div>

      <label className="onb-checkbox-label">
        <input
          type="checkbox"
          className="onb-checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span className="onb-checkbox-text">
          I understand this is a screening tool, not a medical diagnosis.
        </span>
      </label>

      <div className="onb-actions onb-actions--row">
        <button type="button" className="onb-btn-ghost" onClick={onBack}>
          <IconArrowLeft /> Back
        </button>
        <button
          type="button"
          className="onb-btn-primary"
          onClick={onBegin}
          disabled={!checked}
        >
          Begin Analysis <IconArrowRight />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main page component
   ══════════════════════════════════════════ */
export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPersona } = usePersona();

  const [step, setStep] = useState<Step>(1);
  const [selectedPersona, setSelectedPersona] = useState<Exclude<Persona, null> | null>(null);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  /* Check ?persona= query param on mount */
  useEffect(() => {
    const param = searchParams?.get('persona');
    if (param === 'researcher' || param === 'doctor' || param === 'patient') {
      setSelectedPersona(param);
      triggerTransition(2, 'forward');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerTransition = useCallback((target: Step, dir: 'forward' | 'back') => {
    setAnimating(true);
    setDirection(dir);
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
    }, 220);
  }, []);

  const goNext = useCallback(() => {
    if (step < 3) triggerTransition((step + 1) as Step, 'forward');
  }, [step, triggerTransition]);

  const goBack = useCallback(() => {
    if (step > 1) triggerTransition((step - 1) as Step, 'back');
  }, [step, triggerTransition]);

  const handleBegin = useCallback(() => {
    if (!selectedPersona) return;
    setPersona(selectedPersona);
    localStorage.setItem('clarityray_consent_v1', 'accepted');
    router.push('/analysis');
  }, [selectedPersona, setPersona, router]);

  const animClass = animating
    ? direction === 'forward'
      ? 'onb-anim-exit-forward'
      : 'onb-anim-exit-back'
    : '';

  return (
    <>
      <style>{`
        /* ── Layout ── */
        .onb-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          position: relative;
          z-index: 0;
        }

        .onb-card {
          width: 100%;
          max-width: 640px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 2.5rem 2rem;
          position: relative;
          overflow: hidden;
        }

        .onb-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.04) 0%, transparent 60%);
          pointer-events: none;
        }

        /* ── Step indicator ── */
        .onb-step-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          margin-bottom: 2.5rem;
        }

        .onb-step-dot {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 1px solid var(--border-subtle);
          background: transparent;
          transition: border-color 0.2s, background 0.2s;
          position: relative;
        }

        .onb-step-dot--active {
          border-color: var(--accent-primary);
          background: rgba(34, 197, 94, 0.12);
        }

        .onb-step-dot--done {
          border-color: rgba(34, 197, 94, 0.4);
          background: rgba(34, 197, 94, 0.06);
        }

        .onb-step-num {
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .onb-step-dot--active .onb-step-num {
          color: var(--accent-primary);
        }

        .onb-step-dot--done .onb-step-num {
          color: rgba(34, 197, 94, 0.6);
        }

        /* Connector lines between dots */
        .onb-step-indicator .onb-step-dot:not(:last-child)::after {
          content: '';
          position: absolute;
          left: calc(100% + 4px);
          top: 50%;
          transform: translateY(-50%);
          width: 0.75rem;
          height: 1px;
          background: var(--border-subtle);
        }

        /* ── Step content animation ── */
        .onb-step-content {
          opacity: 1;
          transform: translateY(0);
          transition: opacity 0.22s ease, transform 0.22s ease;
        }

        .onb-anim-exit-forward .onb-step-content {
          opacity: 0;
          transform: translateY(-12px);
        }

        .onb-anim-exit-back .onb-step-content {
          opacity: 0;
          transform: translateY(12px);
        }

        /* ── Titles ── */
        .onb-title {
          font-family: var(--font-ui);
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 0.5rem;
          letter-spacing: -0.01em;
        }

        .onb-subtitle {
          font-family: var(--font-ui);
          font-size: 0.9rem;
          color: var(--text-secondary);
          margin: 0 0 2rem;
        }

        /* ── Persona cards ── */
        .onb-persona-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 2rem;
        }

        .onb-persona-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem 1.125rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          cursor: pointer;
          text-align: left;
          transition: border-color 0.18s, background 0.18s;
          width: 100%;
          position: relative;
        }

        .onb-persona-card:hover {
          border-color: rgba(34, 197, 94, 0.2);
          background: rgba(34, 197, 94, 0.04);
        }

        .onb-persona-card--selected {
          border-color: var(--accent-primary) !important;
          background: rgba(34, 197, 94, 0.08) !important;
        }

        .onb-persona-icon {
          flex-shrink: 0;
          width: 44px;
          height: 44px;
          border-radius: 8px;
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-primary);
          margin-top: 2px;
        }

        .onb-persona-card--selected .onb-persona-icon {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.3);
        }

        .onb-persona-body {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          flex: 1;
          min-width: 0;
        }

        .onb-persona-title {
          font-family: var(--font-ui);
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .onb-persona-desc {
          font-family: var(--font-ui);
          font-size: 0.82rem;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .onb-persona-badge {
          flex-shrink: 0;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          color: var(--accent-primary);
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.2);
          border-radius: 4px;
          padding: 0.2rem 0.5rem;
          white-space: nowrap;
          align-self: flex-start;
          margin-top: 2px;
        }

        /* ── Flow diagram (step 2) ── */
        .onb-flow {
          display: flex;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 0;
          margin-bottom: 2rem;
          position: relative;
        }

        .onb-flow-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          flex: 1;
          min-width: 120px;
          position: relative;
        }

        .onb-flow-node {
          background: rgba(34, 197, 94, 0.08);
          border: 1px solid rgba(34, 197, 94, 0.25);
          border-radius: 8px;
          padding: 0.5rem 0.75rem;
          margin-bottom: 0.625rem;
          width: 100%;
          max-width: 120px;
        }

        .onb-flow-node-label {
          font-family: var(--font-mono);
          font-size: 0.72rem;
          color: var(--accent-primary);
          white-space: nowrap;
        }

        .onb-flow-desc {
          font-family: var(--font-ui);
          font-size: 0.75rem;
          color: var(--text-secondary);
          line-height: 1.4;
          max-width: 110px;
          margin: 0;
        }

        .onb-flow-arrow {
          position: absolute;
          top: 1rem;
          right: -0.6rem;
          color: var(--accent-primary);
          font-size: 1rem;
          line-height: 1;
          opacity: 0.5;
          z-index: 1;
        }

        /* ── Trust list ── */
        .onb-trust-list {
          list-style: none;
          margin: 0 0 2rem;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 1rem 1.125rem;
          background: rgba(255, 255, 255, 0.015);
        }

        .onb-trust-item {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          font-family: var(--font-ui);
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .onb-trust-check {
          color: var(--accent-primary);
          font-size: 0.85rem;
          flex-shrink: 0;
        }

        /* ── Safety block (step 3) ── */
        .onb-safety-block {
          border: 1px solid rgba(34, 197, 94, 0.15);
          border-radius: 8px;
          padding: 1.125rem 1.25rem;
          background: rgba(34, 197, 94, 0.04);
          margin-bottom: 1.5rem;
        }

        .onb-safety-text {
          font-family: var(--font-ui);
          font-size: 0.875rem;
          color: var(--text-primary);
          margin: 0 0 1rem;
          line-height: 1.6;
        }

        .onb-safety-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .onb-safety-list li {
          font-family: var(--font-ui);
          font-size: 0.825rem;
          color: var(--text-secondary);
          padding-left: 1rem;
          position: relative;
          line-height: 1.5;
        }

        .onb-safety-list li::before {
          content: '•';
          position: absolute;
          left: 0;
          color: var(--accent-primary);
        }

        /* ── Checkbox ── */
        .onb-checkbox-label {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          cursor: pointer;
          margin-bottom: 2rem;
        }

        .onb-checkbox {
          appearance: none;
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          flex-shrink: 0;
          margin-top: 1px;
          cursor: pointer;
          position: relative;
          background: transparent;
          transition: border-color 0.15s, background 0.15s;
        }

        .onb-checkbox:checked {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
        }

        .onb-checkbox:checked::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpolyline points='2 7 5.5 10.5 12 3' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-size: 12px;
          background-repeat: no-repeat;
          background-position: center;
        }

        .onb-checkbox:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }

        .onb-checkbox-text {
          font-family: var(--font-ui);
          font-size: 0.875rem;
          color: var(--text-primary);
          line-height: 1.5;
        }

        /* ── Action buttons ── */
        .onb-actions {
          display: flex;
          justify-content: flex-end;
        }

        .onb-actions--row {
          justify-content: space-between;
        }

        .onb-btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          background: var(--accent-primary);
          color: #000;
          font-family: var(--font-ui);
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.1s;
        }

        .onb-btn-primary:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .onb-btn-primary:active:not(:disabled) {
          transform: translateY(0);
        }

        .onb-btn-primary:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .onb-btn-ghost {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1rem;
          background: transparent;
          color: var(--text-secondary);
          font-family: var(--font-ui);
          font-size: 0.875rem;
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }

        .onb-btn-ghost:hover {
          border-color: rgba(255, 255, 255, 0.15);
          color: var(--text-primary);
        }

        /* ── Responsive ── */
        @media (max-width: 520px) {
          .onb-card {
            padding: 1.75rem 1.125rem;
          }

          .onb-flow {
            flex-direction: column;
            align-items: stretch;
          }

          .onb-flow-item {
            flex-direction: row;
            align-items: center;
            text-align: left;
            gap: 1rem;
            min-width: unset;
          }

          .onb-flow-node {
            flex-shrink: 0;
            max-width: unset;
            width: auto;
          }

          .onb-flow-desc {
            max-width: unset;
          }

          .onb-flow-arrow {
            position: static;
            transform: rotate(90deg);
            margin: 0.25rem auto;
            display: block;
          }
        }
      `}</style>

      <div className="onb-page grid-bg">
        <div className={`onb-card ${animClass}`}>
          <StepIndicator step={step} />

          {step === 1 && (
            <StepSelectPersona
              selected={selectedPersona}
              onSelect={setSelectedPersona}
              onContinue={goNext}
            />
          )}

          {step === 2 && (
            <StepSystemOverview onContinue={goNext} onBack={goBack} />
          )}

          {step === 3 && (
            <StepSafetyAck onBegin={handleBegin} onBack={goBack} />
          )}
        </div>
      </div>
    </>
  );
}
