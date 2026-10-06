export const ACCOUNT_HINT = '账号为 3–32 位英文字母、数字或下划线，不区分大小写。'
export const PASSWORD_HINT = '密码为 8–128 位，支持英文大小写、数字、特殊字符和空格，区分大小写。'
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
