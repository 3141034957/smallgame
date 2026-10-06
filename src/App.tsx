import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
// Only the game that greets players ships in the first bundle; the rest of the
// arcade is fetched when someone actually opens it.
import MusicFarm from '@/pages/MusicFarm'
const Home = lazy(() => import('@/pages/Home'))
const Shop = lazy(() => import('@/pages/Shop'))
const EchoGarden = lazy(() => import('@/pages/EchoGarden'))
const MochiMelody = lazy(() => import('@/pages/MochiMelody'))
const SoundIsland = lazy(() => import('@/pages/SoundIsland'))
const MochiBounce = lazy(() => import('@/pages/MochiBounce'))
const SoundWave = lazy(() => import('@/pages/SoundWave'))
import { decodeBoard } from '@/features/echo/engine'
import { decodePattern, SONGS } from '@/features/melody/engine'
import '@/styles/device-frame.css'

const MOBILE_USER_AGENT = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i

function isMobileDevice() {
  const userAgent = navigator.userAgent
  const isTouchMac = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1

  return MOBILE_USER_AGENT.test(userAgent) || isTouchMac
}

function GameHome() {
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  // Keep older Echo Garden invitations working after the new game becomes home.
  if (decodeBoard(params.get('song') ?? ''))
    return <Navigate to={`/echo?${params.toString()}`} replace />
  if (decodePattern(params.get('mix')) || SONGS.some((song) => song.id === params.get('song')))
    return <Navigate to={`/rhythm?${params.toString()}`} replace />
  if (params.has('island') || params.has('route')) return <SoundIsland key={params.toString()} />
  if (pathname === '/bounce' || params.has('mode') || params.has('show') || params.has('target'))
    return <MochiBounce key={params.toString()} />
  return <MusicFarm key={params.toString()} />
}

function FarmHome() {
  const [params] = useSearchParams()
  return <MusicFarm key={params.toString()} />
}

function WaveHome() {
  const [params] = useSearchParams()
  return <SoundWave key={params.toString()} />
}

function IslandHome() {
  const [params] = useSearchParams()
  return <SoundIsland key={params.toString()} />
}

function RhythmHome() {
  const [params] = useSearchParams()
  return <MochiMelody key={params.toString()} />
}

function App() {
  const { pathname } = useLocation()
  const usePcFrame =
    !['/', '/farm', '/wave', '/bounce', '/island', '/rhythm'].includes(pathname) &&
    !isMobileDevice()

  return (
    <div className={`pc-mobile-wrapper${usePcFrame ? ' is-pc' : ''}`}>
      <main className="mobile-body">
        <Suspense
          fallback={
            <div className="app-boot" role="status">
              加载中 ♫
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<GameHome />} />
            <Route path="/farm" element={<FarmHome />} />
            <Route path="/wave" element={<WaveHome />} />
            <Route path="/bounce" element={<GameHome />} />
            <Route path="/island" element={<IslandHome />} />
            <Route path="/rhythm" element={<RhythmHome />} />
            <Route path="/echo" element={<EchoGarden />} />
            <Route path="/mochi" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default App
