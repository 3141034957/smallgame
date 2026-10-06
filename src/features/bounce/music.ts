export function qqSongLink(value: string): string {
  if (value.length > 1000) return ''
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !['y.qq.com', 'c.y.qq.com', 'i.y.qq.com', 'qqmusic.qq.com'].includes(url.hostname) ||
      url.port
    )
      return ''
    return url.toString()
  } catch {
    return ''
  }
}
