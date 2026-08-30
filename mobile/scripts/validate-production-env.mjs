const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /\.local$/i,
]

export function productionEnvironmentErrors(env) {
  const errors = []
  const apiUrl = env.EXPO_PUBLIC_API_URL?.trim()
  if (!apiUrl) {
    errors.push('EXPO_PUBLIC_API_URL is required')
  } else {
    try {
      const parsed = new URL(apiUrl)
      if (parsed.protocol !== 'https:') errors.push('EXPO_PUBLIC_API_URL must use HTTPS')
      if (parsed.username || parsed.password) errors.push('EXPO_PUBLIC_API_URL must not contain credentials')
      if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(parsed.hostname))) errors.push('EXPO_PUBLIC_API_URL must use a public production host')
    } catch {
      errors.push('EXPO_PUBLIC_API_URL must be a valid absolute URL')
    }
  }

  if (!env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_')) {
    errors.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a live Clerk publishable key')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(env.EXPO_PUBLIC_BROKERAGE_SLUG || '')) {
    errors.push('EXPO_PUBLIC_BROKERAGE_SLUG must be an explicit lowercase brokerage slug')
  }
  if (env.EXPO_PUBLIC_ENABLE_APPLE_AUTH !== 'true') {
    errors.push('EXPO_PUBLIC_ENABLE_APPLE_AUTH must be true for the iOS production build')
  }
  if (!env.EXPO_PUBLIC_MAPBOX_TOKEN?.startsWith('pk.')) {
    errors.push('EXPO_PUBLIC_MAPBOX_TOKEN must be a public Mapbox token')
  }

  return errors
}

export function validateProductionEnvironment(env = process.env) {
  const errors = productionEnvironmentErrors(env)
  if (errors.length > 0) throw new Error(`Production mobile configuration is invalid:\n- ${errors.join('\n- ')}`)
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  if (process.env.EAS_BUILD_PROFILE !== 'production') {
    console.log('Skipping production environment validation outside the EAS production profile.')
  } else {
    try {
      validateProductionEnvironment()
      console.log('Production mobile configuration is valid.')
    } catch (error) {
      console.error(error.message)
      process.exit(1)
    }
  }
}
