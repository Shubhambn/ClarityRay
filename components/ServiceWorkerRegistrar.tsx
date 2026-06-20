'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // SW registration is non-fatal — app works without it
        if (process.env.NODE_ENV === 'development') {
          console.warn('[ClarityRay] Service Worker registration failed:', err)
        }
      })
  }, [])

  return null
}
