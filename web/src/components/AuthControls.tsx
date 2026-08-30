import { cloneElement } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import {
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  SignInButton as ClerkSignInButton,
  UserButton as ClerkUserButton,
} from '@clerk/clerk-react'
import { useAuthContext } from '../contexts/AuthContext'

type SignInChild = ReactElement<{
  disabled?: boolean
  title?: string
  'aria-disabled'?: boolean
}>

export function SignInButton({ children, mode }: { children: SignInChild; mode?: ComponentProps<typeof ClerkSignInButton>['mode'] }) {
  const { isClerkEnabled } = useAuthContext()

  if (!isClerkEnabled) {
    return cloneElement(children, {
      disabled: true,
      'aria-disabled': true,
      title: 'Sign-in is not configured for this environment.',
    })
  }

  return <ClerkSignInButton mode={mode}>{children}</ClerkSignInButton>
}

export function UserButton() {
  const { isClerkEnabled } = useAuthContext()
  return isClerkEnabled ? <ClerkUserButton /> : null
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { isClerkEnabled } = useAuthContext()
  return isClerkEnabled ? <ClerkSignedIn>{children}</ClerkSignedIn> : null
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { isClerkEnabled } = useAuthContext()
  return isClerkEnabled ? <ClerkSignedOut>{children}</ClerkSignedOut> : <>{children}</>
}
