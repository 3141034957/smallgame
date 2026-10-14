import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createFarmStore } from './farm-store.mjs'
import { handleFarmRequest, MAX_FARM_START_BODY_BYTES } from './farm.mjs'

const runId = 'farm_1791993600000_4294967295_0'

async function startRequest(store, body, method = 'POST') {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(body)])
  req.method = method
  const result = { status: 0, data: null, headers: null }
  const res = {
    headersSent: false,
    writeHead(status, headers) {
      result.status = status
      result.headers = headers
      this.headersSent = true
    },
    end(value) {
      result.data = JSON.parse(value)
    },
  }
  await handleFarmRequest(req, res, new URL('http://localhost/api/farm/start'), store)
  return result
}

describe('anonymous farm start reporting', () => {
  it('counts guest runs once, without returning the private total', async () => {
    const store = createFarmStore(':memory:')
    try {
      for (const id of [runId, runId, 'farm_1791993600001_123_456']) {
        const response = await startRequest(store, JSON.stringify({ runId: id }))
        expect(response.status).toBe(200)
        expect(response.data).toEqual({ ok: true })
      }
      expect(store.countStarts()).toBe(2)
    } finally {
      store.close()
    }
  })

  it.each([
    '',
    '{broken',
    'null',
    '{}',
    '{"runId":123}',
    '{"runId":"farm_1_2_3"}',
    '{"runId":"farm_1791993600000_12345678901_0"}',
    '{"runId":"farm_1791993600000_12_34;DROP TABLE farm_run_starts"}',
  ])('rejects malformed or invalid reports: %s', async (body) => {
    const store = { recordStart: vi.fn() }
    expect((await startRequest(store, body)).status).toBe(400)
    expect(store.recordStart).not.toHaveBeenCalled()
  })

  it('rejects an oversized body before storing anything', async () => {
    const store = { recordStart: vi.fn() }
    const body = JSON.stringify({ runId, extra: 'x'.repeat(MAX_FARM_START_BODY_BYTES) })
    expect((await startRequest(store, body)).status).toBe(413)
    expect(store.recordStart).not.toHaveBeenCalled()
  })

  it.each(['GET', 'PUT', 'DELETE'])('rejects %s instead of exposing statistics', async (method) => {
    const response = await startRequest({}, undefined, method)
    expect(response.status).toBe(405)
    expect(response.headers.Allow).toBe('POST')
  })

  it('does not acknowledge reports when storage fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const store = {
        recordStart() {
          throw new Error('database unavailable')
        },
      }
      const response = await startRequest(store, JSON.stringify({ runId }))
      expect(response.status).toBe(500)
      expect(response.data.ok).toBeUndefined()
    } finally {
      logged.mockRestore()
    }
  })
})
