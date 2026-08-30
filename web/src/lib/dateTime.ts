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
