import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import MusicFarm from '@/pages/MusicFarm'

function FarmHome() {
  const [params] = useSearchParams()
  return <MusicFarm key={params.toString()} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<FarmHome />} />
      <Route path="/farm" element={<FarmHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
