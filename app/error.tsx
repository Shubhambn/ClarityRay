"use client"

import Link from 'next/link'
import React from 'react'

interface ErrorPageProps {
  error: Error & { message?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="clarity-backdrop" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section
        className="panel panel-accent"
        style={{ width: 'min(720px, 96%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}
      >
        <h1 className="mono" style={{ fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', color: 'var(--text-mono)' }}>
          Something went wrong
        </h1>

        {error?.message ? (
          <p className="mono" style={{ color: 'var(--text-secondary)', maxWidth: '72ch', fontSize: 12, lineHeight: 1.6, wordBreak: 'break-word' }}>
            {error.message}
          </p>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>An unexpected error occurred.</p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
          <button type="button" onClick={reset} className="mono btn" style={{ padding: '7px 14px' }}>
            Retry
          </button>
          <Link href="/" className="mono btn" style={{ padding: '7px 14px' }}>
            Return home
          </Link>
        </div>
      </section>
    </main>
  )
}
