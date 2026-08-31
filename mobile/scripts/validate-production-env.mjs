const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::$/,
  /^\[?::1\]?$/,
  /^10\./,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe[89ab][0-9a-f]:/i,
  /\.local$/i,
]

function ipv4MappedAddress(hostname) {
  const match = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!match) return null

  const high = Number.parseInt(match[1], 16)
  const low = Number.parseInt(match[2], 16)
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

function isPrivateHostname(hostname) {
  const normalized = hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  const mappedAddress = ipv4MappedAddress(normalized)
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    (mappedAddress !== null && PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(mappedAddress)))
}

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
      if (!['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash) errors.push('EXPO_PUBLIC_API_URL must be an origin without a path, query, or fragment')
      if (isPrivateHostname(parsed.hostname)) errors.push('EXPO_PUBLIC_API_URL must use a public production host')
    } catch {
      errors.push('EXPO_PUBLIC_API_URL must be a valid absolute URL')
    }
  }

  if (!/^pk_live_\S+$/.test(env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '')) {
    errors.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY must be a live Clerk publishable key')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(env.EXPO_PUBLIC_BROKERAGE_SLUG || '')) {
    errors.push('EXPO_PUBLIC_BROKERAGE_SLUG must be an explicit lowercase brokerage slug')
  }
  if (env.EXPO_PUBLIC_ENABLE_APPLE_AUTH !== 'true') {
    errors.push('EXPO_PUBLIC_ENABLE_APPLE_AUTH must be true for the iOS production build')
  }
  if (!/^pk\.\S+$/.test(env.EXPO_PUBLIC_MAPBOX_TOKEN || '')) {
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
