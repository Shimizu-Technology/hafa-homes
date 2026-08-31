type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

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
        const existing = storage.getItem(storageKey)
        if (existing) return { fingerprint, key: existing }

        storage.setItem(storageKey, key)
      } catch {
        // A privacy setting or storage fault must not block a lead submission.
      }

      return { fingerprint, key }
    },

    complete(token: LeadIdempotencyToken) {
      try {
        storage.removeItem(`${STORAGE_PREFIX}${token.fingerprint}`)
      } catch {
        // The API already accepted the lead; storage cleanup must not turn success into an error.
      }
    },
  }
}

async function browserDigest(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await window.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const fallbackMemory = new Map<string, string>()
const fallbackStorage: StorageLike = {
  getItem: (key) => fallbackMemory.get(key) ?? null,
  setItem: (key, value) => { fallbackMemory.set(key, value) },
  removeItem: (key) => { fallbackMemory.delete(key) },
}

function browserStorage(): StorageLike {
  try {
    return window.sessionStorage
  } catch {
    return fallbackStorage
  }
}

export function browserLeadIdempotencyManager() {
  return createLeadIdempotencyManager({
    storage: browserStorage(),
    digest: browserDigest,
    uuid: () => window.crypto.randomUUID(),
  })
}
