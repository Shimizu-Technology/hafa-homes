const ACCOUNT_DELETION_KEY_PREFIX = 'hafaHomes:accountDeletionStarted'

export type AsyncDeletionStateStore = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<unknown>
  removeItem: (key: string) => Promise<unknown>
}

export function accountDeletionStorageKey(userId?: string | null) {
  return userId ? `${ACCOUNT_DELETION_KEY_PREFIX}:${userId}` : null
}

export async function hasPendingAccountDeletion(store: AsyncDeletionStateStore, userId?: string | null) {
  const key = accountDeletionStorageKey(userId)
  return Boolean(key && await store.getItem(key) === 'true')
}

export async function markPendingAccountDeletion(store: AsyncDeletionStateStore, userId?: string | null) {
  const key = accountDeletionStorageKey(userId)
  if (key) await store.setItem(key, 'true')
}

export async function clearPendingAccountDeletion(store: AsyncDeletionStateStore, userId?: string | null) {
  const key = accountDeletionStorageKey(userId)
  if (key) await store.removeItem(key)
}
