import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import { AuthProvider } from './contexts/AuthContext'
import { BrokerageProvider } from './contexts/BrokerageContext'
import { PostHogProvider } from './providers/PostHogProvider'
import App from './App'

const queryClient = new QueryClient()
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const isClerkEnabled = Boolean(clerkPublishableKey)

if (!isClerkEnabled) {
  console.warn('Clerk is not configured. Web admin auth will be unavailable until VITE_CLERK_PUBLISHABLE_KEY is set.')
}

export default function ActiveApp() {
  const app = (
    <AuthProvider isClerkEnabled={isClerkEnabled}>
      <PostHogProvider>
        <QueryClientProvider client={queryClient}>
          <BrokerageProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </BrokerageProvider>
        </QueryClientProvider>
      </PostHogProvider>
    </AuthProvider>
  )

  if (!isClerkEnabled) return app

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      {app}
    </ClerkProvider>
  )
}

