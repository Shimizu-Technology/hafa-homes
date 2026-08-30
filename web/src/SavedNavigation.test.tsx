// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SavedPage } from './App'

vi.mock('./contexts/AuthContext', () => ({
  useAuthContext: () => ({ isClerkEnabled: true, isSignedIn: true, isLoading: false, userId: 'user_7' }),
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

const savedListing = {
  id: 27,
  title: 'Saved Yigo home',
  address: '130 Charles Flores Street',
  listing_kind: 'sale',
  property_type: 'house',
  status: 'active',
  price: 775000,
  beds: 4,
  baths: 3,
  square_feet: 2300,
  primary_photo_url: 'https://images.example.test/27.jpg',
  village: { id: 4, name: 'Yigo', slug: 'yigo', region: 'north' },
  features: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('saved-home listing returns', () => {
  it('routes every saved-home listing entry back through the saved record collection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ listings: [savedListing], listing_ids: [27] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/saved']}>
          <Routes><Route path="/saved" element={<SavedPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const destinations = await screen.findAllByRole('link', { name: /Saved Yigo home|View details/ })
    expect(destinations.length).toBeGreaterThanOrEqual(2)
    destinations.forEach((link) => expect(link.getAttribute('href')).toBe('/listings/27?return_to=%2Fsaved'))
  })
})
