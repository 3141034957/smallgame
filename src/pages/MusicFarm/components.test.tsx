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
import { activateAccount, GUEST_SAVE_KEY, installAccountSave } from '@/utils/accountStorage'
import { FarmHelp } from './FarmHelp'
import { loadFarmAchievements } from '@/features/farm/achievements'
import { loadFarmCareer } from '@/features/farm/stats'
import { farmQuests, loadFarmQuests } from '@/features/farm/quests'
import { createFarm, MAX_GEAR_LEVEL, TALENTS, UPGRADE_CARDS } from '@/features/farm/rules.mjs'
import { schoolById } from '@/features/farm/schools.mjs'
import { FARM_PROFILE_KEY } from '@/features/farm/characters'
import { SCHOOL_COMBOS, SCHOOL_LIST } from '@/features/farm/help'

const resonance = SCHOOL_COMBOS.find((combo) => combo.id === 'resonance')!

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
  it('opens the run with the instrument of the selected character', () => {
    const saved = localStorage.getItem(GUEST_SAVE_KEY)
    localStorage.setItem(
      GUEST_SAVE_KEY,
      JSON.stringify({
        [FARM_PROFILE_KEY]: JSON.stringify({
          coins: 0,
          owned: ['cat-guitar'],
          selected: 'cat-guitar',
          rewardedRuns: [],
        }),
      }),
    )
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/farm?day=${day}`]}>
        <MusicFarm />
      </MemoryRouter>,
    )
    const school = schoolById('orbit')!
    expect(html).toContain('起始')
    expect(html).toContain(school.weaponIcon)
    expect(html).toContain(school.name)
    // The ready screen announces the same loadout the run actually opens with.
    expect(createFarm(day, undefined, 'cat-guitar').gear.orbit).toBe(1)
    if (saved === null) localStorage.removeItem(GUEST_SAVE_KEY)
    else localStorage.setItem(GUEST_SAVE_KEY, saved)
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
    expect(build).toContain('Lv.5 ＋ Lv.5')
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
  it('shows the run schools with their ladder and the combos they unlocked', () => {
    const gear = Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])) as Record<
      string,
      number
    >
    gear.drum = MAX_GEAR_LEVEL
    gear.range = MAX_GEAR_LEVEL
    gear.synth = MAX_GEAR_LEVEL
    gear.arp = MAX_GEAR_LEVEL
    const build = renderToStaticMarkup(
      <BuildSummary gear={gear as never} state={{ gear: gear as never }} />,
    )
    expect(build).toContain('farm-school-ladder')
    expect(build).toContain('鼓组流')
    // Pinned to the layer span: "终极" alone would also match the evolved
    // badge on the same card.
    expect(build).toContain('<span class="farm-school-layer">终极</span>')
    expect(build).toContain('本局组合技')
    expect(build).toContain('共振风暴')
    // The wording comes from the data layer, never recomputed here.
    expect(build).toContain(resonance.effect)
  })
  it('points at the next combo when the run stopped one school short', () => {
    const gear = Object.fromEntries(TALENTS.map((talent) => [talent.id, 0])) as Record<
      string,
      number
    >
    gear.drum = MAX_GEAR_LEVEL
    gear.synth = MAX_GEAR_LEVEL
    const build = renderToStaticMarkup(
      <BuildSummary gear={gear as never} state={{ gear: gear as never }} />,
    )
    expect(build).not.toContain('本局组合技')
    expect(build).toContain('下一步')
    expect(build).not.toContain('下一步：')
    expect(build).toContain('共振风暴')
    expect(build).toContain('还差')
  })
  it('lists every school and combo on the help screen', () => {
    const help = renderToStaticMarkup(<FarmHelp onClose={() => {}} />)
    expect(help).toContain('流派与组合技')
    expect(help).toContain('farm-school-list')
    for (const school of SCHOOL_LIST) {
      expect(help).toContain(school.name)
      expect(help).toContain(school.form)
    }
    for (const combo of SCHOOL_COMBOS) {
      expect(help).toContain(combo.name)
      expect(help).toContain(combo.requirement)
      expect(help).toContain(combo.effect)
    }
    // 「全场安可」has no named schools: it fires on any three evolutions.
    expect(help).toContain('任意 3 个流派完成进化')
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
    expect(renderToStaticMarkup(<FarmBoard round={round as never} />)).toContain(
      '注册并保存本局进度',
    )
    activateAccount('account_ssr_test')
    installAccountSave('account_ssr_test', { data: {}, revision: 1, dirty: false })
    const html = renderToStaticMarkup(<FarmBoard round={round as never} />)
    expect(html).toContain('上榜')
    expect(html).toContain('<label for="farm-player-name">昵称</label>')
    // A player who already saved a nickname goes straight onto the board: no input.
    installAccountSave('account_ssr_test', {
      data: { 'clockwork-player-nickname-v1': '老乐手' },
      revision: 1,
      dirty: false,
    })
    expect(renderToStaticMarkup(<FarmBoard round={round as never} />)).not.toContain(
      'farm-player-name',
    )
    activateAccount(null)
    const stats = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/farm?day=${day}&stats=1`]}>
        <MusicFarm />
      </MemoryRouter>,
    )
    expect(stats).toContain('性能诊断')
  })
  it('renders the shop and the leaderboard without a board response', () => {
    const profile = { coins: 500, owned: ['bear-drums'], selected: 'bear-drums', rewardedRuns: [] }
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
      expect(html).toContain(UPGRADE_CARDS.find((item) => item.id === id)!.name)
    const help = renderToStaticMarkup(<FarmHelp onClose={() => {}} />)
    expect(help).toContain('懂啦，开战')
    expect(help).toContain(`Lv.${MAX_GEAR_LEVEL}`)
  })
})
