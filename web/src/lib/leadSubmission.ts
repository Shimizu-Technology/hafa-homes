import type { createLeadIdempotencyManager } from './leadIdempotency'

type LeadIdempotencyManager = ReturnType<typeof createLeadIdempotencyManager>

export type LeadSubmissionConflict = {
  reset_session?: boolean
  reset_idempotency_key?: boolean
}

type SubmitLeadRequestOptions = {
  endpoint: string
  payload: unknown
  ownerId?: string
  authHeaders: Record<string, string>
  idempotency: LeadIdempotencyManager
  fetcher: typeof fetch
}

export async function submitLeadRequest({ endpoint, payload, ownerId, authHeaders, idempotency, fetcher }: SubmitLeadRequestOptions) {
  const idempotencyToken = await idempotency.prepare(payload, authHeaders.Authorization ? ownerId : undefined)
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyToken.key, ...authHeaders },
    body: JSON.stringify({ lead: payload }),
  })

  let conflictPayload: LeadSubmissionConflict | null = null
  if (response.status === 409) {
    conflictPayload = await response.clone().json().catch(() => null) as LeadSubmissionConflict | null
    if (conflictPayload?.reset_idempotency_key) await idempotency.complete(idempotencyToken)
  } else if (response.ok) {
    await idempotency.complete(idempotencyToken)
  }

  return { response, conflictPayload }
}
