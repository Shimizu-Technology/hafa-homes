import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { SiteAvailability } from './SiteAvailability'
import './index.css'

const ActiveApp = lazy(() => import('./ActiveApp'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteAvailability>
      <Suspense fallback={<p role="status" className="p-6">Opening Hafa Homes…</p>}>
        <ActiveApp />
      </Suspense>
    </SiteAvailability>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => registrations.forEach((registration) => registration.unregister()))
      .catch((error) => console.warn('Service worker cleanup failed:', error))
  })
} else if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => console.warn('Service worker registration failed:', error))
  })
}
