import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { setAuthTokenGetter } from '../lib/api'

type AuthContextValue = {
  isClerkEnabled: boolean
  isSignedIn: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  isClerkEnabled: false,
  isSignedIn: false,
  isLoading: false,
})

const CLERK_JWT_TEMPLATE = import.meta.env.VITE_CLERK_JWT_TEMPLATE

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()

  useEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return await getToken(CLERK_JWT_TEMPLATE ? { template: CLERK_JWT_TEMPLATE } : undefined)
      } catch (error) {
        console.warn('Unable to load Clerk token', error)
        return null
      }
    })

    return () => setAuthTokenGetter(null)
  }, [getToken])

  return (
    <AuthContext.Provider value={{ isClerkEnabled: true, isSignedIn: Boolean(isSignedIn), isLoading: !isLoaded }}>
      {children}
    </AuthContext.Provider>
  )
}

function NoAuthBridge({ children }: { children: ReactNode }) {
  useEffect(() => {
    setAuthTokenGetter(null)
  }, [])

  return <AuthContext.Provider value={{ isClerkEnabled: false, isSignedIn: false, isLoading: false }}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children, isClerkEnabled }: { children: ReactNode; isClerkEnabled: boolean }) {
  return isClerkEnabled ? <ClerkAuthBridge>{children}</ClerkAuthBridge> : <NoAuthBridge>{children}</NoAuthBridge>
}

export function useAuthContext() {
  return useContext(AuthContext)
}
