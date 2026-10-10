import './style.css'

const ICON_SOURCES = {
  shop: '/assets/icons/shop.webp',
  upgrade: '/assets/icons/upgrade.webp',
  badges: '/assets/icons/badges.webp',
  board: '/assets/icons/board.webp',
  sound: '/assets/icons/sound.webp',
  workshop: '/assets/icons/workshop.webp',
  refresh: '/assets/icons/refresh.webp',
  lock: '/assets/icons/lock.webp',
  pause: '/assets/icons/pause.webp',
  help: '/assets/icons/help.webp',
  vitality: '/assets/icons/vitality.webp',
  damage: '/assets/icons/damage.webp',
  attraction: '/assets/icons/attraction.webp',
  speed: '/assets/icons/speed.webp',
  armor: '/assets/icons/armor.webp',
  regen: '/assets/icons/regen.webp',
  shield: '/assets/icons/shield.webp',
  xp: '/assets/icons/xp.webp',
  timer: '/assets/icons/timer.webp',
  target: '/assets/icons/target.webp',
  crown: '/assets/icons/crown.webp',
  fire: '/assets/icons/fire.webp',
  star: '/assets/icons/star.webp',
  coin: '/assets/icons/coin.webp',
  'weapon-drum': '/assets/icons/weapon-drum.webp',
  'weapon-orbit': '/assets/icons/weapon-orbit.webp',
  'weapon-power': '/assets/icons/weapon-power.webp',
  'weapon-echo': '/assets/icons/weapon-echo.webp',
  'weapon-bell': '/assets/icons/weapon-bell.webp',
  'weapon-whistle': '/assets/icons/weapon-whistle.webp',
  'weapon-sax': '/assets/icons/weapon-sax.webp',
  'weapon-sampler': '/assets/icons/weapon-sampler.webp',
  'weapon-deck': '/assets/icons/weapon-deck.webp',
  'weapon-synth': '/assets/icons/weapon-synth.webp',
  'chip-range': '/assets/icons/chip-range.webp',
  'chip-tempo': '/assets/icons/chip-tempo.webp',
  'chip-magnet': '/assets/icons/chip-magnet.webp',
  'chip-lucky': '/assets/icons/chip-lucky.webp',
  'chip-sustain': '/assets/icons/chip-sustain.webp',
  'chip-delay': '/assets/icons/chip-delay.webp',
  'chip-mute': '/assets/icons/chip-mute.webp',
  'chip-trigger': '/assets/icons/chip-trigger.webp',
  'chip-needle': '/assets/icons/chip-needle.webp',
  'chip-arp': '/assets/icons/chip-arp.webp',
} as const

export type IconName = keyof typeof ICON_SOURCES

// Upgrade cards: instruments and chips carry their own artwork, the late-run
// cards borrow the matching growth icon (heal → vitality, 伤害 → damage…).
const TALENT_ICONS: Record<string, IconName> = {
  drum: 'weapon-drum',
  orbit: 'weapon-orbit',
  power: 'weapon-power',
  echo: 'weapon-echo',
  bell: 'weapon-bell',
  whistle: 'weapon-whistle',
  sax: 'weapon-sax',
  sampler: 'weapon-sampler',
  deck: 'weapon-deck',
  synth: 'weapon-synth',
  range: 'chip-range',
  tempo: 'chip-tempo',
  magnet: 'chip-magnet',
  lucky: 'chip-lucky',
  sustain: 'chip-sustain',
  delay: 'chip-delay',
  mute: 'chip-mute',
  trigger: 'chip-trigger',
  needle: 'chip-needle',
  arp: 'chip-arp',
  heal: 'vitality',
  vigor: 'vitality',
  overdrive: 'damage',
  remedy: 'regen',
  grit: 'armor',
  footwork: 'speed',
}
export const talentIcon = (id: string): IconName | null => TALENT_ICONS[id] ?? null

// Achievements and daily goals still carry a glyph in their data; map the ones
// that appear to the matching artwork instead of printing the character.
const GLYPH_ICONS: Record<string, IconName> = {
  '🏅': 'badges',
  '⏱': 'timer',
  '🎯': 'target',
  '👑': 'crown',
  '🔥': 'fire',
  '✦': 'attraction',
  '✧': 'attraction',
  '⭐': 'star',
  '🪙': 'coin',
  '♛': 'crown',
  '🛡': 'shield',
  '♡': 'vitality',
  '♫': 'damage',
  '✚': 'regen',
  '◇': 'armor',
  '➜': 'speed',
}
export const glyphIcon = (glyph: string): IconName | null => GLYPH_ICONS[glyph] ?? null

/** Data still stores a glyph; render the matching artwork when we have one. */
export function GlyphIcon({ glyph, className }: { glyph: string; className?: string }) {
  const name = glyphIcon(glyph)
  if (!name) return <span className={className}>{glyph}</span>
  return <Icon name={name} className={className} />
}

/** 纯装饰图片图标：语义由按钮的文字或 aria-label 承担。 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <img
      src={ICON_SOURCES[name]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className ? `farm-icon ${className}` : 'farm-icon'}
    />
  )
}
