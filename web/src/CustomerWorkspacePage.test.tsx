// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CustomerWorkspacePage, LeadsPage } from './App'

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => ({ isClerkEnabled: true, isSignedIn: true, isLoading: false, userId: 'staff_12' }),
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

const lead = {
  id: 42,
  lead_type: 'showing_request',
  name: 'Kai Buyer',
  email: 'kai@example.test',
  phone: '+16715550123',
  status: 'contacted',
  created_at: '2026-08-30T23:00:00Z',
  user_id: 7,
  brokerage_id: 2,
  listing: { id: 27, title: 'Yigo family home', price: 775000, listing_kind: 'sale', village: 'Yigo' },
  brokerage: { id: 2, name: 'Alpha Realty', slug: 'alpha' },
  assigned_agent: { id: 3, name: 'Mina Agent', brokerage_id: 2 },
}

const workspace = {
  customer: {
    id: 7,
    full_name: 'Kai Buyer',
    email: 'kai@example.test',
    phone: '+16715550123',
    preferred_contact_method: 'text',
    account_created_at: '2026-07-01T00:00:00Z',
  },
  brokerage: { id: 2, name: 'Alpha Realty', slug: 'alpha' },
  search_profile: {
    id: 9,
    user_id: 7,
    brokerage_id: 2,
    desired_villages: 'Yigo',
    purchase_timeline_label: '1–3 months',
    completion_status: 'complete',
    completion_percentage: 100,
    qualification_summary: 'timeline 1–3 months · villages Yigo',
  },
  requests: [lead],
  metrics: { total_requests: 11, open_requests: 4, upcoming_showings: 2, last_request_at: '2026-08-30T23:00:00Z' },
  pagination: { page: 2, per_page: 10, total_count: 11, total_pages: 2, previous_page: 1, next_page: null },
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderRoute(element: React.ReactNode, initialEntry: string, path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes><Route path={path} element={element} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CustomerWorkspacePage', () => {
  it('renders the composite brokerage customer record and preserves reciprocal context', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input
      return response(workspace)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRoute(
      <CustomerWorkspacePage />,
      '/admin/brokerages/2/customers/7?page=2&return_to=%2Fadmin%2Fleads%2F41',
      '/admin/brokerages/:brokerageId/customers/:customerId',
    )

    expect(await screen.findByRole('heading', { name: 'Kai Buyer', level: 1 })).toBeTruthy()
    expect(screen.getByText('Alpha Realty')).toBeTruthy()
    expect(screen.getAllByText('Yigo').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Back to lead' }).getAttribute('href')).toBe('/admin/leads/41')
    expect(screen.getByRole('link', { name: 'Open lead' }).getAttribute('href')).toBe('/admin/leads/42?return_to=%2Fadmin%2Fbrokerages%2F2%2Fcustomers%2F7%3Fpage%3D2%26return_to%3D%252Fadmin%252Fleads%252F41')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/admin/brokerages/2/customers/7?page=2&per_page=10')
  })

  it('renders the same safe unavailable state for a missing or out-of-scope composite record', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Not found' }, 404)))

    renderRoute(<CustomerWorkspacePage />, '/admin/brokerages/3/customers/7', '/admin/brokerages/:brokerageId/customers/:customerId')

    expect(await screen.findByText('This customer is not available in this brokerage workspace.')).toBeTruthy()
  })
})

describe('LeadsPage operational context', () => {
  it('keeps operational filters in return URLs while excluding private search text', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input
      return response({
        leads: [lead],
        assignable_agents: [],
        metrics: { open_leads: 1, new_leads: 0, showing_leads: 0, price_watch_leads: 0 },
        pagination: { page: 2, per_page: 25, total_count: 1, total_pages: 2, previous_page: 1, next_page: null },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRoute(<LeadsPage />, '/admin/leads?status=contacted&sort=quality_desc&page=2&q=kai%40example.test', '/admin/leads')

    const openLead = await screen.findByRole('link', { name: 'Open lead' })
    expect(openLead.getAttribute('href')).toBe('/admin/leads/42?return_to=%2Fadmin%2Fleads%3Fstatus%3Dcontacted%26sort%3Dquality_desc%26page%3D2')
    expect(screen.getByRole('link', { name: 'Customer workspace' }).getAttribute('href')).not.toContain('kai%40example.test')
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('q=')
  })
})
