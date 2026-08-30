export function datetimeLocalValue(value?: string, timeZone?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).formatToParts(date)
      const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
      const year = part('year')
      const month = part('month')
      const day = part('day')
      const hour = part('hour')
      const minute = part('minute')
      if (year && month && day && hour && minute) return `${year}-${month}-${day}T${hour}:${minute}`
    } catch {
      // Fall back to the browser timezone when an API timezone is invalid.
    }
  }

  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

export function zonedDateTimeToIso(value: string, timeZone: string, originalValue?: string) {
  if (!value) return ''
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return value

  const [, year, month, day, hour, minute] = match
  const intendedWallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })

    const representedWallTime = (instant: number) => {
      const parts = formatter.formatToParts(new Date(instant))
      const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
      return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'))
    }
    const offsetAt = (instant: number) => representedWallTime(instant) - Math.trunc(instant / 60_000) * 60_000
    const candidateForOffset = (offset: number) => intendedWallTime - offset
    const matchesWallTime = (instant: number) => representedWallTime(instant) === intendedWallTime

    const originalInstant = originalValue ? Date.parse(originalValue) : Number.NaN
    if (!Number.isNaN(originalInstant)) {
      const originalOffsetCandidate = candidateForOffset(offsetAt(originalInstant))
      if (matchesWallTime(originalOffsetCandidate)) return new Date(originalOffsetCandidate).toISOString()
    }

    const offsets = new Set<number>()
    for (let hours = -36; hours <= 36; hours += 6) {
      offsets.add(offsetAt(intendedWallTime + hours * 60 * 60 * 1000))
    }
    const matchingCandidates = [...offsets]
      .map(candidateForOffset)
      .filter(matchesWallTime)
      .sort((first, second) => first - second)
    // A newly entered repeated wall time defaults to its earlier occurrence.
    if (matchingCandidates.length > 0) return new Date(matchingCandidates[0]).toISOString()

    let candidate = intendedWallTime
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const correction = intendedWallTime - representedWallTime(candidate)
      candidate += correction
      if (correction === 0) break
    }

    return new Date(candidate).toISOString()
  } catch {
    const local = new Date(value)
    return Number.isNaN(local.getTime()) ? value : local.toISOString()
  }
}
