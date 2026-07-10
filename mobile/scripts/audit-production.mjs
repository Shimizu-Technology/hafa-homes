import { execFileSync } from 'node:child_process'

const allowedAdvisories = new Map([
  [1120341, {
    expires: '2026-08-10',
    reason: 'Clerk Expo 2.19.31 is the latest published SDK and the affected organization/billing/reverification authorization features are not used by Hafa Homes.',
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

for (const [dependency, finding] of Object.entries(audit.vulnerabilities || {})) {
  if (!['high', 'critical'].includes(finding.severity)) continue

  const sources = finding.via
    .filter((item) => typeof item === 'object' && item.source)
    .map((item) => Number(item.source))
  const exceptions = sources.map((source) => allowedAdvisories.get(source)).filter(Boolean)
  const validException = sources.length > 0 && exceptions.length === sources.length && exceptions.every((item) => new Date(item.expires) >= new Date())

  if (validException) accepted.push({ dependency, sources, exceptions })
  else blocking.push({ dependency, severity: finding.severity, sources })
}

for (const exception of accepted) {
  console.warn(`Accepted temporary advisory for ${exception.dependency}: ${exception.sources.join(', ')}. ${exception.exceptions[0].reason} Expires ${exception.exceptions[0].expires}.`)
}

if (blocking.length > 0) {
  console.error('Blocking production dependency advisories:', blocking)
  process.exit(1)
}

console.log('No unaccepted high or critical production dependency advisories.')
