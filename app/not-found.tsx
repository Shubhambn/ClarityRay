import Link from 'next/link'

export default function NotFound() {
  return (
    <main
      className="clarity-backdrop"
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <section
        className="panel panel-accent"
        style={{
          width: 'min(720px, 96%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center',
        }}
      >
        <h1
          className="mono"
          style={{ fontSize: 'clamp(3rem, 10vw, 6rem)', lineHeight: 1, color: 'var(--text-mono)' }}
        >
          404
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem' }}>Page not found</p>
        <Link
          href="/analysis"
          className="mono"
          style={{ marginTop: 6, border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-md)', padding: '8px 14px', color: 'var(--text-mono)' }}
        >
          Return to analysis
        </Link>
      </section>
    </main>
  )
}
