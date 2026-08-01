import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const leaderboard = sqliteTable(
  'leaderboard',
  {
    name: text('name').primaryKey(),
    score: integer('score').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_leaderboard_score').on(table.score, table.updatedAt)],
)

export const scoreReporters = sqliteTable('score_reporters', {
  nickname: text('nickname').primaryKey(),
  reportCount: integer('report_count').notNull().default(0),
})

export const appStats = sqliteTable('app_stats', {
  key: text('key').primaryKey(),
  value: integer('value').notNull().default(0),
})
