import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { testStorage } from '@/test/storage'
import {
  accountStorage,
  activateAccount,
  installAccountSave,
  readAccountSave,
} from '@/utils/accountStorage'
import { createProgressSync, loadAccountProgress } from './cloud'

const owner = 'account_cloud_test'
const key = 'farm-career-v1'
const reply = (data: Record<string, string>, revision: number) =>
  new Response(JSON.stringify({ data, revision }), { status: 200 })
beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  activateAccount(owner)
  installAccountSave(owner, { data: { [key]: 'old' }, revision: 1, dirty: false })
})
afterEach(() => {
  activateAccount(null)
  vi.unstubAllGlobals()
})

it('uploads writes made during an in-flight save without losing the newer revision', async () => {
  let finish!: (value: Response) => void
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce(reply({ [key]: 'second' }, 3))
  vi.stubGlobal('fetch', fetcher)
  const status = vi.fn()
  const sync = createProgressSync(owner, status)
  accountStorage.setItem(key, 'first')
  const pending = sync.flush()
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  accountStorage.setItem(key, 'second')
  expect(sync.flush()).toBe(pending)
  finish(reply({ [key]: 'first' }, 2))
  expect(await pending).toBe(true)
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    data: { [key]: 'second' },
    revision: 2,
  })
  expect(readAccountSave(owner)).toEqual({ data: { [key]: 'second' }, revision: 3, dirty: false })
  expect(status).toHaveBeenLastCalledWith('saved')
  sync.stop()
})
it('keeps offline changes and retries them, excluding unrelated local keys', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(reply({ [key]: 'new' }, 2))
  vi.stubGlobal('fetch', fetcher)
  const status = vi.fn()
  const sync = createProgressSync(owner, status)
  expect(await sync.flush()).toBe(true)
  accountStorage.setItem(key, 'new')
  accountStorage.setItem('unrelated-secret', 'private')
  expect(await sync.flush()).toBe(false)
  expect(readAccountSave(owner).dirty).toBe(true)
  expect(status).toHaveBeenLastCalledWith('offline')
  expect(await sync.flush()).toBe(true)
  expect(JSON.parse(fetcher.mock.calls[1][1].body).data).toEqual({ [key]: 'new' })
  expect(readAccountSave(owner).dirty).toBe(false)
  sync.stop()
})
it('stops on revision conflicts and preserves a backup when restoring the cloud', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('{"error":"conflict"}', { status: 409 }))
    .mockResolvedValueOnce(reply({ [key]: 'cloud' }, 4))
  vi.stubGlobal('fetch', fetcher)
  accountStorage.setItem(key, 'local')
  const status = vi.fn()
  const sync = createProgressSync(owner, status)
  expect(await sync.flush()).toBe(false)
  expect(await sync.flush()).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(status).toHaveBeenLastCalledWith('conflict')
  expect(readAccountSave(owner).data[key]).toBe('local')
  await loadAccountProgress(owner, new AbortController().signal, true)
  expect(readAccountSave(owner)).toEqual({ data: { [key]: 'cloud' }, revision: 4, dirty: false })
  expect(JSON.parse(localStorage.getItem(`farm-account-backup-v1:${owner}`)!).data[key]).toBe(
    'local',
  )
  sync.stop()
})
it('restores cloud progress on a fresh device and resumes changes made offline at the same revision', async () => {
  localStorage.clear()
  const fetcher = vi.fn().mockImplementation(async () => reply({ [key]: 'remote' }, 8))
  vi.stubGlobal('fetch', fetcher)
  await loadAccountProgress(owner, new AbortController().signal)
  expect(readAccountSave(owner).data[key]).toBe('remote')
  accountStorage.setItem(key, 'offline')
  expect((await loadAccountProgress(owner, new AbortController().signal)).retained).toBe(true)
  expect(readAccountSave(owner)).toEqual({ data: { [key]: 'offline' }, revision: 8, dirty: true })
})
it('migrates a local-only account when the server has no cloud snapshot', async () => {
  localStorage.setItem(`farm-account-save-v1:${owner}`, JSON.stringify({ [key]: 'legacy' }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({}, 0)))
  expect((await loadAccountProgress(owner, new AbortController().signal)).retained).toBe(true)
  expect(readAccountSave(owner)).toEqual({ data: { [key]: 'legacy' }, revision: 0, dirty: true })
})
it('keeps unrelated local keys when the local copy wins over the cloud', async () => {
  installAccountSave(owner, {
    data: { [key]: 'local', 'unrelated-secret': 'private' },
    revision: 2,
    dirty: true,
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ [key]: 'remote' }, 2)))
  const result = await loadAccountProgress(owner, new AbortController().signal)
  expect(result.retained).toBe(true)
  expect(result.backup).toBeNull()
  expect(readAccountSave(owner).data).toEqual({
    [key]: 'local',
    'unrelated-secret': 'private',
  })
})
it('reports the backup key when the cloud replaces local progress', async () => {
  accountStorage.setItem(key, 'local')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ [key]: 'cloud' }, 5)))
  const result = await loadAccountProgress(owner, new AbortController().signal)
  expect(result.backup).toBe(`farm-account-backup-v1:${owner}`)
  expect(JSON.parse(localStorage.getItem(result.backup!)!).data[key]).toBe('local')
})
it('restores the cloud copy even when the local backup cannot be written', async () => {
  accountStorage.setItem(key, 'local')
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ [key]: 'cloud' }, 5)))
  const result = await loadAccountProgress(owner, new AbortController().signal)
  expect(result.backup).toBeNull()
  expect(readAccountSave(owner).data[key]).toBe('cloud')
})
it('sends its own keepalive request instead of reusing an in-flight save', async () => {
  let finish!: (value: Response) => void
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    .mockResolvedValueOnce(reply({ [key]: 'local' }, 2))
  vi.stubGlobal('fetch', fetcher)
  accountStorage.setItem(key, 'local')
  const sync = createProgressSync(owner, vi.fn())
  const first = sync.flush()
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  const leaving = sync.flush(true)
  expect(leaving).not.toBe(first)
  finish(new Response('{"error":"boom"}', { status: 500 }))
  expect(await first).toBe(false)
  expect(await leaving).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(2)
  expect(fetcher.mock.calls[0][1].keepalive).toBe(false)
  expect(fetcher.mock.calls[1][1].keepalive).toBe(true)
  sync.stop()
})
it('does not acknowledge a response arriving after the account synchronizer is stopped', async () => {
  let finish!: (value: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    ),
  )
  accountStorage.setItem(key, 'local')
  const status = vi.fn()
  const sync = createProgressSync(owner, status)
  const pending = sync.flush()
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  sync.stop()
  finish(reply({ [key]: 'local' }, 2))
  expect(await pending).toBe(false)
  expect(readAccountSave(owner).revision).toBe(1)
  expect(readAccountSave(owner).dirty).toBe(true)
  expect(status).not.toHaveBeenCalledWith('saved')
})
