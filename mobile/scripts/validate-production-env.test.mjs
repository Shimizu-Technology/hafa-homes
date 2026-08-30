import { describe, expect, it } from 'vitest'
import { productionEnvironmentErrors, validateProductionEnvironment } from './validate-production-env.mjs'

const valid = {
  EXPO_PUBLIC_API_URL: 'https://hafa-homes.onrender.com',
  EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_example',
  EXPO_PUBLIC_BROKERAGE_SLUG: 'hafa-homes-demo',
  EXPO_PUBLIC_ENABLE_APPLE_AUTH: 'true',
  EXPO_PUBLIC_MAPBOX_TOKEN: 'pk.example',
}

describe('production mobile environment validation', () => {
  it('accepts the complete production contract', () => {
    expect(() => validateProductionEnvironment(valid)).not.toThrow()
  })

  it('rejects local APIs, test auth, implicit tenancy, and missing release services', () => {
    const errors = productionEnvironmentErrors({
      ...valid,
      EXPO_PUBLIC_API_URL: 'http://localhost:3000',
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
      EXPO_PUBLIC_BROKERAGE_SLUG: '',
      EXPO_PUBLIC_ENABLE_APPLE_AUTH: 'false',
      EXPO_PUBLIC_MAPBOX_TOKEN: '',
    })

    expect(errors).toEqual(expect.arrayContaining([
      'EXPO_PUBLIC_API_URL must use HTTPS',
      'EXPO_PUBLIC_API_URL must use a public production host',
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a live Clerk publishable key',
      'EXPO_PUBLIC_BROKERAGE_SLUG must be an explicit lowercase brokerage slug',
      'EXPO_PUBLIC_ENABLE_APPLE_AUTH must be true for the iOS production build',
      'EXPO_PUBLIC_MAPBOX_TOKEN must be a public Mapbox token',
    ]))
  })

  it('rejects API base paths and non-public network ranges', () => {
    for (const apiUrl of [
      'https://api.example.com/base',
      'https://api.example.com/?tenant=alpha',
      'https://api.example.com/#config',
      'https://169.254.169.254',
      'https://100.64.0.1',
      'https://[::1]',
      'https://service.localhost',
    ]) {
      expect(productionEnvironmentErrors({ ...valid, EXPO_PUBLIC_API_URL: apiUrl }).some((error) => error.includes('API_URL'))).toBe(true)
    }
  })
})
