import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { reportFarmStart } from './runReporting'

const runId = 'farm_1791964800000_123_456'
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('posts one start with a bounded, same-origin keepalive request', async () => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', request)
  await reportFarmStart(runId)
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/farm/start', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Echo-Request': '1' },
    body: JSON.stringify({ runId }),
    keepalive: true,
    signal: expect.any(AbortSignal),
  })
  expect(vi.getTimerCount()).toBe(0)
})

it('reports starts when AbortSignal.timeout is unavailable', async () => {
  vi.stubGlobal(
    'AbortSignal',
    new Proxy(AbortSignal, {
      get(target, property, receiver) {
        return property === 'timeout' ? undefined : Reflect.get(target, property, receiver)
      },
    }),
  )
  const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', request)

  expect(AbortSignal.timeout).toBeUndefined()
  await expect(reportFarmStart(runId)).resolves.toBeUndefined()

  expect(request).toHaveBeenCalledOnce()
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ runId })
  expect(vi.getTimerCount()).toBe(0)
})

it('aborts each stalled attempt after six seconds and retries the same run only once', async () => {
  const signals: AbortSignal[] = []
  const request = vi.fn((_url: string, options: RequestInit) => {
    const signal = options.signal!
    signals.push(signal)
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  })
  vi.stubGlobal('fetch', request)
  const reporting = reportFarmStart(runId)

  await vi.advanceTimersByTimeAsync(5999)
  expect(request).toHaveBeenCalledOnce()
  expect(signals[0].aborted).toBe(false)

  await vi.advanceTimersByTimeAsync(1)
  expect(signals[0].aborted).toBe(true)
  expect(request).toHaveBeenCalledTimes(2)
  expect(signals[1]).not.toBe(signals[0])
  expect(signals[1].aborted).toBe(false)
  expect(vi.getTimerCount()).toBe(1)
  expect(request.mock.calls.map(([, options]) => JSON.parse(options.body as string))).toEqual([
    { runId },
    { runId },
  ])

  await vi.advanceTimersByTimeAsync(5999)
  expect(signals[1].aborted).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await expect(reporting).resolves.toBeUndefined()
  expect(signals[1].aborted).toBe(true)
  expect(request).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['network', 'server'])(
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
    expect(vi.getTimerCount()).toBe(0)
  },
)

it('swallows persistent network failure after the second attempt', async () => {
  const request = vi.fn().mockRejectedValue(new Error('offline'))
  vi.stubGlobal('fetch', request)
  await expect(reportFarmStart(runId)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledTimes(2)
  expect(vi.getTimerCount()).toBe(0)
})

it.each([400, 403, 429])('does not retry HTTP %i', async (status) => {
  const request = vi.fn().mockResolvedValue(new Response(null, { status }))
  vi.stubGlobal('fetch', request)
  await expect(reportFarmStart(runId)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
