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
} as const

export type IconName = keyof typeof ICON_SOURCES

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
