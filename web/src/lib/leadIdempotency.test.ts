import { describe, expect, it, vi } from 'vitest'
import { createLeadIdempotencyManager, stableJson } from './leadIdempotency'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('lead submission idempotency', () => {
  it('canonicalizes equivalent payload key order', () => {
    expect(stableJson({ email: 'buyer@example.test', nested: { b: 2, a: 1 } }))
      .toBe(stableJson({ nested: { a: 1, b: 2 }, email: 'buyer@example.test' }))
  })

  it('orders keys by code point instead of the runtime locale', () => {
    expect(stableJson({ ä: 1, z: 2 })).toBe('{"z":2,"ä":1}')
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

    manager.complete(first)
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
        getItem: () => { throw new Error('storage unavailable') },
        setItem: () => { throw new Error('storage unavailable') },
        removeItem: () => undefined,
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
        getItem: () => null,
        setItem: () => { throw new Error('storage unavailable') },
        removeItem: () => undefined,
      },
      digest: async () => 'write-failure-digest',
      uuid: () => '22222222-2222-4222-8222-222222222222',
    })

    await expect(manager.prepare({ lead_type: 'contact' })).resolves.toEqual({
      fingerprint: 'write-failure-digest',
      key: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('does not turn successful submission cleanup into an error', async () => {
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => { throw new Error('storage unavailable') },
      },
      digest: async () => 'digest',
      uuid: () => '11111111-1111-4111-8111-111111111111',
    })

    const token = await manager.prepare({ lead_type: 'contact' })
    expect(() => manager.complete(token)).not.toThrow()
  })

  it('does not remove a newer key during delayed cleanup', async () => {
    const values = new Map<string, string>()
    const manager = createLeadIdempotencyManager({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value) },
        removeItem: (key) => { values.delete(key) },
      },
      digest: async () => 'delayed-cleanup-digest',
      uuid: () => '11111111-1111-4111-8111-111111111111',
    })
    const firstToken = await manager.prepare({ lead_type: 'contact' })
    const storageKey = [...values.keys()][0]
    values.set(storageKey, '22222222-2222-4222-8222-222222222222')

    manager.complete(firstToken)

    expect(values.get(storageKey)).toBe('22222222-2222-4222-8222-222222222222')
  })
})
