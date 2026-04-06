export const metadata = {
  title: 'About ClarityRay',
}

const architectureColumns = [
  {
    title: 'Browser Runtime',
    items: [
      'Inference runs client-side with the browser runtime (WASM/JS).',
      'Preprocessing, model execution, and postprocessing happen entirely on-device.',
      'No patient images are uploaded as part of inference.',
    ],
  },
  {
    title: 'Model Platform',
    items: [
      'Hosts versioned ONNX artifacts and clarity.json manifests.',
      'Clients may download model files; the platform does not receive patient data.',
      'Provides a single source for model distribution and metadata.',
    ],
  },
  {
    title: 'Converter CLI',
    items: [
      'Developer tool that packages models into reproducible bundles.',
      'Validates the schema and emits a clarity.json contract per model.',
      'Ensures models include checksums and required metadata for safe loading.',
    ],
  },
]

export default function AboutPage() {
  return (
    <main className="clarity-backdrop" style={{ minHeight: '100vh', padding: '64px 16px' }}>
      <div style={{ width: 'min(1120px, 100%)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section className="panel panel-accent" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="mono" style={{ textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>About / System overview</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', lineHeight: 1.2, fontWeight: 600 }}>About ClarityRay</h1>
          <p style={{ maxWidth: '86ch', color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '1rem' }}>
            ClarityRay is a privacy-first browser-native diagnostic assist platform. It runs model inference locally in the user&apos;s browser, uses a small, auditable model contract (clarity.json) to describe model behavior, and includes a converter CLI that packages and validates model bundles for distribution.
          </p>
        </section>

        <section className="panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {architectureColumns.map((col) => (
            <article key={col.title} className="card">
              <h3 className="mono" style={{ fontSize: 13, marginBottom: 8 }}>{col.title}</h3>
              <ul style={{ color: 'var(--text-secondary)', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2 style={{ marginBottom: 8 }}>Privacy model</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            Nothing from the patient&apos;s scan leaves the device during inference. Images, intermediate tensors, and any personally-identifying data are retained in browser memory and processed locally. What may be downloaded are model artifacts (for example, ONNX binaries and the converter-produced bundle) — these are model files and metadata only, not patient data.
          </p>
        </section>

        <section className="panel">
          <h2 style={{ marginBottom: 8 }}>Model contract (clarity.json)</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            The clarity.json manifest is a small, human-readable contract that tells the runtime:
          </p>
          <ul style={{ color: 'var(--text-secondary)', paddingLeft: 18 }}>
            <li><span className="mono">id</span> — stable model identifier</li>
            <li><span className="mono">version</span> — semantic versioning</li>
            <li><span className="mono">inputs</span> — expected preprocessing and tensor shapes</li>
            <li><span className="mono">outputs</span> — labels and postprocess rules</li>
            <li><span className="mono">checksum</span> — integrity hash for verification</li>
          </ul>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            This contract makes model behavior explicit and enables safe, auditable loading across environments.
          </p>
        </section>

        <section className="panel">
          <h2 style={{ marginBottom: 8 }}>Open source</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            The project source and tooling are available on GitHub. Please check the repository for license details and contributor guidelines.
          </p>
          <p>
            <a href="https://github.com/Shubhambn/Clarity" target="_blank" rel="noreferrer" className="mono">github.com/Shubhambn/Clarity</a>
          </p>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            License: MIT (see repository LICENSE for full text).
          </p>
        </section>

        <style>{`
          @media (max-width: 920px) {
            section[style*="grid-template-columns"] {
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>
    </main>
  )
}
