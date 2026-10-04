import { useEffect, useState } from 'react'
import { FARM_CHARACTERS, selectFarmCharacter, type FarmProfile } from '@/features/farm/characters'
import './CharacterShop.css'

export function CharacterShop({ profile, onChange }: { profile: FarmProfile; onChange: (profile: FarmProfile) => void }) {
  const [previewId, setPreviewId] = useState(profile.selected)
  // Unlocking a character equips it, so the preview has to follow.
  useEffect(() => setPreviewId(profile.selected), [profile.selected])
  const [message, setMessage] = useState('')
  const character = FARM_CHARACTERS.find((item) => item.id === previewId) ?? FARM_CHARACTERS[0]
  const owned = profile.owned.includes(character.id)
  const equipped = profile.selected === character.id
  const affordable = profile.coins >= character.price

  return <div className="farm-shop">
    <header className="farm-shop-heading"><div><small>MEET YOUR NEXT STAR</small><h2>角色商店</h2></div><div className="farm-shop-wallet"><small>我的金币</small><strong>✦ {profile.coins.toLocaleString()}</strong></div></header>
    <div className="farm-shop-showcase">
      <div className="farm-shop-portrait" style={{ '--character-glow': character.colors.glow } as React.CSSProperties}><span aria-hidden="true">✦</span><img key={character.id} src={character.image} alt={character.name} /><span aria-hidden="true">♪</span></div>
      <div className="farm-shop-detail"><small>{equipped ? '正在上场' : owned ? '已经拥有' : '等待加入你的乐队'}</small><h3>{character.name}</h3><p>{character.desc}</p><span>角色外观 · 自由搭配乐器</span></div>
    </div>
    <div className="farm-shop-collection"><strong>你的舞台，你的主角</strong><span>{profile.owned.length} / {FARM_CHARACTERS.length} 已拥有</span></div>
    <div className="farm-shop-grid" aria-label="角色列表">{FARM_CHARACTERS.map((item) => {
      const unlocked = profile.owned.includes(item.id), active = profile.selected === item.id
      return <button type="button" key={item.id} aria-label={`预览${item.name}`} aria-pressed={item.id === previewId} className={item.id === previewId ? 'is-preview' : ''} onClick={() => { setPreviewId(item.id); setMessage('') }}>
        <small className={active ? 'is-equipped' : ''}>{active ? '使用中' : unlocked ? '已拥有' : `✦ ${item.price.toLocaleString()}`}</small>
        <img src={item.image} alt="" loading="lazy" /><strong>{item.name}</strong>
      </button>
    })}</div>
    <div className="farm-shop-action">
      <p role="status">{message || (!owned && !affordable ? `还差 ${(character.price - profile.coins).toLocaleString()} 金币，战斗结算即可获得` : '击败怪物、拾取金币，结算后用来解锁新角色')}</p>
      <button className="farm-primary" type="button" disabled={equipped || (!owned && !affordable)} onClick={() => {
        const result = selectFarmCharacter(character.id)
        onChange(result.profile)
        setMessage(result.error ?? `${owned ? '已切换为' : '解锁成功！'} ${character.name}，上场吧！`)
      }}>{equipped ? '✓ 当前角色' : owned ? '使用角色 ↗' : `解锁并使用 · ✦ ${character.price.toLocaleString()}`}</button>
      <small>角色与金币保存在当前浏览器</small>
    </div>
  </div>
}
