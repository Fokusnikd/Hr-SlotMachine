import { useState } from 'react'
import { getSkill } from '../game/skills'
import type { Candidate, SkillId } from '../game/types'

export function Avatar({ c, size = 72 }: { c: Candidate; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (c.avatarUrl && !broken)
    return <img className="avatar" src={c.avatarUrl} width={size} height={size} alt="" loading="lazy" onError={() => setBroken(true)} />
  const initials = c.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
  const hue = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360
  return (
    <div className="avatar avatar--initials" style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 60) % 360} 70% 40%))`, fontSize: size * 0.38 }}>
      {initials}
    </div>
  )
}

export function SkillChip({ id, matched }: { id: SkillId; matched?: boolean }) {
  const s = getSkill(id)
  return (
    <span className={`chip ${matched ? 'chip--matched' : ''}`} style={{ ['--c' as string]: s.color }}>
      {matched && <span className="chip__check">✓</span>}
      {s.label}
    </span>
  )
}

export function Modal({ children, onClose, className = '' }: { children: React.ReactNode; onClose?: () => void; className?: string }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true">
        {onClose && (
          <button className="icon-btn modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
