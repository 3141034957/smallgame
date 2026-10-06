import type { Lane } from '@/features/melody/engine'

export function SoundPlant({ lane, faded = false }: { lane: Lane; faded?: boolean }) {
  return (
    <svg
      className={`island-plant plant-${lane}`}
      viewBox="0 0 80 80"
      aria-hidden="true"
      opacity={faded ? 0.35 : 1}
    >
      <ellipse cx="40" cy="67" rx="24" ry="5" fill="#8eac791b" />
      {lane === 0 && (
        <g stroke="#b68671" strokeWidth="1.8">
          <path d="M30 39 L29 61 Q40 69 50 61 L48 39" fill="#fff2d6" />
          <path d="M12 39 Q14 12 39 14 Q66 12 68 39 Q42 50 12 39Z" fill="#eea6a0" />
          <ellipse cx="29" cy="26" rx="6" ry="4" fill="#fff0d9" stroke="none" />
          <ellipse cx="49" cy="29" rx="5" ry="4" fill="#fff0d9" stroke="none" />
          <path d="M33 55 L35 56 M44 55 L46 56" />
        </g>
      )}
      {lane === 1 && (
        <g>
          <path
            d="M40 41 L40 66 M40 59 Q16 57 23 48 Q38 45 40 59 M40 62 Q61 46 62 56 Q57 69 40 62"
            fill="#a6c394"
            stroke="#91ac7e"
            strokeWidth="2"
          />
          <g fill="#c2afd9" stroke="#ac93c4" strokeWidth="1.3">
            <ellipse cx="40" cy="24" rx="10" ry="13" />
            <ellipse cx="26" cy="36" rx="13" ry="10" transform="rotate(25 26 36)" />
            <ellipse cx="53" cy="36" rx="13" ry="10" transform="rotate(-25 53 36)" />
            <ellipse cx="33" cy="47" rx="10" ry="12" transform="rotate(25 33 47)" />
            <ellipse cx="47" cy="47" rx="10" ry="12" transform="rotate(-25 47 47)" />
          </g>
          <circle cx="40" cy="36" r="9" fill="#fff0b7" stroke="#c5b279" strokeWidth="1.4" />
          <circle cx="37" cy="35" r="1" fill="#8c8561" />
          <circle cx="43" cy="35" r="1" fill="#8c8561" />
        </g>
      )}
      {lane === 2 && (
        <g stroke="#a59a66" strokeWidth="1.5">
          <path d="M40 46 L40 66 M30 57 L40 62 L52 53" fill="none" />
          <path
            d="M13 53 Q8 40 21 36 Q18 23 33 25 Q40 13 49 26 Q65 20 66 35 Q79 44 65 56 Q38 71 13 53Z"
            fill="#bfcc8e"
          />
          <g fill="#e8bb75" stroke="#c5a36d">
            <circle cx="29" cy="43" r="7" />
            <circle cx="44" cy="36" r="7" />
            <circle cx="55" cy="49" r="7" />
          </g>
          <path d="M29 35 L29 38 M44 28 L44 31 M55 41 L55 44" />
        </g>
      )}
      {lane === 3 && (
        <g stroke="#8daa94" strokeWidth="1.8">
          <path d="M40 14 Q20 24 22 65" fill="none" />
          <path d="M40 14 Q55 20 52 33" fill="none" />
          <path d="M40 20 Q24 17 29 29 Q35 34 40 20" fill="#9ec4a6" />
          <path
            d="M36 48 Q36 33 49 32 Q61 33 63 48 Q66 52 63 54 L35 54 Q31 52 36 48Z"
            fill="#d5e7c2"
          />
          <path d="M44 55 Q49 63 55 55" fill="#f1da8b" />
          <path d="M61 22 L66 18 M65 30 L72 30 M16 35 L11 32" stroke="#d4bd80" />
        </g>
      )}
    </svg>
  )
}

export function Camp() {
  return (
    <svg className="island-camp" viewBox="0 0 80 80" aria-hidden="true">
      <ellipse cx="40" cy="67" rx="29" ry="6" fill="#929f7e24" />
      <path
        d="M11 61 L36 20 L70 60 Q42 71 11 61Z"
        fill="#f6dfac"
        stroke="#b9a780"
        strokeWidth="2"
      />
      <path d="M36 20 L37 65 L56 61Z" fill="#e9c99a" stroke="#b9a780" strokeWidth="1.5" />
      <path d="M24 64 L37 41 L46 65" fill="#74886f" stroke="#8c9978" strokeWidth="1.7" />
      <path d="M36 20 L36 10 L52 14 L36 18" fill="#eaa79a" stroke="#b99783" strokeWidth="1.5" />
      <path d="M8 68 L15 68 M64 68 L73 68" stroke="#a9ba82" strokeWidth="2" />
    </svg>
  )
}
