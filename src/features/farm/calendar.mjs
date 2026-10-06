export function routeSeed(day, namespace) {
  let seed = 2166136261
  for (const char of `${day}:${namespace}`)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  return seed
}
export function validDay(day) {
  if (typeof day !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) return false
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day
}
export function todayRoute() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}
