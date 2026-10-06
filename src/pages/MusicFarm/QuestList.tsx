import {
  farmQuestDone,
  farmQuestProgress,
  type FarmQuest,
  type FarmQuestLog,
} from '@/features/farm/quests'

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const show = (quest: FarmQuest, value: number) =>
  quest.kind === 'best' && quest.id === 'long' ? clock(value) : Math.round(value).toLocaleString()

export function QuestList({
  quests,
  log,
  fresh = [],
}: {
  quests: FarmQuest[]
  log: FarmQuestLog
  fresh?: string[]
}) {
  return (
    <ul className="farm-quests" aria-label="今日目标">
      {quests.map((quest) => {
        const done = farmQuestDone(quest, log)
        return (
          <li key={quest.id} className={done ? 'is-done' : ''}>
            <span aria-hidden="true">{done ? '✓' : quest.icon}</span>
            <div>
              <strong>{quest.name}</strong>
              <small>{quest.desc}</small>
            </div>
            <b>
              {done
                ? `+${quest.reward} 金币`
                : `${show(quest, farmQuestProgress(quest, log))} / ${show(quest, quest.target)}`}
            </b>
            {fresh.includes(quest.id) && <em>本局达成</em>}
          </li>
        )
      })}
    </ul>
  )
}
