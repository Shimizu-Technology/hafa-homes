// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AdminIntentPage, LeadDetailPage, ListingDetailPage } from './App'

const authState = vi.hoisted(() => ({ userId: 'staff_12' }))

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => ({ isClerkEnabled: true, isSignedIn: true, isLoading: false, userId: authState.userId }),
}))

vi.mock('./components/AuthControls', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
  UserButton: () => null,
}))

vi.mock('./components/Brand', () => ({
  Brand: () => <span>Hafa Homes</span>,
}))

const intentPath = '/admin/intent?status=active&identity=signed_in&sort=views_desc&page=2'
const encodedIntentPath = encodeURIComponent(intentPath)

const intentPayload = {
  lead_intent_sessions: [{
    id: 9,
    status: 'active',
    last_seen_at: '2026-08-30T23:00:00Z',
    identity_label: 'Kai Buyer',
    narrative: 'Viewed the same area repeatedly.',
    user: { id: 7, full_name: 'Kai Buyer', email: 'kai@example.test', role: 'consumer' },
    unique_listing_view_count: 4,
    saved_listing_count: 2,
    form_open_count: 1,
    form_abandon_count: 1,
    latest_listing_id: 27,
    converted_lead: { id: 42, name: 'Kai Buyer', email: 'kai@example.test', status: 'contacted' },
    top_villages: [{ name: 'Yigo', count: 3 }],
    recent_events: [],
  }],
  metrics: { active_sessions: 1, signed_in_sessions: 1, high_intent_sessions: 1, converted_sessions: 1 },
  top_villages: [{ name: 'Yigo', count: 3 }],
  top_listings: [{ id: 27, title: 'Top home', village: 'Yigo', price: 775000, listing_kind: 'sale', view_count: 4 }],
  pagination: { page: 2, per_page: 10, total_count: 11, total_pages: 2, previous_page: 1, next_page: null },
}

const listing = {
  id: 27,
  title: 'Top home',
  address: '130 Charles Flores Street',
  listing_kind: 'sale',
  property_type: 'house',
  status: 'active',
  price: 775000,
  beds: 4,
  baths: 3,
  square_feet: 2300,
  primary_photo_url: 'https://images.example.test/27.jpg',
  village: { id: 4, name: 'Yigo', slug: 'yigo', region: 'north', local_intel: {} },
  features: [],
  brokerage: { id: 2, name: 'Alpha Realty', slug: 'alpha' },
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>
}

function renderRoute(element: React.ReactNode, initialEntry: string, path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  const buildTree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <Routes><Route path={path} element={element} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  const view = render(buildTree())
  return { ...view, rerenderRoute: () => view.rerender(buildTree()) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  authState.userId = 'staff_12'
})

describe('staff intent operational context', () => {
  it('keeps non-PII filters in the URL, strips q, and preserves exact listing and lead returns', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/admin/lead_intent_sessions')) return response(intentPayload)
      if (url.includes('/api/v1/admin/brokerages')) return response({ brokerages: [] })
      return response({})
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRoute(<AdminIntentPage />, `${intentPath}&q=kai%40example.test`, '/admin/intent')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe(intentPath))
    expect((await screen.findByRole('link', { name: /Top home/ })).getAttribute('href')).toBe(`/listings/27?from=admin&return_to=${encodedIntentPath}`)
    expect(screen.getByRole('link', { name: 'View latest listing' }).getAttribute('href')).toBe(`/listings/27?from=admin&return_to=${encodedIntentPath}`)
    expect(screen.getByRole('link', { name: /Open converted lead/ }).getAttribute('href')).toBe(`/admin/leads/42?return_to=${encodedIntentPath}`)
    expect((screen.getByPlaceholderText('Search user, email, village, listing, or behavior') as HTMLInputElement).value).toBe('')
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes('/lead_intent_sessions')).every(([input]) => !String(input).includes('q='))).toBe(true)

    fireEvent.change(screen.getByRole('combobox', { name: 'Intent status' }), { target: { value: 'converted' } })
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/intent?status=converted&identity=signed_in&sort=views_desc'))
  })

  it('removes non-decimal intent page values before querying', async () => {
    const intentRequestUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/admin/lead_intent_sessions')) {
        intentRequestUrls.push(url)
        return response(intentPayload)
      }
      if (url.includes('/api/v1/admin/brokerages')) return response({ brokerages: [] })
      return response({})
    }))

    renderRoute(<AdminIntentPage />, '/admin/intent?page=1e2', '/admin/intent')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/intent'))
    expect(intentRequestUrls.every((url) => !url.includes('page=100'))).toBe(true)
    expect(intentRequestUrls.at(-1)).toContain('page=1')
  })

  it('removes intent page values outside JavaScript safe integer range before querying', async () => {
    const intentRequestUrls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/admin/lead_intent_sessions')) {
        intentRequestUrls.push(url)
        return response(intentPayload)
      }
      if (url.includes('/api/v1/admin/brokerages')) return response({ brokerages: [] })
      return response({})
    }))

    renderRoute(<AdminIntentPage />, '/admin/intent?page=9007199254740992', '/admin/intent')

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/admin/intent'))
    expect(intentRequestUrls.every((url) => !url.includes('page=9007199254740992'))).toBe(true)
    expect(intentRequestUrls.at(-1)).toContain('page=1')
  })

  it('labels an admin listing detour with the exact intent return', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/listings/27')) return response({ listing })
      if (url.endsWith('/api/v1/agents')) return response({ agents: [] })
      return response({})
    }))

    renderRoute(<ListingDetailPage />, `/listings/27?from=admin&return_to=${encodedIntentPath}`, '/listings/:id')

    expect(await screen.findByText('You are viewing this public listing from search intent.')).toBeTruthy()
    const returnLinks = screen.getAllByRole('link', { name: 'Back to intent' })
    expect(returnLinks.length).toBeGreaterThanOrEqual(2)
    returnLinks.forEach((link) => expect(link.getAttribute('href')).toBe(intentPath))
  })

  it('shows a prompt settings load failure and retries it', async () => {
    let brokeragesRequestCount = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/admin/lead_intent_sessions')) return response(intentPayload)
      if (url.includes('/api/v1/admin/brokerages')) {
        brokeragesRequestCount += 1
        return brokeragesRequestCount === 1
          ? response({ error: 'Prompt settings are temporarily unavailable.' }, 503)
          : response({ brokerages: [{ id: 2, name: 'Alpha Realty', slug: 'alpha', settings: {} }] })
      }
      return response({})
    }))

    renderRoute(<AdminIntentPage />, intentPath, '/admin/intent')
    fireEvent.click(await screen.findByRole('button', { name: 'Prompt settings' }))

    expect(await screen.findByText('Prompt settings are temporarily unavailable.')).toBeTruthy()
    expect(screen.queryByText('No brokerages are available for prompt settings.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Alpha Realty')).toBeTruthy()
    expect(brokeragesRequestCount).toBe(2)
  })

  it('ignores an invalid lead id and retains a valid intent return', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/v1/listings/27')) return response({ listing })
      if (url.endsWith('/api/v1/agents')) return response({ agents: [] })
      return response({})
    }))

    renderRoute(<ListingDetailPage />, `/listings/27?from=admin&lead_id=not-a-number&return_to=${encodedIntentPath}`, '/listings/:id')

    const returnLinks = await screen.findAllByRole('link', { name: 'Back to intent' })
    returnLinks.forEach((link) => expect(link.getAttribute('href')).toBe(intentPath))
  })

  it('does not retain another staff user\'s intent records during an auth switch', async () => {
    let resolveSecondRequest: ((value: Response) => void) | undefined
    const secondRequest = new Promise<Response>((resolve) => { resolveSecondRequest = resolve })
    let resolveSecondBrokeragesRequest: ((value: Response) => void) | undefined
    const secondBrokeragesRequest = new Promise<Response>((resolve) => { resolveSecondBrokeragesRequest = resolve })
    let intentRequestCount = 0
    const intentRequestUrls: string[] = []
    let brokeragesRequestCount = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/admin/lead_intent_sessions')) {
        intentRequestCount += 1
        intentRequestUrls.push(String(input))
        return authState.userId === 'staff_99' ? secondRequest : response(intentPayload)
      }
      if (String(input).includes('/api/v1/admin/brokerages')) {
        brokeragesRequestCount += 1
        return brokeragesRequestCount === 1
          ? response({ brokerages: [{ id: 2, name: 'Alpha Realty', slug: 'alpha', settings: {} }] })
          : secondBrokeragesRequest
      }
      return response({})
    })
    vi.stubGlobal('fetch', fetchMock)

    const view = renderRoute(<AdminIntentPage />, intentPath, '/admin/intent')
    expect(await screen.findByText('Kai Buyer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Prompt settings' }))
    expect(await screen.findByText('Alpha Realty')).toBeTruthy()
    const privateSearch = screen.getByPlaceholderText('Search user, email, village, listing, or behavior')
    fireEvent.change(privateSearch, { target: { value: 'private@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(intentRequestUrls.at(-1)).toContain('private%40example.test'))
    const requestCountBeforeSwitch = intentRequestCount

    authState.userId = 'staff_99'
    view.rerenderRoute()

    await waitFor(() => expect(intentRequestCount).toBeGreaterThan(requestCountBeforeSwitch))
    await waitFor(() => expect(brokeragesRequestCount).toBe(2))
    expect(screen.queryByText('Kai Buyer')).toBeNull()
    expect(screen.queryByText('Alpha Realty')).toBeNull()
    expect((privateSearch as HTMLInputElement).value).toBe('')
    expect(intentRequestUrls.at(-1)).not.toContain('private%40example.test')
    resolveSecondRequest?.(response({ ...intentPayload, lead_intent_sessions: [] }))
    resolveSecondBrokeragesRequest?.(response({ brokerages: [] }))
  })

  it('preserves the intent return through a converted lead and its listing', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/leads/42')) {
        return response({
          lead: {
            id: 42,
            lead_type: 'contact',
            name: 'Kai Buyer',
            email: 'kai@example.test',
            status: 'contacted',
            created_at: '2026-08-30T23:00:00Z',
            listing: { id: 27, title: 'Top home', village: 'Yigo', price: 775000, listing_kind: 'sale' },
          },
          assignable_agents: [],
        })
      }
      return response({})
    }))

    renderRoute(<LeadDetailPage />, `/admin/leads/42?return_to=${encodedIntentPath}`, '/admin/leads/:id')

    expect(screen.getByRole('button', { name: 'Back to intent' })).toBeTruthy()
    const leadPath = `/admin/leads/42?return_to=${encodedIntentPath}`
    expect((await screen.findByRole('link', { name: 'View public listing' })).getAttribute('href')).toBe(`/listings/27?from=admin&return_to=${encodeURIComponent(leadPath)}`)
  })
})
