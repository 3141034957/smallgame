import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.tsx'
import { resetStarBalance } from './utils/starCurrency'

// 全局样式
import './styles/reset.css'

// 测试阶段：每次重新打开或刷新页面时，星星余额重置为 3。
resetStarBalance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
