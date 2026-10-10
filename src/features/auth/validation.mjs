// Accounts are nickname-only: the nickname is the identity, and entering it
// loads (or creates) that band's save. There is no password to validate.
export const ACCOUNT_HINT = '3–32 位字母、数字或 _'
export function normalizeAccount(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_]{3,32}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null
}
