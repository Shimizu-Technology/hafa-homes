import { execFileSync } from 'node:child_process'

const allowedAdvisories = new Map([
  [1138808, {
    expires: '2026-11-16',
    reason: 'No patched image-size release exists yet. The affected ICNS parser is only reached by Metro while processing trusted repository assets during development/builds, not by app users at runtime.',
  }],
  [1138809, {
    expires: '2026-11-16',
    reason: 'No patched image-size release exists yet. The affected JXL/HEIF parsers are only reached by Metro while processing trusted repository assets during development/builds, not by app users at runtime.',
  }],
])

let output
try {
  output = execFileSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (error) {
  output = error.stdout?.toString() || ''
}

const audit = JSON.parse(output)
const blocking = []
const accepted = []
const vulnerabilities = audit.vulnerabilities || {}

function advisorySourcesFor(dependency, visited = new Set()) {
  if (visited.has(dependency)) return new Set()
  visited.add(dependency)

  const finding = vulnerabilities[dependency]
  if (!finding) return new Set()

  const sources = new Set()
  for (const item of finding.via || []) {
    if (typeof item === 'object' && item.source) {
      sources.add(Number(item.source))
    } else if (typeof item === 'string') {
      for (const source of advisorySourcesFor(item, visited)) sources.add(source)
    }
  }
  return sources
}

for (const [dependency, finding] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(finding.severity)) continue

  const sources = [...advisorySourcesFor(dependency)]
  const exceptions = sources.map((source) => allowedAdvisories.get(source)).filter(Boolean)
  const validException = sources.length > 0 && exceptions.length === sources.length && exceptions.every((item) => new Date(item.expires) >= new Date())

  if (validException) accepted.push({ dependency, sources, exceptions })
  else blocking.push({ dependency, severity: finding.severity, sources })
}

const acceptedGroups = new Map()
for (const exception of accepted) {
  const key = exception.sources.sort((a, b) => a - b).join(',')
  const group = acceptedGroups.get(key) || { ...exception, dependencies: [] }
  group.dependencies.push(exception.dependency)
  acceptedGroups.set(key, group)
}

for (const exception of acceptedGroups.values()) {
  const reasons = [...new Set(exception.exceptions.map((item) => item.reason))].join(' ')
  const expiry = exception.exceptions.map((item) => item.expires).sort()[0]
  console.warn(`Accepted temporary advisories ${exception.sources.join(', ')} for dependency graph: ${exception.dependencies.sort().join(', ')}. ${reasons} Expires ${expiry}.`)
}

if (blocking.length > 0) {
  console.error('Blocking production dependency advisories:', blocking)
  process.exit(1)
}

console.log('No unaccepted high or critical production dependency advisories.')
