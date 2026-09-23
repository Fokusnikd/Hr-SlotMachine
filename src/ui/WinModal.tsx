import { useGame } from '../game/store'
import { payoutFor, rarityLabel } from '../game/economy'
import { Avatar, Modal, SkillChip } from './common'
import type { CandidateSource } from '../game/types'

const SOURCE_LABEL: Record<CandidateSource, string> = { jsonresume: 'JSON Resume', github: 'GitHub', mock: 'Демо' }

function yearsLabel(y?: number) {
  if (y == null) return undefined
  if (y < 1) return 'опыт < 1 года'
  const mod10 = y % 10
  const mod100 = y % 100
  const word = mod10 === 1 && mod100 !== 11 ? 'год' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'года' : 'лет'
  return `опыт ${y} ${word}`
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
  const visible = winOpen && phase === 'win'

  const win = result?.wins[winIndex]
  if (!visible || !win) return null
  const c = win.candidate
  const total = result!.wins.length
  const matched = new Set(win.matched)
  const ordered = [...new Set(c.skills)].sort((a, b) => Number(matched.has(b)) - Number(matched.has(a)))

  return (
    <Modal className={`win win--${win.rarity}`} onClose={closeWin}>
      <div className="win__banner">
        {result!.fromBonus && 'Золотая папка · '}
        {rarityLabel(win.rarity, win.matched.length)}
        {total > 1 && <span className="win__count"> · {winIndex + 1} из {total}</span>}
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
          {c.stats.repos} репозиториев · {c.stats.followers} подписчиков
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
      {c.source === 'mock' && <div className="note">Демо-кандидат: ссылка откроет поиск похожих профилей на GitHub.</div>}
      <div className="win__actions">
        <a className="btn btn--primary" href={c.url} target="_blank" rel="noreferrer" onClick={keep}>
          {c.source === 'jsonresume' ? 'Открыть резюме ↗' : 'Открыть профиль ↗'}
        </a>
        <button className="btn btn--ghost" onClick={keep}>
          ⭐ В шорт-лист
        </button>
        <button className="btn btn--gold" onClick={exchange}>
          Обменять на +{payoutFor(win.matched.length, winScale)} ◎
        </button>
      </div>
    </Modal>
  )
}
