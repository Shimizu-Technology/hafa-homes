type StorageLike = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

type Dependencies = {
  storage: StorageLike
  digest: (value: string) => Promise<string>
  uuid: () => string
}

export type LeadIdempotencyToken = {
  fingerprint: string
  key: string
}

export function serverDirectedIdempotencyReset(status: number, payload: { reset_idempotency_key?: boolean } | null) {
  return (status === 409 || status === 422) && payload?.reset_idempotency_key === true
}

const STORAGE_PREFIX = 'hafaHomes:leadSubmission:'
const pendingStorageOperations = new Map<string, Promise<unknown>>()

async function serializeStorageOperation<T>(storageKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingStorageOperations.get(storageKey) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  pendingStorageOperations.set(storageKey, current)

  try {
    return await current
  } finally {
    if (pendingStorageOperations.get(storageKey) === current) pendingStorageOperations.delete(storageKey)
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function createLeadIdempotencyManager({ storage, digest, uuid }: Dependencies) {
  return {
    async prepare(payload: unknown, ownerId?: string): Promise<LeadIdempotencyToken> {
      const fingerprint = await digest(stableJson({ owner: ownerId || 'anonymous', payload }))
      const storageKey = `${STORAGE_PREFIX}${fingerprint}`
      return serializeStorageOperation(storageKey, async () => {
        let existing: string | null = null
        try {
          existing = await storage.getItem(storageKey)
        } catch {
          // A privacy setting or storage fault must not block a lead submission.
        }
        if (existing) return { fingerprint, key: existing }

        const key = uuid()
        try {
          await storage.setItem(storageKey, key)
        } catch {
          // Continue with a non-persisted key when storage cannot be written.
        }
        return { fingerprint, key }
      })
    },

    async complete(token: LeadIdempotencyToken) {
      const storageKey = `${STORAGE_PREFIX}${token.fingerprint}`
      await serializeStorageOperation(storageKey, async () => {
        try {
          if (await storage.getItem(storageKey) === token.key) await storage.removeItem(storageKey)
        } catch {
          // The API already accepted the lead; storage cleanup must not turn success into an error.
        }
      })
    },
  }
}
