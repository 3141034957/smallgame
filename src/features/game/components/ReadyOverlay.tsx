export type LeaderboardEntry = { rank: number; name: string; score: number }

type ReadyOverlayProps = {
  entries: LeaderboardEntry[]
  onStart: () => void
  onOpenShop: () => void
}

export function ReadyOverlay({ entries, onStart, onOpenShop }: ReadyOverlayProps) {
  return (
    <div className="game-overlay game-overlay--ready" onPointerDown={(event) => event.stopPropagation()}>
      <div className="ready-panel">
        <div className="overlay-ready-title">
          <span className="eyebrow">THE CLOCKWORK CAVERN</span>
          <h1>冲吧！小伙子</h1>
        </div>
        <p className="ready-description">穿过古老机械核心，踏上每一座能量平台</p>
        <div className="leaderboard">
          <div className="leaderboard-header">
            <span className="leaderboard-title">🏆 排行榜</span>
            <span className="leaderboard-subtitle">TOP 100</span>
          </div>
          <div className="leaderboard-columns" aria-hidden="true">
            <span>名次</span><span>玩家</span><span>分数</span>
          </div>
          <div className="leaderboard-list" onPointerDown={(event) => event.stopPropagation()}>
            {entries.map((entry) => (
              <div
                className={`leaderboard-row${entry.rank <= 3 ? ` leaderboard-row--top${entry.rank}` : ''}`}
                key={entry.rank}
              >
                <span className="leaderboard-rank">
                  {entry.rank <= 3 ? ['🥇', '🥈', '🥉'][entry.rank - 1] : entry.rank}
                </span>
                <span className="leaderboard-name">{entry.name}</span>
                <span className="leaderboard-score">{entry.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="overlay-ready-action">
          <button className="primary-button" type="button" onClick={onStart}>开始跳跃</button>
          <div className="overlay-ready-row">
            <button className="shop-entry-button" type="button" onClick={onOpenShop}>
              ⚙ 角色工坊
            </button>
            <small>拖动屏幕控制落点</small>
          </div>
        </div>
      </div>
    </div>
  )
}
