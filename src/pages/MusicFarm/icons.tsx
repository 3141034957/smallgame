import type { IconName } from './iconSources'
import { glyphIcon, ICON_SOURCES } from './iconSources'

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

/** Data still stores a glyph; render the matching artwork when we have one. */
export function GlyphIcon({ glyph, className }: { glyph: string; className?: string }) {
  const name = glyphIcon(glyph)
  if (!name) return <span className={className}>{glyph}</span>
  return <Icon name={name} className={className} />
}
