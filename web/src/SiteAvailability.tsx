import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PausedPrivacy } from './PausedPrivacy'

type Availability = 'loading' | 'available' | 'paused' | 'unavailable'

// Check the static CDN before mounting anything that can contact the API.
// Missing/invalid status fails closed so a broken status file cannot wake the backend.
export function SiteAvailability({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Availability>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    let mounted = true

    fetch('/service-status.json', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Status unavailable')
        const status: unknown = await response.json()
        const value = status && typeof status === 'object' && 'state' in status ? status.state : undefined
        if (value !== 'available' && value !== 'paused') throw new Error('Invalid status')
        if (mounted) setState(value)
      })
      .catch(() => { if (mounted) setState('unavailable') })
      .finally(() => clearTimeout(timeout))

    return () => {
      mounted = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  if (state === 'available') return children

  const title = state === 'loading'
    ? 'Opening Hafa Homes'
    : state === 'paused'
      ? 'We’re working on Hafa Homes.'
      : 'Hafa Homes is temporarily unavailable.'

  return (
    <main className="flex min-h-dvh flex-col bg-[#f6f1e8]">
      <header className="mx-auto w-full max-w-5xl px-6 py-7 sm:px-10">
        <img src="/hafa-homes-logo.svg" alt="Hafa Homes" className="h-12 w-auto max-w-full" />
      </header>
      <section className="mx-auto flex w-full max-w-5xl flex-1 items-center px-6 py-12 sm:px-10 sm:py-20">
        <div className="max-w-2xl">
          {state !== 'loading' && window.location.pathname === '/privacy' ? <PausedPrivacy /> : <>
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.18em] text-[#0f705e]">{state === 'paused' ? 'Temporarily paused' : 'Hafa Homes'}</p>
          <h1 className="text-4xl font-semibold leading-[1.12] tracking-[-0.04em] text-[#0f3d35] sm:text-6xl">{title}</h1>
          <div aria-live="polite" className="mt-6 max-w-xl text-lg leading-8 text-[#52645d]">
            {state === 'loading' ? <p>Please wait while we check availability.</p> : (
              <>
                <p>{state === 'paused' ? 'We’ve temporarily paused the website and app while we improve the experience. Please check back for updates.' : 'We can’t open home search right now. Please try again later.'}</p>
                <p className="mt-4">Home search, saved homes, and new requests are unavailable for now. Existing account information remains stored.</p>
              </>
            )}
          </div>
          {state === 'unavailable' && (
            <button className="mt-7 min-h-12 rounded-xl bg-[#0f3d35] px-6 font-semibold text-white focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#0f705e]" onClick={() => { setState('loading'); setAttempt((value) => value + 1) }}>Try again</button>
          )}
          {state !== 'loading' && (
            <div className="mt-10 border-t border-[#cfdbd3] pt-6">
              <h2 className="font-semibold text-[#17211f]">Need help with your account?</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#52645d]">For support, privacy questions, or an account-deletion request during the pause, contact Shimizu Technology.</p>
              <a href="mailto:shimizutechnology@gmail.com?subject=Hafa%20Homes%20support" className="mt-3 inline-flex min-h-12 items-center break-all font-semibold text-[#0f705e] underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#0f705e]">shimizutechnology@gmail.com</a>
            </div>
          )}
          </>}
        </div>
      </section>
      <footer className="mx-auto w-full max-w-5xl px-6 pb-7 text-sm text-[#52645d] sm:px-10">Hafa Homes · Find your home on Guam. <a className="ml-4 inline-flex min-h-12 items-center underline underline-offset-4" href={window.location.pathname === '/privacy' ? '/' : '/privacy'}>{window.location.pathname === '/privacy' ? 'Back to Hafa Homes' : 'Privacy policy'}</a></footer>
    </main>
  )
}
