// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { testStorage } from './test/storage'

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
      async () => new Response(JSON.stringify({ data: [], total: 0, own: null }), { status: 200 }),
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

it.each([
  '/',
  '/farm',
  '/wave',
  '/bounce?mode=tour',
  '/island',
  '/rhythm',
  '/echo',
  '/mochi',
  '/shop',
  '/missing',
])('loads and unmounts %s with real effects under StrictMode', async (path) => {
  const title = '怪潮乐队历险记'
  const view = render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  )
  await screen.findAllByText(
    (_, element) =>
      element?.textContent?.includes(title) === true &&
      !Array.from(element.children).some((child) => child.textContent?.includes(title)),
  )
  view.unmount()
})

it('opens and closes the farm help dialog', async () => {
  render(
    <MemoryRouter initialEntries={['/farm']}>
      <App />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: '查看进化配方' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /懂啦，开战/ }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
