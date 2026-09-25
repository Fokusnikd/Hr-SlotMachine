import { useMemo } from 'react'
import { useGame } from '../game/store'
import { BRAND, pick, SHORTLIST } from '../copy'
import { getSkill } from '../game/skills'
import { Avatar, SkillChip } from './common'
import type { Candidate } from '../game/types'

function exportCsv(list: Candidate[]) {
  const esc = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['Name', 'Login', 'Title', 'Location', 'Skills', 'URL', 'Source'],
    ...list.map((c) => [c.name, c.login, c.title, c.location, c.skills.map((s) => getSkill(s).label).join(', '), c.url, c.source]),
  ]
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${BRAND.csvFile}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function Shortlist({ open, onClose }: { open: boolean; onClose: () => void }) {
  const list = useGame((s) => s.shortlist)
  const remove = useGame((s) => s.removeFromShortlist)
  // Новая фраза для пустого списка при каждом открытии.
  const empty = useMemo(() => pick(SHORTLIST.empty), [open])

  return (
    <>
      <div className={`scrim ${open ? 'scrim--open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'drawer--open' : ''}`} aria-hidden={!open}>
        <div className="drawer__head">
          <h2>{SHORTLIST.title}</h2>
          <div className="drawer__tools">
            <button className="btn btn--ghost btn--sm" disabled={!list.length} onClick={() => exportCsv(list)}>
              CSV
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>
        {!list.length && <p className="muted drawer__empty">{empty}</p>}
        <ul className="shortlist">
          {list.map((c) => (
            <li key={c.id} className="shortlist__item">
              <Avatar c={c} size={48} />
              <div className="shortlist__body">
                <a href={c.url} target="_blank" rel="noreferrer" className="shortlist__name">
                  {c.name} ↗
                </a>
                <div className="muted small">{[c.title, c.location].filter(Boolean).join(' · ')}</div>
                <div className="chips chips--sm">
                  {c.skills.slice(0, 6).map((s) => (
                    <SkillChip key={s} id={s} />
                  ))}
                </div>
              </div>
              <button className="icon-btn icon-btn--sm" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  )
}
