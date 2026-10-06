import { createContext, useContext } from 'react'
import type { AccountUser } from './client'
export const AccountContext = createContext<{
  user: AccountUser | null
  openAccount: (mode: 'login' | 'register') => void
} | null>(null)
export const useAccount = () => useContext(AccountContext)
export const AUTH_FORM_EVENT = 'echo-account-form-opened'
