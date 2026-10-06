import { expect, it } from 'vitest'
import postcss from 'postcss'
import config from '../postcss.config.js'

it('keeps source paths on generated mobile rules for asset resolution', async () => {
  const result = await postcss(config.plugins).process(
    '.pc-mobile-wrapper.is-pc .mobile-body { width: 375px; } .card { width: 187px; background: url(./cover.png); } .norem { width: 10px; }',
    { from: '/project/src/card.css' },
  )
  const declarations = []
  result.root.walkDecls((declaration) => declarations.push(declaration))
  expect(declarations.length).toBeGreaterThan(3)
  expect(
    declarations.every((declaration) => declaration.source?.input.file === '/project/src/card.css'),
  ).toBe(true)
  expect(result.css).toContain('100vw')
  expect(result.css).toContain('./cover.png')
  expect(result.css).toContain('10px')
})
