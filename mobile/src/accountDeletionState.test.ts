import { describe, expect, it } from 'vitest'
import { accountDeletionStorageKey, clearPendingAccountDeletion, hasPendingAccountDeletion, markPendingAccountDeletion, type AsyncDeletionStateStore } from './accountDeletionState'

describe('account deletion recovery state', () => {
  it('survives an app restart for the same Clerk user until sign-out clears it', async () => {
    const values = new Map<string, string>()
    const store: AsyncDeletionStateStore = {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value) },
      removeItem: async (key) => { values.delete(key) },
    }

    await markPendingAccountDeletion(store, 'user_123')

    expect(accountDeletionStorageKey('user_123')).toBe('hafaHomes:accountDeletionStarted:user_123')
    expect(await hasPendingAccountDeletion(store, 'user_123')).toBe(true)
    expect(await hasPendingAccountDeletion(store, 'user_456')).toBe(false)

    await clearPendingAccountDeletion(store, 'user_123')
    expect(await hasPendingAccountDeletion(store, 'user_123')).toBe(false)
  })
})
