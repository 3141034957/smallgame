import { Routes, Route, Navigate } from 'react-router-dom'
import Home from '@/pages/Home'
import Shop from '@/pages/Shop'
import EchoGarden from '@/pages/EchoGarden'
import '@/styles/device-frame.css'

const MOBILE_USER_AGENT =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

function isMobileDevice() {
  const userAgent = navigator.userAgent
  const isTouchMac =
    /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1

  return MOBILE_USER_AGENT.test(userAgent) || isTouchMac
}

function App() {
  const usePcFrame = !isMobileDevice()

  return (
    <div className={`pc-mobile-wrapper${usePcFrame ? ' is-pc' : ''}`}>
      <main className="mobile-body">
        <Routes>
          <Route path="/" element={<EchoGarden />} />
          <Route path="/mochi" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
