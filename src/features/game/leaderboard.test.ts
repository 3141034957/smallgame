import { afterEach, expect, it, vi } from 'vitest'
import { fetchLeaderboard, submitScore } from './leaderboard'

afterEach(() => vi.unstubAllGlobals())

it('reads and submits scores to the deployed server on the current origin', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: [{ rank: 1, characterId: 'steampunk', name: '小猫', score: 100 }],
    }),
  })
  vi.stubGlobal('fetch', fetchMock)
  const controller = new AbortController()
  expect(await fetchLeaderboard(controller.signal)).toHaveLength(1)
  expect(fetchMock.mock.calls[0][0]).toBe('/api/leaderboard')
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
  controller.abort()
  expect(signal.aborted).toBe(true)
  expect(await submitScore('player-0001', '小猫', 100, 'steampunk')).toBe(true)
  expect(fetchMock.mock.calls[1][0]).toBe('/api/score')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    playerId: 'player-0001',
    name: '小猫',
    score: 100,
    characterId: 'steampunk',
  })
})

it('survives malformed boards and failed requests', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) })
  vi.stubGlobal('fetch', fetchMock)
  expect(await fetchLeaderboard()).toEqual([])
  fetchMock.mockRejectedValue(new TypeError('offline'))
  expect(await fetchLeaderboard()).toEqual([])
  expect(await submitScore('player-0001', '小猫', 100, 'steampunk')).toBe(false)
})
