import { AuthError } from './auth-store.mjs'
import { allowAccountWrite, sendJson } from './auth.mjs'
import { PROGRESS_LIMIT } from '../src/features/auth/progress.mjs'

export async function handleProgressRequest(req, res, store, authenticate) {
  try {
    const user = authenticate()
    if (!user)
      return sendJson(res, 401, { error: '登录已失效，请重新登录后同步；本机进度仍保留。' })
    if (req.method === 'GET') return sendJson(res, 200, store.progress(user.id))
    if (req.method !== 'POST') return sendJson(res, 405, { error: '不支持的进度操作。' })
    if (!allowAccountWrite(req, res)) return
    let size = 0
    const chunks = []
    for await (const chunk of req) {
      size += chunk.length
      if (size > PROGRESS_LIMIT + 1024) {
        sendJson(res, 413, { error: '进度内容过大，本机进度仍保留。' })
        req.destroy()
        return
      }
      chunks.push(chunk)
    }
    let input
    try {
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      throw new AuthError(400, '进度请求格式错误。')
    }
    const current = authenticate()
    if (!current || current.id !== user.id)
      return sendJson(res, 401, { error: '登录已失效，本机进度仍保留。' })
    sendJson(res, 200, store.saveProgress(user.id, input?.data, input?.revision))
  } catch (error) {
    if (error instanceof AuthError) sendJson(res, error.status, { error: error.message })
    else {
      console.error('Progress service failed:', error?.code ?? 'unknown')
      if (!res.headersSent) sendJson(res, 500, { error: '云端保存暂时失败，本机进度仍保留。' })
    }
  }
}
