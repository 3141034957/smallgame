import { useState } from 'react'
import { CHAPTERS, decodeBoard } from '@/features/echo/engine'
import { scoreGarden } from '@/features/echo/daily'
import type { DailyRecord, EchoSkin, SavedSong } from '@/features/echo/storage'
import { DailyTrail } from './DailyTrail'

type WelcomeScreenProps = {
  collection: SavedSong[]
  storyChapter: number | null
  nightlyCode: string
  dailyRecords: DailyRecord[]
  streak: number
  nextDailyLabel: string
  skin: EchoSkin
  muted: boolean
  onStartStory: () => void
  onContinueStory: () => void
  onStartDaily: () => void
  onOpenSong: (code: string) => void
  onRenameSong: (code: string, title: string) => void
  onRemoveSong: (code: string) => void
  onToggleSkin: () => void
  onToggleMuted: () => void
}

export function WelcomeScreen({
  collection,
  storyChapter,
  nightlyCode,
  dailyRecords,
  streak,
  nextDailyLabel,
  skin,
  muted,
  onStartStory,
  onContinueStory,
  onStartDaily,
  onOpenSong,
  onRenameSong,
  onRemoveSong,
  onToggleSkin,
  onToggleMuted,
}: WelcomeScreenProps) {
  const [renaming, setRenaming] = useState<{ code: string; draft: string } | null>(null)
  const resuming = storyChapter !== null
  const commitRename = (code: string, draft: string) => {
    onRenameSong(code, draft)
    setRenaming(null)
  }

  return (
    <div className="echo-welcome">
      <div className="echo-stars" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => <i key={index} />)}
      </div>
      <div className="echo-welcome-top">
        <div className="echo-brand"><span className="echo-brand-icon">月</span><span>月亮邮局 <small>MOON RADIO / 112 BPM</small></span></div>
        <div className="echo-welcome-tools">
          <button className="echo-icon-button" type="button" onClick={onToggleMuted} aria-pressed={muted} aria-label={muted ? '取消静音' : '静音'} title={muted ? '取消静音' : '静音'}>
            {muted ? '✕' : '♪'}
          </button>
          <button className="echo-icon-button" type="button" onClick={onToggleSkin} aria-label={skin === 'print' ? '换成夜间邮报皮肤' : '换成印刷封套皮肤'} title="换一种封面">
            {skin === 'print' ? '☾' : '▤'}
          </button>
        </div>
      </div>
      <div className="echo-intro-art" aria-hidden="true">
        <div className="echo-intro-moon" />
        <div className="echo-intro-record"><span>♪</span></div>
        <div className="echo-intro-letter"><i>✉</i><span>POSTCARD NO. 001</span></div>
        <span className="echo-intro-spark spark-one">✦</span>
        <span className="echo-intro-spark spark-two">✧</span>
        <span className="echo-intro-spark spark-three">✦</span>
      </div>
      <p className="echo-kicker">夜间声音邮报 / 第 001 期</p>
      <h1>今晚，给月亮<br /><em>种一首歌。</em></h1>
      <p className="echo-intro-copy">有四封来信等着你。把声音种子放上八格唱片，唱针会把你的选择演奏出来。</p>
      <button className="echo-main-button" type="button" onClick={resuming ? onContinueStory : onStartStory}>
        {resuming ? `继续第 ${storyChapter + 1} 封信` : '打开第一封信'} <span>↗</span>
      </button>
      {resuming && <button className="echo-inline-button" type="button" onClick={onStartStory}>从第一封重新种</button>}
      <button className="echo-daily-entry" type="button" onClick={onStartDaily}>
        <span className="echo-daily-entry-icon">06</span>
        <span><strong>每日花谱</strong><small>六次选择 · 同一天，同一首题目{nextDailyLabel ? ` · ${nextDailyLabel}后换题` : ''}</small></span>
        <b>去挑战 ↗</b>
      </button>
      <button className="echo-daily-entry" type="button" onClick={() => onOpenSong(nightlyCode)}>
        <span className="echo-daily-entry-icon">☾</span>
        <span><strong>今晚点播</strong><small>月亮自己种的一张唱片 · {nightlyCode}</small></span>
        <b>试听 ↗</b>
      </button>
      <DailyTrail records={dailyRecords} streak={streak} />
      {collection.length > 0 && (
        <div className="echo-collection" aria-label="我收藏的花房">
          <p className="echo-collection-title">我的花房 · {collection.length} 张唱片</p>
          {collection.map((song) => {
            const board = decodeBoard(song.code)
            return (
              <div className="echo-collection-row" key={song.code}>
                {renaming?.code === song.code ? (
                  <input
                    className="echo-collection-rename"
                    autoFocus
                    value={renaming.draft}
                    maxLength={18}
                    aria-label={`给${song.title}换个名字`}
                    onChange={(event) => setRenaming({ code: song.code, draft: event.target.value })}
                    onBlur={() => commitRename(song.code, renaming.draft)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitRename(song.code, renaming.draft)
                      if (event.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => onOpenSong(song.code)}>
                    <span>♫</span>
                    <strong>{song.title}</strong>
                    <small>{song.code}{board ? ` · ${scoreGarden(board).score} 分` : ''}</small>
                  </button>
                )}
                <button
                  className="echo-collection-mini"
                  type="button"
                  onClick={() => setRenaming({ code: song.code, draft: song.title })}
                  aria-label={`给${song.title}换个名字`}
                >✎</button>
                <button className="echo-collection-mini" type="button" onClick={() => onRemoveSong(song.code)} aria-label={`删掉${song.title}`}>×</button>
              </div>
            )
          })}
        </div>
      )}
      <p className="echo-welcome-foot">共 {CHAPTERS.length} 封来信 · 键盘 1–8 种声音，空格放唱针</p>
      <a className="echo-old-link" href="#/mochi">去玩原来的 Mochi Cat ↗</a>
    </div>
  )
}
