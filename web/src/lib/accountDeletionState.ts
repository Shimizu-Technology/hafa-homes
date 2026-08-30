const ACCOUNT_DELETION_KEY_PREFIX = 'hafaHomes:accountDeletionStarted'

export function accountDeletionStorageKey(userId?: string | null) {
  return userId ? `${ACCOUNT_DELETION_KEY_PREFIX}:${userId}` : null
}

export function hasPendingAccountDeletion(userId?: string | null, storage: Pick<Storage, 'getItem'> = window.localStorage) {
  const key = accountDeletionStorageKey(userId)
  if (!key) return false

  try {
    return storage.getItem(key) === 'true'
  } catch {
    return false
  }
}

export function markPendingAccountDeletion(userId?: string | null, storage: Pick<Storage, 'setItem'> = window.localStorage) {
  const key = accountDeletionStorageKey(userId)
  if (!key) return

  try {
    storage.setItem(key, 'true')
  } catch {
    // The API remains authoritative if browser storage is unavailable.
  }
}

export function clearPendingAccountDeletion(userId?: string | null, storage: Pick<Storage, 'removeItem'> = window.localStorage) {
  const key = accountDeletionStorageKey(userId)
  if (!key) return

  try {
    storage.removeItem(key)
  } catch {
    // A stale marker is scoped to this Clerk user and can be cleared later.
  }
}
