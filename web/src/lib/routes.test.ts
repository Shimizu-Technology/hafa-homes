import { describe, expect, it } from 'vitest'
import { publicAnalyticsPath, routes, safeInternalPath, withReturnTo } from './routes'

describe('safeInternalPath', () => {
  it('keeps internal paths with their query and hash', () => {
    expect(safeInternalPath('/?kind=rent&view=map#results')).toBe('/?kind=rent&view=map#results')
  })

  it('rejects external, protocol-relative, and malformed destinations', () => {
    expect(safeInternalPath('https://example.com/private')).toBe('/')
    expect(safeInternalPath('//example.com/private')).toBe('/')
    expect(safeInternalPath('javascript:alert(1)')).toBe('/')
  })
})

describe('route builders', () => {
  it('encodes exact return context once', () => {
    expect(routes.search('kind=rent&view=map')).toBe('/?kind=rent&view=map')
    expect(routes.search(new URLSearchParams('kind=rent&view=map'))).toBe('/?kind=rent&view=map')
    expect(routes.listing(42, '/?kind=rent&view=map')).toBe('/listings/42?return_to=%2F%3Fkind%3Drent%26view%3Dmap')
    expect(withReturnTo('/listings/42?from=saved', '/account/saved')).toBe('/listings/42?from=saved&return_to=%2Faccount%2Fsaved')
  })

  it('appends return context before the destination fragment', () => {
    expect(withReturnTo('/listings/42#photos', '/account/saved')).toBe('/listings/42?return_to=%2Faccount%2Fsaved#photos')
  })

  it('keeps reserved characters inside one dynamic path identifier', () => {
    expect(routes.listing('a/b?tab=1#photos')).toBe('/listings/a%2Fb%3Ftab%3D1%23photos')
    expect(routes.agent('agent/7')).toBe('/agents/agent%2F7')
    expect(routes.request('request?7')).toBe('/account/requests/request%3F7')
    expect(routes.adminLead('lead#7')).toBe('/admin/leads/lead%237')
    expect(routes.adminCustomer('brokerage/2', 'customer?7')).toBe('/admin/brokerages/brokerage%2F2/customers/customer%3F7')
    expect(routes.adminShowing('showing/7')).toBe('/admin/showings/showing%2F7')
  })

  it('preserves non-PII lead inbox state through customer and lead records', () => {
    const inbox = routes.adminLeads('status=contacted&sort=quality_desc&page=2')
    const customer = routes.adminCustomer(2, 7, inbox)

    expect(inbox).toBe('/admin/leads?status=contacted&sort=quality_desc&page=2')
    expect(customer).toBe('/admin/brokerages/2/customers/7?return_to=%2Fadmin%2Fleads%3Fstatus%3Dcontacted%26sort%3Dquality_desc%26page%3D2')
    expect(routes.adminLead(42, customer)).toContain('return_to=%2Fadmin%2Fbrokerages%2F2%2Fcustomers%2F7')
  })

  it('preserves a request-list page through a request and related listing journey', () => {
    const requestPath = routes.request(1, '/account/requests?page=2')

    expect(requestPath).toBe('/account/requests/1?return_to=%2Faccount%2Frequests%3Fpage%3D2')
    expect(routes.listing(27, requestPath)).toBe('/listings/27?return_to=%2Faccount%2Frequests%2F1%3Freturn_to%3D%252Faccount%252Frequests%253Fpage%253D2')
  })
})

describe('publicAnalyticsPath', () => {
  it('normalizes public record identifiers and removes query strings', () => {
    expect(publicAnalyticsPath('/listings/42?email=private@example.com')).toBe('/listings/:id')
    expect(publicAnalyticsPath('/villages/tamuning')).toBe('/villages/:slug')
  })

  it('does not permit protected routes to be captured', () => {
    expect(publicAnalyticsPath('/admin/leads/12?q=private@example.com')).toBeNull()
    expect(publicAnalyticsPath('/account/requests/9')).toBeNull()
  })
})
