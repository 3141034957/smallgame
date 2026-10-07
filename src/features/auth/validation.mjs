export const ACCOUNT_HINT = '3–32 位字母、数字或 _'
export const PASSWORD_HINT = '8–128 位，区分大小写'
export function normalizeAccount(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_]{3,32}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null
}
export function validPassword(value) {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    value.trim().length > 0 &&
    !/[\p{Cc}\p{Cs}]/u.test(value)
  )
}
