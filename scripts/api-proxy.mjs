import { isIP } from 'node:net'

// Browser requests stay same-origin; Vite forwards them directly to this IP.
export function apiProxyTarget(env = {}) {
  const ip = env.GAME_API_IP?.trim() || '127.0.0.1'
  const port = env.GAME_API_PORT?.trim() || '3001'
  if (!isIP(ip)) throw new Error('GAME_API_IP 必须是有效的 IPv4 或 IPv6 地址，暂不使用域名。')
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error('GAME_API_PORT 必须是 1–65535 的端口号。')
  return `http://${isIP(ip) === 6 ? `[${ip}]` : ip}:${Number(port)}`
}
