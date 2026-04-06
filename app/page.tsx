import Link from 'next/link';

/* ─────────────────────────────────────────────
   ClarityRay Landing Page
   Server Component — no API calls, no useEffect.
   ───────────────────────────────────────────── */

export default function Home() {
  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-ui)' }}>

      {/* ── SECTION 1: HERO ── */}
      <section
        className="grid-bg"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          padding: '0 clamp(1.5rem, 6vw, 6rem)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '1160px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0,55fr) minmax(0,45fr)',
            gap: '3rem',
            alignItems: 'center',
          }}
          className="hero-grid"
        >
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

            {/* Top badge */}
            <div style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
              <span
                style={{
                  background: 'var(--accent-primary-dim)',
                  border: '1px solid var(--border-accent)',
                  borderRadius: '999px',
                  padding: '4px 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-accent)',
                  letterSpacing: '0.03em',
                }}
              >
                → Open source · Browser-native · Zero uploads
              </span>
            </div>

            {/* H1 */}
            <h1
              style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                fontSize: 'clamp(2rem, 4.5vw, 3.25rem)',
                lineHeight: 1.1,
                color: 'var(--text-primary)',
                margin: 0,
              }}
            >
              <span style={{ color: 'var(--text-accent)' }}>AI-Powered</span>
              {' '}Screening.
              <br />
              Zero Data Exposure.
            </h1>

            {/* Subheadline */}
            <p
              style={{
                fontFamily: 'var(--font-ui)',
                fontSize: '1.125rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.65,
                maxWidth: '480px',
                margin: 0,
              }}
            >
              Upload a chest X-ray and get AI findings in seconds.
              Every analysis runs entirely in your browser.
              Your scan never leaves your device.
            </p>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap' }}>
              <Link
                href="/analysis"
                className="home-cta-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  background: 'var(--accent-primary)',
                  color: '#000',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 600,
                  fontSize: '0.9375rem',
                  padding: '0.625rem 1.375rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  textDecoration: 'none',
                  transition: 'filter var(--transition-base)',
                }}
              >
                Start Analysis →
              </Link>
              <Link
                href="/models"
                className="home-cta-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 500,
                  fontSize: '0.9375rem',
                  padding: '0.625rem 1.375rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  textDecoration: 'none',
                  transition: 'border-color var(--transition-base)',
                }}
              >
                Browse Models
              </Link>
            </div>

            {/* Trust row */}
            <div
              style={{
                display: 'flex',
                gap: '1.25rem',
                flexWrap: 'wrap',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                letterSpacing: '0.03em',
              }}
            >
              <span>✓ No uploads required</span>
              <span>✓ ONNX Runtime Web</span>
              <span>✓ Open source</span>
            </div>
          </div>

          {/* RIGHT COLUMN — Static system preview panel */}
          <div className="panel panel-accent" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

            {/* Panel header */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-secondary)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.625rem',
                marginBottom: '0.25rem',
              }}
            >
              SYSTEM STATUS
            </div>

            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="status-dot" />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-accent)',
                }}
              >
                Ready
              </span>
            </div>

            {/* Metric rows */}
            {[
              ['Model', 'DenseNet121'],
              ['Runtime', 'ONNX Web'],
              ['Privacy', 'Local only'],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.375rem 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-mono)',
                  }}
                >
                  {value}
                </span>
              </div>
            ))}

            {/* Scan result placeholder */}
            <div
              style={{
                marginTop: '0.5rem',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '1.5rem',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: '0.625rem',
                }}
              >
                SCAN RESULT
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-tertiary)',
                }}
              >
                Upload an image to begin
              </div>
            </div>
          </div>
        </div>

        {/* Responsive styles injected via style tag to avoid 'use client' */}
        <style>{`
          @media (max-width: 768px) {
            .hero-grid {
              grid-template-columns: 1fr !important;
            }
          }
          @media (max-width: 768px) {
            .how-steps {
              flex-direction: column !important;
            }
            .persona-cards {
              flex-direction: column !important;
            }
            .privacy-cols {
              flex-direction: column !important;
            }
          }
        `}</style>
      </section>

      {/* ── SECTION 2: HOW IT WORKS ── */}
      <section
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: 'clamp(3rem, 6vw, 5rem) clamp(1.5rem, 6vw, 6rem)',
        }}
      >
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            How It Works
          </div>
          <div
            className="how-steps"
            style={{
              display: 'flex',
              gap: '1px',
              background: 'var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              marginTop: '2rem',
            }}
          >
            {[
              {
                step: '01',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                ),
                title: 'Upload Scan',
                text: 'Select a PNG or JPEG chest X-ray from your device.',
              },
              {
                step: '02',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="14" x2="4" y2="14" />
                  </svg>
                ),
                title: 'Local Inference',
                text: 'AI model runs entirely in your browser via ONNX Runtime.',
              },
              {
                step: '03',
                icon: (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <polyline points="9 15 11 17 15 13" />
                  </svg>
                ),
                title: 'Review Findings',
                text: 'View probability scores, heatmap, and screening disclaimer.',
              },
            ].map(({ step, icon, title, text }) => (
              <div
                key={step}
                style={{
                  flex: '1 1 0',
                  background: 'var(--bg-surface)',
                  padding: '2rem 1.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--text-accent)' }}>{icon}</span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-tertiary)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {step}
                  </span>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 600,
                      fontSize: '1rem',
                      color: 'var(--text-primary)',
                      marginBottom: '0.375rem',
                    }}
                  >
                    {title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.6,
                    }}
                  >
                    {text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: WHO IS IT FOR ── */}
      <section
        style={{
          padding: 'clamp(3rem, 6vw, 5rem) clamp(1.5rem, 6vw, 6rem)',
          background: 'var(--bg-base)',
        }}
      >
        <div style={{ maxWidth: '1160px', margin: '0 auto' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textAlign: 'center',
              marginBottom: '0.75rem',
            }}
          >
            Designed for
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              textAlign: 'center',
              color: 'var(--text-primary)',
              marginBottom: '2.5rem',
            }}
          >
            Who Is It For?
          </h2>

          <div
            className="persona-cards"
            style={{ display: 'flex', gap: '1rem', alignItems: 'stretch' }}
          >
            {/* Researcher */}
            <Link
              href="/onboarding?persona=researcher"
              className="persona-card persona-card-researcher"
              style={{
                flex: '1 1 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '1.75rem',
                background: 'var(--bg-panel)',
                border: '1px solid rgba(59,130,246,0.25)',
                borderRadius: 'var(--radius-lg)',
                textDecoration: 'none',
                transition: 'border-color var(--transition-base), background var(--transition-base)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'rgba(147,197,253,0.8)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Developer / Researcher
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.9375rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                  flex: 1,
                  margin: 0,
                }}
              >
                Test models, inspect probabilities, run technical validation.
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'rgba(147,197,253,0.9)',
                  letterSpacing: '0.04em',
                }}
              >
                Get Technical Access →
              </div>
            </Link>

            {/* Doctor */}
            <Link
              href="/onboarding?persona=doctor"
              className="persona-card persona-card-doctor"
              style={{
                flex: '1 1 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '1.75rem',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-accent)',
                borderRadius: 'var(--radius-lg)',
                textDecoration: 'none',
                transition: 'border-color var(--transition-base), background var(--transition-base)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-accent)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Clinician / Radiologist
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.9375rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                  flex: 1,
                  margin: 0,
                }}
              >
                Review structured findings with clinical context and confidence levels.
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-accent)',
                  letterSpacing: '0.04em',
                }}
              >
                Clinical View →
              </div>
            </Link>

            {/* Patient */}
            <Link
              href="/onboarding?persona=patient"
              className="persona-card persona-card-patient"
              style={{
                flex: '1 1 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '1.75rem',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                textDecoration: 'none',
                transition: 'border-color var(--transition-base), background var(--transition-base)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                Patient / General
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontSize: '0.9375rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.65,
                  flex: 1,
                  margin: 0,
                }}
              >
                Plain-language results. No jargon. Always consult your physician.
              </p>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.04em',
                }}
              >
                Simple View →
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── SECTION 4: PRIVACY ARCHITECTURE ── */}
      <section
        style={{
          background: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: 'clamp(3rem, 6vw, 5rem) clamp(1.5rem, 6vw, 6rem)',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: '0.75rem',
            }}
          >
            Architecture
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              fontSize: 'clamp(1.5rem, 3vw, 2rem)',
              color: 'var(--text-primary)',
              marginBottom: '3rem',
            }}
          >
            Built for Privacy First
          </h2>

          <div
            className="privacy-cols"
            style={{
              display: 'flex',
              gap: '1.5rem',
            }}
          >
            {[
              {
                title: 'Zero Uploads',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
                text: 'Scan images never leave your device during analysis. Inference happens entirely in browser memory.',
              },
              {
                title: 'Local Runtime',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="7" width="20" height="14" rx="2" />
                    <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                  </svg>
                ),
                text: 'The ONNX model runs in WebAssembly via ONNX Runtime Web. No cloud GPU, no server inference.',
              },
              {
                title: 'Open Source',
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                  </svg>
                ),
                text: 'Inspect every line of the inference pipeline. The model, preprocessing, and postprocessing are fully auditable.',
              },
            ].map(({ title, icon, text }) => (
              <div
                key={title}
                style={{
                  flex: '1 1 0',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '2rem 1.5rem',
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                }}
              >
                <div style={{ color: 'var(--text-accent)' }}>{icon}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontWeight: 600,
                    fontSize: '1rem',
                    color: 'var(--text-primary)',
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                  }}
                >
                  {text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: FOOTER ── */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: '1.25rem clamp(1.5rem, 6vw, 6rem)',
        }}
      >
        <div
          style={{
            maxWidth: '1160px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          {/* Left */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
              }}
            >
              ClarityRay
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                color: 'var(--text-tertiary)',
                letterSpacing: '0.03em',
              }}
            >
              Browser-native medical AI screening
            </span>
          </div>

          {/* Right — links */}
          <div
            style={{
              display: 'flex',
              gap: '1.25rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
            }}
          >
            {[
              { label: 'GitHub', href: 'https://github.com' },
              { label: 'Docs', href: '/about' },
              { label: 'About', href: '/about' },
            ].map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="footer-link"
                style={{
                  color: 'var(--text-tertiary)',
                  textDecoration: 'none',
                  transition: 'color var(--transition-base)',
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>

      <style>{`
        .home-cta-primary:hover {
          filter: brightness(1.1);
        }

        .home-cta-secondary:hover {
          border-color: var(--border-accent) !important;
        }

        .persona-card-researcher:hover {
          border-color: rgba(59,130,246,0.55) !important;
          background: rgba(59,130,246,0.05) !important;
        }

        .persona-card-doctor:hover {
          border-color: var(--border-accent-strong) !important;
          background: var(--accent-primary-glow) !important;
        }

        .persona-card-patient:hover {
          border-color: var(--border-default) !important;
          background: var(--bg-elevated) !important;
        }

        .footer-link:hover {
          color: var(--text-secondary) !important;
        }
      `}</style>
    </div>
  );
}
