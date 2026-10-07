// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { testStorage } from './test/storage'
import { FARM_HELP_SEEN_KEY } from '@/features/farm/help'

beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  )
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes('/api/auth/session')
              ? {
                  user: {
                    id: 'account_00000000-0000-4000-8000-000000000001',
                    username: 'test_player',
                  },
                }
              : url.includes('/api/progress')
                ? { data: {}, revision: 1 }
                : { data: [], total: 0, own: null },
          ),
          { status: 200 },
        ),
    ),
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each(['/', '/farm', '/missing'])(
  'loads and unmounts %s with real effects under StrictMode',
  async (path) => {
    const title = '怪潮乐队历险记'
    const view = render(
      <StrictMode>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </StrictMode>,
    )
    await screen.findByRole('button', { name: '退出登录' })
    await screen.findAllByText(
      (_, element) =>
        element?.textContent?.includes(title) === true &&
        !Array.from(element.children).some((child) => child.textContent?.includes(title)),
    )
    view.unmount()
  },
)

it('closes the open dialog on the back gesture instead of dropping the run', async () => {
  localStorage.setItem(FARM_HELP_SEEN_KEY, '1')
  render(
    <MemoryRouter initialEntries={['/farm']}>
      <App />
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: '退出登录' })
  fireEvent.click(screen.getByRole('button', { name: '开始无限模式' }))
  fireEvent.click(screen.getByRole('button', { name: '查看进化配方' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  // The dialog owns the back gesture through a placeholder history entry.
  expect(window.history.state).toMatchObject({ farmDialog: true })
  await act(async () => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  // A remount would have thrown the player back to the start card.
  expect(screen.queryByRole('button', { name: '开始无限模式' })).toBeNull()
  expect(screen.getByRole('button', { name: '暂停游戏' })).toBeTruthy()
})

it('opens and closes the farm help dialog', async () => {
  render(
    <MemoryRouter initialEntries={['/farm']}>
      <App />
    </MemoryRouter>,
  )
  await screen.findByRole('button', { name: '退出登录' })
  fireEvent.click(screen.getByRole('button', { name: '查看进化配方' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /懂啦，开战/ }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
