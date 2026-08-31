import { describe, expect, it, vi } from 'vitest'
import { createLeadIdempotencyManager, stableJson } from './leadIdempotency'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value) },
    removeItem: async (key: string) => { values.delete(key) },
  }
}

describe('lead submission idempotency', () => {
  it('canonicalizes equivalent payload key order', () => {
    expect(stableJson({ email: 'buyer@example.test', nested: { b: 2, a: 1 } }))
      .toBe(stableJson({ nested: { a: 1, b: 2 }, email: 'buyer@example.test' }))
  })

  it('reuses a pending key and rotates it only after success', async () => {
    const uuid = vi.fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    const manager = createLeadIdempotencyManager({
      storage: memoryStorage(),
      digest: async (value) => `digest:${value}`,
      uuid,
    })
    const payload = { lead_type: 'contact', email: 'buyer@example.test' }

    const first = await manager.prepare(payload, 'user-1')
    const retry = await manager.prepare({ email: 'buyer@example.test', lead_type: 'contact' }, 'user-1')
    expect(retry.key).toBe(first.key)

    await manager.complete(first)
    const laterSubmission = await manager.prepare(payload, 'user-1')
    expect(laterSubmission.key).not.toBe(first.key)
  })

  it('does not share pending keys between request owners', async () => {
    const manager = createLeadIdempotencyManager({
      storage: memoryStorage(),
      digest: async (value) => `digest:${value}`,
      uuid: vi.fn()
        .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
        .mockReturnValueOnce('22222222-2222-4222-8222-222222222222'),
    })
    const payload = { lead_type: 'contact', email: 'buyer@example.test' }

    const firstOwner = await manager.prepare(payload, 'user-1')
    const secondOwner = await manager.prepare(payload, 'user-2')

    expect(secondOwner.key).not.toBe(firstOwner.key)
  })

  it('continues with a non-persisted key when storage is unavailable', async () => {
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: async () => { throw new Error('storage unavailable') },
        setItem: async () => { throw new Error('storage unavailable') },
        removeItem: async () => undefined,
      },
      digest: async () => 'digest',
      uuid: () => '11111111-1111-4111-8111-111111111111',
    })

    await expect(manager.prepare({ lead_type: 'contact' })).resolves.toEqual({
      fingerprint: 'digest',
      key: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('continues with a non-persisted key when storage writes fail', async () => {
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: async () => null,
        setItem: async () => { throw new Error('storage unavailable') },
        removeItem: async () => undefined,
      },
      digest: async () => 'write-failure-digest',
      uuid: () => '22222222-2222-4222-8222-222222222222',
    })

    await expect(manager.prepare({ lead_type: 'contact' })).resolves.toEqual({
      fingerprint: 'write-failure-digest',
      key: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('shares one key across concurrent preparations for the same request', async () => {
    let releaseRead: (() => void) | undefined
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve })
    let storedValue: string | null = null
    const setItem = vi.fn(async (_key: string, value: string) => { storedValue = value })
    const uuid = vi.fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
    const storage = {
      getItem: async () => { await readGate; return storedValue },
      setItem,
      removeItem: async () => undefined,
    }
    const dependencies = {
      storage,
      digest: async () => 'concurrent-digest',
      uuid,
    }
    const firstManager = createLeadIdempotencyManager(dependencies)
    const secondManager = createLeadIdempotencyManager(dependencies)
    const payload = { lead_type: 'contact', email: 'buyer@example.test' }

    const first = firstManager.prepare(payload, 'user-1')
    const second = secondManager.prepare(payload, 'user-1')
    releaseRead?.()
    const [firstToken, secondToken] = await Promise.all([first, second])

    expect(secondToken.key).toBe(firstToken.key)
    expect(uuid).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledTimes(1)
  })

  it('does not remove a newer key during delayed cleanup', async () => {
    const values = new Map<string, string>()
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => { values.set(key, value) },
        removeItem: async (key) => { values.delete(key) },
      },
      digest: async () => 'delayed-cleanup-digest',
      uuid: () => '11111111-1111-4111-8111-111111111111',
    })
    const firstToken = await manager.prepare({ lead_type: 'contact' })
    const storageKey = [...values.keys()][0]
    values.set(storageKey, '22222222-2222-4222-8222-222222222222')

    await manager.complete(firstToken)

    expect(values.get(storageKey)).toBe('22222222-2222-4222-8222-222222222222')
  })

  it('serializes delayed cleanup with repeated completion and replacement preparation', async () => {
    let releaseFirstRemoval: (() => void) | undefined
    let signalFirstRemoval: (() => void) | undefined
    const firstRemovalGate = new Promise<void>((resolve) => { releaseFirstRemoval = resolve })
    const firstRemovalStarted = new Promise<void>((resolve) => { signalFirstRemoval = resolve })
    const values = new Map<string, string>()
    let removalCount = 0
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: async (key) => values.get(key) ?? null,
        setItem: async (key, value) => { values.set(key, value) },
        removeItem: async (key) => {
          removalCount += 1
          if (removalCount === 1) {
            signalFirstRemoval?.()
            await firstRemovalGate
          }
          values.delete(key)
        },
      },
      digest: async () => 'serialized-cleanup-digest',
      uuid: vi.fn()
        .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
        .mockReturnValueOnce('22222222-2222-4222-8222-222222222222'),
    })
    const payload = { lead_type: 'contact' }
    const firstToken = await manager.prepare(payload)
    const firstCompletion = manager.complete(firstToken)
    await firstRemovalStarted

    const repeatedCompletion = manager.complete(firstToken)
    const replacementPreparation = manager.prepare(payload)
    releaseFirstRemoval?.()
    const [, , replacementToken] = await Promise.all([
      firstCompletion,
      repeatedCompletion,
      replacementPreparation,
    ])
    const storageKey = [...values.keys()][0]

    expect(replacementToken.key).toBe('22222222-2222-4222-8222-222222222222')
    expect(values.get(storageKey)).toBe(replacementToken.key)
  })

  it('does not turn successful submission cleanup into an error', async () => {
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: async () => null,
        setItem: async () => undefined,
        removeItem: async () => { throw new Error('storage unavailable') },
      },
      digest: async () => 'digest',
      uuid: () => '11111111-1111-4111-8111-111111111111',
    })

    const token = await manager.prepare({ lead_type: 'contact' })
    await expect(manager.complete(token)).resolves.toBeUndefined()
  })
})
