// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ListingAgentRoutingPanel } from './App'

vi.mock('./components/AuthControls', () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
  UserButton: () => null,
}))

const storefrontAgent = { id: 8, brokerage_id: 2, name: 'Ana Alpha', brokerage: { id: 2, name: 'Alpha Realty' } }

function renderPanel(listingAgent: typeof storefrontAgent, routingAgents = [storefrontAgent]) {
  return render(
    <MemoryRouter initialEntries={['/listings/27?return_to=%2Fagents%2F8']}>
      <ListingAgentRoutingPanel
        listing={{ agent: listingAgent, brokerage: listingAgent.brokerage } as never}
        routingAgents={routingAgents as never}
        selectedAgentId={null}
        canSelectAgent={false}
        isClerkEnabled={false}
        isLoadingAgents={false}
        onSelectAgent={() => undefined}
      />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

describe('ListingAgentRoutingPanel storefront links', () => {
  it('links listing attribution when the agent is active in this storefront directory', () => {
    renderPanel(storefrontAgent)

    expect(screen.getByRole('link', { name: 'View agent profile' }).getAttribute('href')).toBe('/agents/8?return_to=%2Flistings%2F27%3Freturn_to%3D%252Fagents%252F8')
  })

  it('keeps third-party listing attribution non-interactive', () => {
    renderPanel({ id: 19, brokerage_id: 4, name: 'External Agent', brokerage: { id: 4, name: 'External Realty' } })

    expect(screen.queryByRole('link', { name: 'View agent profile' })).toBeNull()
    expect(screen.getByText('Listing attribution')).toBeTruthy()
  })
})
