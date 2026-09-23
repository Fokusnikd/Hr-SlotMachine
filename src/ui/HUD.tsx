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
      <div className="stats" aria-label="Статистика">
        <span className="datasource">
          <span className={`dot ${db.status === 'loading' ? 'dot--loading' : db.status === 'demo' ? 'dot--mock' : 'dot--live'}`} />
          {db.status === 'loading'
            ? 'Загружаем базу…'
            : db.status === 'demo'
              ? 'Демо-кандидаты'
              : `${filter.trim() || source !== 'all' ? [source !== 'all' ? (source === 'github' ? 'GitHub' : 'JSON Resume') : '', describeFilter(filter)].filter(Boolean).join(' · ') + ' — п' : 'П'}ул: ${pool.total.toLocaleString('ru-RU')}`}
        </span>
        <span title="Ещё не выпадали и имеют 3+ выбранных навыка — могут выпасть">
          Подходят: {pool.eligible.toLocaleString('ru-RU')}
        </span>
        <span title="Уже выпадали (шорт-лист или обмен) — повторно не выпадут">Выпали: {pool.seen}
        </span>
        <span>
          {skillCount} {plural(skillCount, 'навык', 'навыка', 'навыков')}
        </span>
        <span>Спинов: {stats.spins}</span>
        <span>Находок: {stats.wins}</span>
      </div>
      <div className="topbar__right">
        {broke && (
          <button className="btn btn--refill btn--sm" onClick={refill}>
            Бюджет у HRD +{REFILL_AMOUNT}
          </button>
        )}
        <div className="credits" title="Кредиты">
          <span className="coin" aria-hidden>
            ◎
          </span>
          {shown}
        </div>
        <button className="btn btn--ghost" onClick={onOpenShortlist}>
          ⭐ <span className="hide-sm">Шорт-лист</span> <span className="badge">{shortlistCount}</span>
        </button>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="Настройки">
          ⚙
        </button>
      </div>
    </header>
  )
}
