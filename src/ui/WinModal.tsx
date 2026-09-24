import { upgradeCandidates, useGame } from '../game/store'
import { payoutFor, rarityLabel } from '../game/economy'
import { Avatar, Modal, SkillChip } from './common'
import type { CandidateSource } from '../game/types'

const SOURCE_LABEL: Record<CandidateSource, string> = { jsonresume: 'JSON Resume', github: 'GitHub', mock: 'Demo' }

function yearsLabel(y?: number) {
  if (y == null) return undefined
  if (y < 1) return '< 1 year experience'
  return `${y} ${y === 1 ? 'year' : 'years'} experience`
}

export function WinModal() {
  const phase = useGame((s) => s.phase)
  const result = useGame((s) => s.result)
  const keep = useGame((s) => s.keep)
  const exchange = useGame((s) => s.exchange)
  const winOpen = useGame((s) => s.winOpen)
  const closeWin = useGame((s) => s.closeWin)
  const winIndex = useGame((s) => s.winIndex)
  const winScale = useGame((s) => s.winScale)
  const targets = useGame((s) => s.targets)
  const upgradeApplied = useGame((s) => s.upgradeApplied)
  const startUpgrade = useGame((s) => s.startUpgrade)
  const filtered = useGame((s) => s.filtered)
  const excluded = useGame((s) => s.excluded)
  const visible = winOpen && phase === 'win'

  const win = result?.wins[winIndex]
  if (!visible || !win) return null
  const c = win.candidate
  const total = result!.wins.length
  const matched = new Set(win.matched)
  const ordered = [...new Set(c.skills)].sort((a, b) => Number(matched.has(b)) - Number(matched.has(a)))

  // Апгрейдится карточка целиком, не сам кандидат: кнопка есть, пока в пуле есть ещё не выпадавший
  // кандидат с более высоким матчем. Нет такого — это максимум, вместо кнопки надпись.
  const isMax = upgradeCandidates(filtered, targets, new Set(excluded), c.id, win.matched.length).length === 0
  const canUpgrade = !upgradeApplied[winIndex] && !isMax

  return (
    <Modal className={`win win--${win.rarity}`} onClose={closeWin}>
      <div className="win__banner">
        {win.fromBonus && 'Golden Folder · '}
        {rarityLabel(win.rarity, win.matched.length)}
        {total > 1 && <span className="win__count"> · {winIndex + 1} of {total}</span>}
      </div>
      <div className="win__head">
        <Avatar c={c} size={88} />
        <div>
          <h2 className="win__name">{c.name}</h2>
          {c.login && c.login !== c.name && <div className="muted">@{c.login}</div>}
          {c.title && <div className="win__title">{c.title}</div>}
          <div className="muted">{[c.location, c.company, yearsLabel(c.years)].filter(Boolean).join(' · ')}</div>
          <span className={`source source--${c.source}`}>{SOURCE_LABEL[c.source]}</span>
        </div>
      </div>
      {c.bio && <p className="win__bio">«{c.bio.length > 220 ? c.bio.slice(0, 220) + '…' : c.bio}»</p>}
      <div className="chips">
        {ordered.map((s) => (
          <SkillChip key={s} id={s} matched={matched.has(s)} />
        ))}
      </div>
      {c.stats && (
        <div className="win__stats muted">
          {c.stats.repos} repos · {c.stats.followers} followers
        </div>
      )}
      {!!c.links?.length && (
        <div className="win__links">
          {c.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      )}
      {c.source === 'mock' && <div className="note">Demo candidate: the link opens a search for similar profiles on GitHub.</div>}
      <div className="win__actions">
        {isMax && <span className="win__max">★ Maximum</span>}
        {canUpgrade && (
          <button className="btn btn--upgrade" onClick={startUpgrade} title="One try per candidate — pick an offer higher than their ask to improve the match, but a lower offer loses the candidate">
            💼 Counter with a better offer
          </button>
        )}
        <a className="btn btn--primary" href={c.url} target="_blank" rel="noreferrer" onClick={keep}>
          {c.source === 'jsonresume' ? 'Open resume ↗' : 'Open profile ↗'}
        </a>
        <button className="btn btn--ghost" onClick={keep}>
          ⭐ Add to shortlist
        </button>
        <button className="btn btn--gold" onClick={exchange}>
          Exchange for +{payoutFor(win.matched.length, winScale)} ◎
        </button>
      </div>
    </Modal>
  )
}
