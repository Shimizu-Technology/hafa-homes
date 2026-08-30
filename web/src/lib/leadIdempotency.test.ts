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

    const first = await manager.prepare(payload)
    const retry = await manager.prepare({ email: 'buyer@example.test', lead_type: 'contact' })
    expect(retry.key).toBe(first.key)

    manager.complete(first)
    const laterSubmission = await manager.prepare(payload)
    expect(laterSubmission.key).not.toBe(first.key)
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
})
