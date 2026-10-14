import { afterEach, expect, it, vi } from 'vitest'
import { reportFarmStart } from './runReporting'

const runId = 'farm_1791964800000_123_456'
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('posts one start with a bounded, same-origin keepalive request', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', request)
  const timeout = vi.spyOn(AbortSignal, 'timeout')
  await reportFarmStart(runId)
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/farm/start', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Echo-Request': '1' },
    body: JSON.stringify({ runId }),
    keepalive: true,
    signal: expect.any(AbortSignal),
  })
  expect(timeout).toHaveBeenCalledWith(6000)
})

it.each(['network', 'timeout', 'server'])(
  'retries a %s failure once with the same run ID',
  async (failure) => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    if (failure === 'server') request.mockResolvedValueOnce(new Response(null, { status: 503 }))
    else request.mockRejectedValueOnce(new Error(failure))
    vi.stubGlobal('fetch', request)
    await expect(reportFarmStart(runId)).resolves.toBeUndefined()
    expect(request).toHaveBeenCalledTimes(2)
    expect(request.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual([
      { runId },
      { runId },
    ])
    expect(request.mock.calls[0][1].signal).not.toBe(request.mock.calls[1][1].signal)
  },
)

it('swallows persistent network failure after the second attempt', async () => {
  const request = vi.fn().mockRejectedValue(new Error('offline'))
  vi.stubGlobal('fetch', request)
  await expect(reportFarmStart(runId)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledTimes(2)
})

it.each([400, 403, 429])('does not retry HTTP %i', async (status) => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status }))
  vi.stubGlobal('fetch', request)
  await expect(reportFarmStart(runId)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledOnce()
})
