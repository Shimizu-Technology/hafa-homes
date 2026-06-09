import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { AuthProvider } from './contexts/AuthContext'
import { PostHogProvider } from './providers/PostHogProvider'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient()
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const isClerkEnabled = Boolean(clerkPublishableKey)

if (!isClerkEnabled) {
  console.warn('Clerk is not configured. Web admin auth will be unavailable until VITE_CLERK_PUBLISHABLE_KEY is set.')
}

function Root() {
  const app = (
    <AuthProvider isClerkEnabled={isClerkEnabled}>
      <PostHogProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </PostHogProvider>
    </AuthProvider>
  )

  if (!isClerkEnabled) return app

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/admin"
      signUpFallbackRedirectUrl="/"
    >
      {app}
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
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
