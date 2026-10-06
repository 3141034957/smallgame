import { useEffect, useRef, useState } from 'react'

import { qqSongLink } from '@/features/bounce/music'

export type SongContext = { title: string; link: string }
export function ListeningCard({
  song,
  onChange,
  locked,
  stopped,
  muted,
}: {
  song: SongContext
  onChange: (song: SongContext) => void
  locked: boolean
  stopped: boolean
  muted: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source)
    },
    [source],
  )
  useEffect(() => {
    if (audio.current) audio.current.muted = muted
  }, [muted])
  useEffect(() => {
    if (stopped) audio.current?.pause()
  }, [stopped])
  return (
    <section className="bounce-listening">
      <div className="bounce-now-playing">
        <span className="bounce-mini-record">♫</span>
        <div>
          <small>听歌 × 你的演奏</small>
          <strong>{song.title || '软糖原创小曲'}</strong>
        </div>
        <button
          type="button"
          disabled={locked}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '收起' : '换首喜欢的歌'}
        </button>
      </div>
      {expanded && (
        <div className="bounce-song-editor">
          <label>
            歌名
            <input
              maxLength={40}
              value={song.title}
              onChange={(event) => onChange({ ...song, title: event.target.value })}
              placeholder="想弹给朋友的那首歌"
              disabled={locked}
            />
          </label>
          <label>
            QQ 音乐歌曲链接
            <input
              type="url"
              maxLength={1000}
              value={song.link}
              onChange={(event) => onChange({ ...song, link: event.target.value })}
              placeholder="粘贴 QQ 音乐分享中的 https 链接"
              disabled={locked}
            />
          </label>
          {song.link && !qqSongLink(song.link) && (
            <p role="status">请填写 QQ 音乐的 HTTPS 歌曲链接。</p>
          )}
          <label className="bounce-file-label">
            ＋ 选本地音频，一边听一边弹
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                if (file.size > 40 * 1024 * 1024) {
                  setError('请选择 40 MB 以内的音频。')
                  event.target.value = ''
                  return
                }
                setError('')
                setSource(URL.createObjectURL(file))
                onChange({
                  ...song,
                  title: song.title || file.name.replace(/\.[^.]+$/, '').slice(0, 40),
                })
              }}
            />
          </label>
          <small>歌曲链接用于原曲跳转，不会自动下载音频。本地音频只在这台设备播放。</small>
        </div>
      )}
      {source && (
        <audio
          ref={audio}
          src={source}
          controls
          preload="metadata"
          onError={() => setError('这份音频无法播放，请换一个文件。')}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
