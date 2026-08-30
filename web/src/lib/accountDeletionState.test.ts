import { describe, expect, it } from 'vitest'
import { accountDeletionStorageKey, clearPendingAccountDeletion, hasPendingAccountDeletion, markPendingAccountDeletion } from './accountDeletionState'

describe('account deletion recovery state', () => {
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
})
