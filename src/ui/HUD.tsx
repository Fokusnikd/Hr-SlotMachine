import { useEffect, useRef, useState } from 'react'
import { describeFilter, useGame } from '../game/store'
import { plural, REFILL_AMOUNT } from '../game/economy'

function useAnimatedNumber(value: number) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 600)
      const v = Math.round(a + (value - a) * (1 - (1 - p) ** 3))
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
      else from.current = value
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return shown
}

export function HUD({ onOpenShortlist, onOpenSettings }: { onOpenShortlist: () => void; onOpenSettings: () => void }) {
  const credits = useGame((s) => s.credits)
  const phase = useGame((s) => s.phase)
  const shortlistCount = useGame((s) => s.shortlist.length)
  const stats = useGame((s) => s.stats)
  const refill = useGame((s) => s.refill)
  const db = useGame((s) => s.db)
  const pool = useGame((s) => s.poolInfo)
  const filter = useGame((s) => s.settings.filter)
  const source = useGame((s) => s.settings.source)
  const cost = useGame((s) => s.cost)
  const skillCount = useGame((s) => s.targets.length)
  const shown = useAnimatedNumber(credits)
  const broke = credits < cost && phase === 'idle'

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__logo">🎰</span>
        <span className="brand__name">HR&nbsp;Gacha</span>
      </div>
      <div className="stats" aria-label="Stats">
        <span className="datasource">
          <span className={`dot ${db.status === 'loading' ? 'dot--loading' : db.status === 'demo' ? 'dot--mock' : 'dot--live'}`} />
          {db.status === 'loading'
            ? 'Loading database…'
            : db.status === 'demo'
              ? 'Demo candidates'
              : `${filter.trim() || source !== 'all' ? [source !== 'all' ? (source === 'github' ? 'GitHub' : 'JSON Resume') : '', describeFilter(filter)].filter(Boolean).join(' · ') + ' — p' : 'P'}ool: ${pool.total.toLocaleString('en-US')}`}
        </span>
        <span title="Haven't appeared yet and have 3+ selected skills — may appear">
          Eligible: {pool.eligible.toLocaleString('en-US')}
        </span>
        <span title="Already appeared (shortlisted or exchanged) — won't appear again">Seen: {pool.seen}
        </span>
        <span>
          {skillCount} {plural(skillCount, 'skill', 'skills', 'skills')}
        </span>
        <span>Spins: {stats.spins}</span>
        <span>Finds: {stats.wins}</span>
      </div>
      <div className="topbar__right">
        {broke && (
          <button className="btn btn--refill btn--sm" onClick={refill}>
            Ask HRD for budget +{REFILL_AMOUNT}
          </button>
        )}
        <div className="credits" title="Credits">
          <span className="coin" aria-hidden>
            ◎
          </span>
          {shown}
        </div>
        <button className="btn btn--ghost" onClick={onOpenShortlist}>
          ⭐ <span className="hide-sm">Shortlist</span> <span className="badge">{shortlistCount}</span>
        </button>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="Settings">
          ⚙
        </button>
      </div>
    </header>
  )
}
