// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AgentDetailPage } from './App'

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => ({ isClerkEnabled: true, isSignedIn: false, isLoading: false, userId: null }),
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

const agentRecord = {
  agent: {
    id: 8,
    brokerage_id: 2,
    name: 'Ana Alpha',
    email: 'ana@alpha.test',
    phone: '+16715550123',
    license_number: 'GU-123',
    bio: 'North-island relocation specialist',
    brokerage: { id: 2, name: 'Alpha Realty', slug: 'alpha' },
  },
  attributed_listings: [{
    id: 27,
    title: 'Yigo family home',
    address: '130 Charles Flores',
    listing_kind: 'sale',
    property_type: 'house',
    price: 775000,
    beds: 4,
    baths: 3,
    square_feet: 2300,
    primary_photo_url: 'https://images.example.test/27.jpg',
    village: { id: 4, name: 'Yigo', slug: 'yigo' },
    features: [],
  }],
  pagination: { page: 2, per_page: 6, total_count: 7, total_pages: 2, previous_page: 1, next_page: null },
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderRoute(initialEntry = '/agents/8?page=2&return_to=%2Flistings%2F19') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes><Route path="/agents/:id" element={<AgentDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AgentDetailPage', () => {
  it('renders an exact storefront agent and preserves reciprocal listing context', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input
      return response(agentRecord)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderRoute()

    expect(await screen.findByRole('heading', { name: 'Ana Alpha', level: 1 })).toBeTruthy()
    expect(screen.getByText('North-island relocation specialist')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to listing' }).getAttribute('href')).toBe('/listings/19')
    expect(screen.getByRole('link', { name: 'View details' }).getAttribute('href')).toBe('/listings/27?return_to=%2Fagents%2F8%3Fpage%3D2%26return_to%3D%252Flistings%252F19')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/agents/8?page=2&per_page=6')
  })

  it('renders a safe unavailable state for an out-of-storefront agent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'Not found' }, 404)))

    renderRoute('/agents/88')

    expect(await screen.findByText('This agent is not available in this storefront.')).toBeTruthy()
  })
})
