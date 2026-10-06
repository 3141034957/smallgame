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
import { UpgradeChoices } from './UpgradeChoices'
import { FarmHelp } from './FarmHelp'
import { loadFarmAchievements } from '@/features/farm/achievements'
import { loadFarmCareer } from '@/features/farm/stats'
import { farmQuests, loadFarmQuests } from '@/features/farm/quests'
import { createFarm, MAX_GEAR_LEVEL, TALENTS } from '@/features/farm/rules.mjs'

// SSR catches missing copy without running effects; the *.dom.test.tsx suites
// also mount the real screens and exercise lifecycle and player interactions.
beforeAll(() => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value))
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
  Object.assign(globalThis, {
    localStorage: storage,
    window: {
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  })
})

const day = '2026-10-04'

describe('farm screens render', () => {
  it('renders the ready screen with just the leaderboard and the start button', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/farm?day=${day}`]}>
        <MusicFarm />
      </MemoryRouter>,
    )
    expect(html).toContain('怪潮乐队历险记')
    expect(html).toContain('带上你的乐队')
    expect(html).toContain('0 / 20 经验')
    // The start screen stays focused: leaderboard and start button, nothing else.
    expect(html).toContain('无限总榜')
    expect(html).not.toContain('今日词缀')
    expect(html).not.toContain('今日目标')
  })
  it('renders the badge wall, quest list, build summary and recap', () => {
    const log = loadFarmAchievements()
    const career = loadFarmCareer()
    expect(renderToStaticMarkup(<BadgeWall log={log} career={career} />)).toContain('成就墙')
    const goals = renderToStaticMarkup(
      <QuestList quests={farmQuests(day)} log={loadFarmQuests(day)} />,
    )
    expect(goals).toContain('今日目标')
    expect(goals).toContain(farmQuests(day)[0].name)
    expect(goals).toContain('0 / ' + farmQuests(day)[0].target)
    const gear = Object.fromEntries(
      TALENTS.map((talent) => [
        talent.id,
        talent.id === 'drum' || talent.id === 'range' ? MAX_GEAR_LEVEL : 0,
      ]),
    ) as Record<string, number>
    const build = renderToStaticMarkup(<BuildSummary gear={gear as never} />)
    expect(build).toContain('雷霆鼓组')
    expect(build).toContain('成员')
    expect(
      renderToStaticMarkup(
        <RunTimeline
          samples={[{ tick: 0, score: 0, hp: 100, maxHp: 100, level: 0, bosses: 0 }]}
          marks={[0]}
          seconds={1}
        />,
      ),
    ).toBe('')
    const long = renderToStaticMarkup(
      <RunTimeline
        samples={[
          { tick: 0, score: 10, hp: 100, maxHp: 100, level: 0, bosses: 0 },
          { tick: 32, score: 90, hp: 40, maxHp: 100, level: 1, bosses: 1 },
        ]}
        marks={[16]}
        seconds={2}
      />,
    )
    expect(long).toContain('本局复盘')
    expect(long).toContain('90')
  })
  it('renders the leaderboard submit form for a finished round and the stats overlay', () => {
    const round = {
      day,
      frames: [[50, 76]],
      choices: [],
      surges: [],
      outcome: 'defeated',
      hp: 0,
      seconds: 42,
      score: 4321,
      maxCombo: 12,
      harvested: 90,
      bosses: 1,
      elites: 0,
      blocks: 0,
      maxShields: 0,
      coins: 200,
      xp: 30,
      stars: 1,
      gear: Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])),
    }
    const html = renderToStaticMarkup(<FarmBoard round={round as never} />)
    expect(html).toContain('上榜')
    expect(html).toContain('取个昵称，把这一局送上总榜')
    // A player who already saved a nickname goes straight onto the board: no input.
    localStorage.setItem('clockwork-player-nickname-v1', '老乐手')
    expect(renderToStaticMarkup(<FarmBoard round={round as never} />)).not.toContain(
      'farm-player-name',
    )
    localStorage.removeItem('clockwork-player-nickname-v1')
    const stats = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/farm?day=${day}&stats=1`]}>
        <MusicFarm />
      </MemoryRouter>,
    )
    expect(stats).toContain('性能诊断')
  })
  it('renders the shop and the leaderboard without a board response', () => {
    const profile = { coins: 500, owned: ['steampunk'], selected: 'steampunk', rewardedRuns: [] }
    const shop = renderToStaticMarkup(
      <CharacterShop profile={profile as never} onChange={() => {}} />,
    )
    expect(shop).toContain('角色商店')
    expect(shop).toContain('500')
    const board = renderToStaticMarkup(<FarmBoard round={null} />)
    expect(board).toContain('无限总榜')
    expect(board).not.toContain('查看日期')
    expect(board).not.toContain('type="date"')
    expect(board).toContain('aria-label="刷新生存榜"')
    expect(createFarm(day).day).toBe(day)
    const compact = renderToStaticMarkup(<FarmBoard compact />)
    expect(compact).toContain('无限总榜')
    expect(compact).toContain('is-compact')
    expect(compact).not.toContain('留下这一局的战绩')
    expect(compact).not.toContain('当前浏览器记住你的昵称')
  })
  it('renders extracted upgrade and help panels with their recipe levels', () => {
    const state = createFarm(day)
    const html = renderToStaticMarkup(
      <UpgradeChoices gear={state.gear} offered={state.offered} onSelect={() => {}} />,
    )
    expect(html).toContain('LEVEL UP')
    expect(html).toContain('farm-choices')
    for (const id of state.offered)
      expect(html).toContain(TALENTS.find((item) => item.id === id)!.name)
    const help = renderToStaticMarkup(<FarmHelp onClose={() => {}} />)
    expect(help).toContain('懂啦，开战')
    expect(help).toContain(`Lv.${MAX_GEAR_LEVEL}`)
  })
})
