import { describe, expect, it } from 'vitest'
import { brokerageHeaders } from './api'

describe('brokerageHeaders', () => {
  it('adds the current storefront hostname to API requests', () => {
    const headers = brokerageHeaders({ Authorization: 'Bearer test' }, 'alpha.test')

    expect(headers.get('Authorization')).toBe('Bearer test')
    expect(headers.get('X-Brokerage-Host')).toBe('alpha.test')
  })

  it('preserves an explicit brokerage host override', () => {
    const headers = brokerageHeaders({ 'X-Brokerage-Host': 'native-preview.test' }, 'alpha.test')

    expect(headers.get('X-Brokerage-Host')).toBe('native-preview.test')
  })
})
