export const PROGRESS_LIMIT: number
export const PROGRESS_KEYS: string[]
export function isProgressKey(key: string): boolean
export function validProgress(data: unknown): data is Record<string, string>
