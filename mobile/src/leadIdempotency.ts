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

const STORAGE_PREFIX = 'hafaHomes:leadSubmission:'

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function createLeadIdempotencyManager({ storage, digest, uuid }: Dependencies) {
  return {
    async prepare(payload: unknown, ownerId?: string): Promise<LeadIdempotencyToken> {
      const fingerprint = await digest(stableJson({ owner: ownerId || 'anonymous', payload }))
      const storageKey = `${STORAGE_PREFIX}${fingerprint}`
      const key = uuid()

      try {
        const existing = await storage.getItem(storageKey)
        if (existing) return { fingerprint, key: existing }

        await storage.setItem(storageKey, key)
      } catch {
        // A privacy setting or storage fault must not block a lead submission.
      }

      return { fingerprint, key }
    },

    async complete(token: LeadIdempotencyToken) {
      try {
        await storage.removeItem(`${STORAGE_PREFIX}${token.fingerprint}`)
      } catch {
        // The API already accepted the lead; storage cleanup must not turn success into an error.
      }
    },
  }
}
