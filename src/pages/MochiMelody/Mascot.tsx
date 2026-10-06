import { BAND } from '@/features/melody/engine'
import type { Lane } from '@/features/melody/engine'

export function Mascot({
  lane,
  happy = false,
  sleeping = false,
}: {
  lane: Lane
  happy?: boolean
  sleeping?: boolean
}) {
  const color = ['#fff0d8', '#fffaf1', '#dcb78a', '#ffdf88'][lane]
  return (
    <svg
      viewBox="0 0 100 116"
      className={`mochi-mascot mascot-${lane}${happy ? ' is-happy' : ''}`}
      role="img"
      aria-label={`${BAND[lane].name}，${BAND[lane].instrument}`}
    >
      <ellipse cx="50" cy="108" rx="34" ry="5" fill="#715c47" opacity=".10" />
      {lane === 0 && (
        <>
          <path d="M19 39 19 11Q20 5 26 10L43 26" fill={color} stroke="#725c4c" strokeWidth="2" />
          <path d="M59 25 75 9Q82 5 82 13L81 42" fill={color} stroke="#725c4c" strokeWidth="2" />
          <path d="m24 17 1 19 12-8M77 17l-1 19-12-8" fill="#efc0b6" />
        </>
      )}
      {lane === 1 && (
        <>
          <ellipse
            cx="34"
            cy="23"
            rx="10"
            ry="22"
            fill={color}
            stroke="#725c4c"
            strokeWidth="2"
            transform="rotate(-12 34 23)"
          />
          <ellipse
            cx="66"
            cy="23"
            rx="10"
            ry="22"
            fill={color}
            stroke="#725c4c"
            strokeWidth="2"
            transform="rotate(12 66 23)"
          />
          <ellipse cx="34" cy="22" rx="4" ry="14" fill="#f0cbd2" />
          <ellipse cx="66" cy="22" rx="4" ry="14" fill="#f0cbd2" />
        </>
      )}
      {lane === 2 && (
        <>
          <circle cx="24" cy="28" r="14" fill={color} stroke="#725c4c" strokeWidth="2" />
          <circle cx="76" cy="28" r="14" fill={color} stroke="#725c4c" strokeWidth="2" />
          <circle cx="24" cy="28" r="7" fill="#bc9169" />
          <circle cx="76" cy="28" r="7" fill="#bc9169" />
        </>
      )}
      {lane === 3 && (
        <path
          d="M46 25Q34 6 44 12Q48 10 52 22Q62 6 65 14L58 29"
          fill={color}
          stroke="#725c4c"
          strokeWidth="2"
        />
      )}
      <ellipse cx="50" cy="84" rx="28" ry="23" fill={color} stroke="#725c4c" strokeWidth="2" />
      <ellipse cx="50" cy="52" rx="36" ry="31" fill={color} stroke="#725c4c" strokeWidth="2" />
      {lane === 0 && (
        <>
          <path
            d="m39 22 2 11m9-12v12m9-11-2 11"
            stroke="#e4ae80"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
      <ellipse cx="27" cy="60" rx="9" ry="5" fill="#edaaab" opacity=".7" />
      <ellipse cx="73" cy="60" rx="9" ry="5" fill="#edaaab" opacity=".7" />
      {sleeping ? (
        <path
          d="M33 48q5 7 10 0m14 0q5 7 10 0"
          fill="none"
          stroke="#624e41"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      ) : happy ? (
        <>
          <path
            d="M33 49q5-8 10 0m14 0q5-8 10 0"
            fill="none"
            stroke="#624e41"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="37" cy="49" rx="3" ry="4" fill="#624e41" />
          <ellipse cx="63" cy="49" rx="3" ry="4" fill="#624e41" />
          <circle cx="38" cy="48" r=".8" fill="white" />
          <circle cx="64" cy="48" r=".8" fill="white" />
        </>
      )}
      {lane === 3 ? (
        <path d="m45 57 12 0-6 7z" fill="#e9a460" />
      ) : (
        <>
          <path d="m47 55 6 0-3 4z" fill="#a67565" />
          <path
            d="M50 59q-4 7-8 2m8-2q4 7 8 2"
            fill="none"
            stroke="#725c4c"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </>
      )}
      <ellipse cx="31" cy="99" rx="11" ry="7" fill={color} stroke="#725c4c" strokeWidth="2" />
      <ellipse cx="68" cy="99" rx="11" ry="7" fill={color} stroke="#725c4c" strokeWidth="2" />
      {lane === 0 && (
        <>
          <rect
            x="21"
            y="82"
            width="58"
            height="21"
            rx="8"
            fill="#edac9c"
            stroke="#725c4c"
            strokeWidth="2"
          />
          <ellipse cx="50" cy="82" rx="29" ry="8" fill="#fff7e7" stroke="#725c4c" strokeWidth="2" />
          <path
            d="m27 70 12 13m34-13L61 83"
            stroke="#bf9470"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="25" cy="68" r="4" fill="#fff7e7" />
          <circle cx="75" cy="68" r="4" fill="#fff7e7" />
        </>
      )}
      {lane === 1 && (
        <>
          <rect
            x="14"
            y="81"
            width="72"
            height="21"
            rx="5"
            fill="#c1aedc"
            stroke="#725c4c"
            strokeWidth="2"
          />
          <rect x="20" y="85" width="60" height="12" rx="2" fill="#fffaf1" />
          <path
            d="M30 85v12m10-12v12m10-12v12m10-12v12m10-12v12"
            stroke="#c1aedc"
            strokeWidth="1"
          />
          <path d="M33 85v7m20-7v7m10-7v7" stroke="#725c4c" strokeWidth="4" />
        </>
      )}
      {lane === 2 && (
        <>
          <ellipse
            cx="58"
            cy="91"
            rx="18"
            ry="17"
            fill="#bb855b"
            stroke="#725c4c"
            strokeWidth="2"
          />
          <rect
            x="53"
            y="60"
            width="9"
            height="29"
            rx="3"
            fill="#c79263"
            stroke="#725c4c"
            strokeWidth="2"
          />
          <path d="M56 65v34m3-34v34" stroke="#fff4df" strokeWidth="1" />
          <path d="M47 86q-5 4 0 9m22-9q5 4 0 9" fill="none" stroke="#725c4c" strokeWidth="1.5" />
        </>
      )}
      {lane === 3 && (
        <>
          <path d="M70 104V82" stroke="#725c4c" strokeWidth="3" />
          <path
            d="m63 107 7-4 8 4"
            fill="none"
            stroke="#725c4c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="64"
            y="66"
            width="13"
            height="19"
            rx="6.5"
            fill="#e9b1bf"
            stroke="#725c4c"
            strokeWidth="2"
          />
          <path d="M67 72h7m-7 4h7" stroke="#fff0ea" strokeWidth="2" />
          <path d="M31 83q-14-4-13 5q3 9 15 5" fill={color} stroke="#725c4c" strokeWidth="2" />
        </>
      )}
    </svg>
  )
}
