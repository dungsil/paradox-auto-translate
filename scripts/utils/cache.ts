const translationCache = new Map<string, string>()

export function hasCache (key: string) {
  return translationCache.has(key)
}

export function getCache (key: string) {
  return translationCache.get(key)
}

export function setCache (key: string, value: string) {
  translationCache.set(key, value)
}
