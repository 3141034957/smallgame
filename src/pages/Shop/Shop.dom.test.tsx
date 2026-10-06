// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Shop from './index'
import { getStarBalance, STAR_CURRENCY_KEY } from '@/utils/starCurrency'
import { getUnlocks } from '@/features/shop/storage'
import { testStorage } from '@/test/storage'

beforeEach(() => {
  vi.stubGlobal('localStorage', testStorage())
  localStorage.setItem(STAR_CURRENCY_KEY, '3')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('does not spend stars or report success when the purchase cannot be saved', () => {
  render(
    <MemoryRouter>
      <Shop />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: '预览节拍鳄小绿' }))
  const original = localStorage.setItem
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key !== STAR_CURRENCY_KEY) throw new DOMException('quota', 'QuotaExceededError')
    return original(key, value)
  })
  fireEvent.click(screen.getByRole('button', { name: '解锁 · ★1' }))
  expect(screen.queryByText(/🎉 解锁/)).toBeNull()
  expect(screen.getByText(/暂时无法保存/)).toBeTruthy()
  expect(getStarBalance()).toBe(3)
  expect(getUnlocks()).not.toContain('crocodile-beat')
})
