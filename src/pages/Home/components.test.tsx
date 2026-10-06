import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Home from './index'

afterEach(() => vi.unstubAllGlobals())

it('renders the old game even when browser storage is unavailable', () => {
  vi.stubGlobal('localStorage', {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('SecurityError')
    },
  })
  const html = renderToStaticMarkup(<Home />)
  expect(html).toContain('冲吧！小伙子')
  expect(html).toContain('排行榜')
})
