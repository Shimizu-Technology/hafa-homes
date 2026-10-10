export type ServiceAvailability = 'available' | 'paused'
// Only development builds can point at an isolated availability fixture.
export const SERVICE_STATUS_URL = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_SERVICE_STATUS_URL
  ? process.env.EXPO_PUBLIC_SERVICE_STATUS_URL
  : 'https://hafahomes.com/service-status.json'
export const STATUS_TIMEOUT_MS = 5000

export async function readServiceAvailability(signal?: AbortSignal, fetcher = globalThis.fetch): Promise<ServiceAvailability> {
  if (signal?.aborted) throw new Error('Availability check cancelled')
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  let cancel: (() => void) | undefined

  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = () => { controller.abort(); reject(new Error('Availability check cancelled')) }
    signal?.addEventListener('abort', cancel, { once: true })
  })
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('Availability check timed out')) }, STATUS_TIMEOUT_MS)
  })
  const status = async () => {
    const response = await fetcher(SERVICE_STATUS_URL, { cache: 'no-store', signal: controller.signal })
    if (!response.ok) throw new Error('Availability check failed')
    const body: unknown = await response.json()
    const state = body && typeof body === 'object' && 'state' in body ? body.state : undefined
    if (state !== 'paused' && state !== 'available') throw new Error('Invalid availability response')
    return state
  }

  try {
    return await Promise.race([status(), deadline, cancelled])
  } finally {
    clearTimeout(timeout)
    if (cancel) signal?.removeEventListener('abort', cancel)
  }
}
