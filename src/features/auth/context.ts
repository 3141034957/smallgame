import { createContext, useContext } from 'react'
import type { AccountUser } from './client'
export type AccountContextValue = {
  user: AccountUser | null
  openAccount: () => void
  /** 首次身份确认尚未出结果。 */
  checking: boolean
  /** 游戏告知「当前有一局未结束」，引用稳定，可直接放进 effect 依赖。 */
  setRunActive: (active: boolean) => void
}
export const AccountContext = createContext<AccountContextValue | null>(null)
export const useAccount = () => useContext(AccountContext)
export const AUTH_FORM_EVENT = 'echo-account-form-opened'
