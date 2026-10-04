import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import MusicFarm from './index'
import { BadgeWall } from './BadgeWall'
import { BuildSummary } from './BuildSummary'
import { CharacterShop } from './CharacterShop'
import { QuestList } from './QuestList'
import { RunTimeline } from './RunTimeline'
import { FarmBoard } from './FarmBoard'
import { loadFarmAchievements } from '@/features/farm/achievements'
import { loadFarmCareer } from '@/features/farm/stats'
import { farmQuests, loadFarmQuests } from '@/features/farm/quests'
import { createFarm, TALENTS } from '@/features/farm/rules.mjs'

// The project has no DOM test environment, so this renders the screens once
// with react-dom/server to catch crashes and missing copy in the new panels.
beforeAll(() => {
  const data = new Map<string, string>()
  const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, String(value)) }, removeItem: (key: string) => { data.delete(key) } }
  Object.assign(globalThis, {
    localStorage: storage,
    window: { matchMedia: () => ({ matches: false }), addEventListener: () => {}, removeEventListener: () => {} },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  })
})

const day = '2026-10-04'

describe('farm screens render', () => {
  it('renders the ready screen with the daily goals and modifier', () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/farm?day=${day}`]}><MusicFarm /></MemoryRouter>)
    expect(html).toContain('怪潮乐队历险记')
    expect(html).toContain('带上你的乐队')
    expect(html).toContain('今日词缀')
    expect(html).toContain('今日目标')
  })
  it('renders the badge wall, quest list, build summary and recap', () => {
    const log = loadFarmAchievements()
    const career = loadFarmCareer()
    expect(renderToStaticMarkup(<BadgeWall log={log} career={career} />)).toContain('成就墙')
    const goals = renderToStaticMarkup(<QuestList quests={farmQuests(day)} log={loadFarmQuests(day)} />)
    expect(goals).toContain('今日目标')
    expect(goals).toContain(farmQuests(day)[0].name)
    expect(goals).toContain('0 / ' + farmQuests(day)[0].target)
    const gear = Object.fromEntries(TALENTS.map((talent) => [talent.id, talent.id === 'drum' || talent.id === 'range' ? 3 : 0])) as Record<string, number>
    const build = renderToStaticMarkup(<BuildSummary gear={gear as never} />)
    expect(build).toContain('雷霆鼓组')
    expect(build).toContain('成员')
    expect(renderToStaticMarkup(<RunTimeline samples={[{ tick: 0, score: 0, hp: 100, maxHp: 100, level: 0, bosses: 0 }]} marks={[0]} seconds={1} />)).toBe('')
    const long = renderToStaticMarkup(<RunTimeline samples={[{ tick: 0, score: 10, hp: 100, maxHp: 100, level: 0, bosses: 0 }, { tick: 32, score: 90, hp: 40, maxHp: 100, level: 1, bosses: 1 }]} marks={[16]} seconds={2} />)
    expect(long).toContain('本局复盘')
    expect(long).toContain('90')
  })
  it('renders the shop and the leaderboard without a board response', () => {
    const profile = { coins: 500, owned: ['steampunk'], selected: 'steampunk', rewardedRuns: [] }
    const shop = renderToStaticMarkup(<CharacterShop profile={profile as never} onChange={() => {}} />)
    expect(shop).toContain('角色商店')
    expect(shop).toContain('500')
    const board = renderToStaticMarkup(<FarmBoard day={day} round={null} />)
    expect(board).toContain('今日无限榜')
    expect(board).toContain('查看日期')
    expect(createFarm(day).day).toBe(day)
  })
})
