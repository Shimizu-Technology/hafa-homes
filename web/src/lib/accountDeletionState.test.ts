import { afterEach, describe, expect, it, vi } from 'vitest'
import { accountDeletionStorageKey, clearPendingAccountDeletion, hasPendingAccountDeletion, markPendingAccountDeletion } from './accountDeletionState'

describe('account deletion recovery state', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('survives a page reload for the same Clerk user until sign-out clears it', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }

    markPendingAccountDeletion('user_123', storage)

    expect(accountDeletionStorageKey('user_123')).toBe('hafaHomes:accountDeletionStarted:user_123')
    expect(hasPendingAccountDeletion('user_123', storage)).toBe(true)
    expect(hasPendingAccountDeletion('user_456', storage)).toBe(false)

    clearPendingAccountDeletion('user_123', storage)
    expect(hasPendingAccountDeletion('user_123', storage)).toBe(false)
  })

  it('falls back safely when the browser blocks local storage access', () => {
    const blockedWindow = {}
    Object.defineProperty(blockedWindow, 'localStorage', {
      get() { throw new Error('storage blocked') },
    })
    vi.stubGlobal('window', blockedWindow)

    expect(hasPendingAccountDeletion('user_123')).toBe(false)
    expect(() => markPendingAccountDeletion('user_123')).not.toThrow()
    expect(() => clearPendingAccountDeletion('user_123')).not.toThrow()
  })
})
