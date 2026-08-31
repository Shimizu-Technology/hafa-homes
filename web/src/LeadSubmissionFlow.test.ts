import { describe, expect, it, vi } from 'vitest'
import { createLeadIdempotencyManager } from './lib/leadIdempotency'
import { submitLeadRequest } from './lib/leadSubmission'

const payload = {
  lead_type: 'showing_request' as const,
  name: 'Retrying buyer',
  email: 'buyer@example.test',
  phone: '',
  preferred_contact_method: 'email',
  message: 'Please tell me more.',
}

describe('lead submission request flow', () => {
  it('rotates the pending key after a server-directed idempotency reset', async () => {
    const values = new Map<string, string>()
    let sequence = 0
    const idempotency = createLeadIdempotencyManager({
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value) },
        removeItem: (key) => { values.delete(key) },
      },
      digest: async (value) => `digest:${value}`,
      uuid: () => `${++sequence}`.padStart(8, '0') + '-0000-4000-8000-000000000000',
    })
    const keys: string[] = []
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      keys.push(new Headers(init?.headers).get('Idempotency-Key') || '')
      if (keys.length === 1) {
        return new Response(JSON.stringify({ reset_idempotency_key: true }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ lead: { id: 42 } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    const first = await submitLeadRequest({ endpoint: '/api/v1/leads', payload, authHeaders: {}, idempotency, fetcher: fetchMock })
    expect(first.conflictPayload?.reset_idempotency_key).toBe(true)
    const second = await submitLeadRequest({ endpoint: '/api/v1/leads', payload, authHeaders: {}, idempotency, fetcher: fetchMock })
    expect(second.response.status).toBe(201)

    expect(keys).toHaveLength(2)
    expect(keys[1]).not.toBe(keys[0])
  })

  it('scopes a key to an owner only when authorization is actually sent', async () => {
    const prepare = vi.fn(async () => ({ fingerprint: 'digest', key: '11111111-1111-4111-8111-111111111111' }))
    const complete = vi.fn()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ lead: { id: 42 } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }))

    await submitLeadRequest({
      endpoint: '/api/v1/leads',
      payload,
      ownerId: 'user-1',
      authHeaders: {},
      idempotency: { prepare, complete },
      fetcher,
    })
    await submitLeadRequest({
      endpoint: '/api/v1/leads',
      payload,
      ownerId: 'user-1',
      authHeaders: { Authorization: 'Bearer token' },
      idempotency: { prepare, complete },
      fetcher,
    })

    expect(prepare).toHaveBeenNthCalledWith(1, payload, undefined)
    expect(prepare).toHaveBeenNthCalledWith(2, payload, 'user-1')
  })
})
