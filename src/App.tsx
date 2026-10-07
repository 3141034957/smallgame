import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import MusicFarm from '@/pages/MusicFarm'
import { AuthGate } from '@/features/auth/AuthGate'

function FarmHome() {
  const [params] = useSearchParams()
  // A remount would drop a running round, so only a different day rebuilds the
  // game: it restarts itself when `day` changes, and a dialog owns the back
  // gesture through a placeholder history entry instead of a URL change.
  return <MusicFarm key={params.get('day') ?? ''} />
}

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<FarmHome />} />
        <Route path="/farm" element={<FarmHome />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthGate>
  )
}
