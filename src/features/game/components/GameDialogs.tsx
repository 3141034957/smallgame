import { formatScore } from '@/features/game/engine'

type ResultDialogProps = {
  mode: 'paused' | 'over'
  score: number
  best: number
  shareStatus: 'idle' | 'copied' | 'failed'
  reviveCount: number
  maxRevives: number
  onResume: () => void
  onShare: () => void
  onRevive: () => void
  onReturnHome: () => void
}

export function ResultDialog({
  mode,
  score,
  best,
  shareStatus,
  reviveCount,
  maxRevives,
  onResume,
  onShare,
  onRevive,
  onReturnHome,
}: ResultDialogProps) {
  const remainingRevives = Math.max(0, maxRevives - reviveCount)

  return (
    <div
      className={`game-overlay game-overlay--${mode}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="overlay-card">
        {mode === 'paused' ? (
          <>
            <span className="pause-paw">🐾</span>
            <h2>休息一下</h2>
            <p>小小巡检员正在平台上等你</p>
            <button className="primary-button" type="button" onClick={onResume}>
              继续游戏
            </button>
          </>
        ) : (
          <>
            <button
              className={`death-share-button death-share-button--${shareStatus}`}
              type="button"
              onClick={onShare}
              aria-label="复制当前网页链接"
            >
              {shareStatus === 'copied'
                ? '已复制'
                : shareStatus === 'failed'
                  ? '复制失败'
                  : '↗ 分享'}
            </button>
            <span className="eyebrow">GOOD TRY!</span>
            <h2>差一点点</h2>
            <div className="result-score">
              <span>本次得分</span>
              <strong>{formatScore(score)}</strong>
            </div>
            <div className="result-best">最佳记录 {formatScore(best)}</div>
            <p className="revive-notice">
              {remainingRevives > 0
                ? `🎉 本局还可复活 ${remainingRevives} 次`
                : `本局 ${maxRevives} 次复活机会已用完`}
            </p>
            <button
              className="primary-button primary-button--revive"
              type="button"
              onClick={onRevive}
              disabled={remainingRevives === 0}
            >
              {remainingRevives > 0 ? '看广告免费复活' : '复活次数已达上限'}
            </button>
            <button className="text-button" type="button" onClick={onReturnHome}>
              返回主页
            </button>
          </>
        )}
      </div>
    </div>
  )
}

type NicknameDialogProps = {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function NicknameDialog({ value, onChange, onSave, onCancel }: NicknameDialogProps) {
  return (
    <div className="nickname-overlay" onPointerDown={(event) => event.stopPropagation()}>
      <div className="nickname-dialog">
        <span className="eyebrow">PLAYER PROFILE</span>
        <h2>留下你的昵称</h2>
        <p>昵称只需填写一次，下次会直接返回主页</p>
        <input
          className="nickname-input"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={12}
          placeholder="输入 1–12 个字符"
          autoComplete="nickname"
          autoFocus
          aria-label="玩家昵称"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && value.trim()) {
              event.preventDefault()
              onSave()
            }
          }}
        />
        <button className="primary-button" type="button" onClick={onSave} disabled={!value.trim()}>
          保存并返回主页
        </button>
        <button className="text-button" type="button" onClick={onCancel}>
          暂不返回
        </button>
      </div>
    </div>
  )
}

export function AdDialog({
  countdown,
  canSkip,
  onSkip,
}: {
  countdown: number
  canSkip: boolean
  onSkip: () => void
}) {
  return (
    <div className="ad-overlay" onPointerDown={(event) => event.stopPropagation()}>
      <div className="ad-overlay-card">
        <span className="ad-label">📺 广告</span>
        <div className="ad-sim-placeholder">
          <span className="ad-sim-icon">🎬</span>
          <p>观看广告获取免费复活机会</p>
          <small>广告还有 {countdown} 秒</small>
        </div>
        <div className="ad-countdown-bar">
          <i style={{ width: `${(countdown / 10) * 100}%` }} />
        </div>
        {canSkip ? (
          <button className="ad-skip-button" type="button" onClick={onSkip}>
            跳过广告
          </button>
        ) : (
          <span className="ad-skip-hint">剩余 {countdown - 7}s 后可跳过</span>
        )}
      </div>
    </div>
  )
}

export function CountdownOverlay({ mode, value }: { mode: 'resume' | 'revive'; value: number }) {
  const isResume = mode === 'resume'
  return (
    <div
      className={`${isResume ? 'resume' : 'revive'}-countdown-overlay`}
      role="status"
      aria-live="assertive"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span>{isResume ? '准备继续' : '复活准备'}</span>
      <strong key={value}>{value}</strong>
      <small>倒计时结束后{isResume ? '继续游戏' : '继续跳跃'}</small>
    </div>
  )
}
