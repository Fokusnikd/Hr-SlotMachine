import { useMemo, useState } from 'react'
import { parseFilter, playable, resolveLines, resolveSkills, defaultSkills, roleSkillsFor, useGame, type SourceFilter } from '../game/store'
import { activeCells, cellKey, combosFor, linesFor, MAX_LINES, MAX_SKILLS, minLinesFor, MIN_SKILLS, REELS, ROWS } from '../game/outcome'
import { LINE_BET, payoutFor, plural, scaleForLines, spinCost } from '../game/economy'
import { getSkill } from '../game/skills'
import { assignFx, fxLabel } from '../game/fx'
import { Modal } from './common'
import type { SkillId } from '../game/types'

const PRESETS: { label: string; filter: string }[] = [
  { label: 'Все', filter: '' },
  { label: 'Frontend', filter: 'react, typescript' },
  { label: 'Node.js', filter: 'node' },
  { label: 'Python', filter: 'python' },
  { label: 'Go', filter: 'go' },
  { label: 'Java', filter: 'java' },
  { label: 'DevOps', filter: 'docker, kubernetes' },
  { label: 'ML', filter: 'ml' },
  { label: 'Mobile', filter: 'swift' },
  { label: 'Senior', filter: 'senior' },
]

const SOURCES: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'jsonresume', label: 'JSON Resume' },
  { id: 'github', label: 'GitHub' },
]

const CW = 22
const CH = 14
const GAP = 4
const cx = (reel: number) => reel * (CW + GAP) + CW / 2
const cy = (row: number) => row * (CH + GAP) + CH / 2

/** Мини-схема барабанов: активные линии и клетки самого большого комбо. */
function LinesPreview({ count }: { count: number }) {
  const lines = linesFor(count)
  const active = new Set(activeCells(lines).map(cellKey))
  const combo = new Set(combosFor(lines)[0].cells.map(cellKey))
  const W = REELS * (CW + GAP) - GAP
  const H = ROWS * (CH + GAP) - GAP
  return (
    <svg className="lines-preview" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {Array.from({ length: ROWS }, (_, row) =>
        Array.from({ length: REELS }, (_, reel) => {
          const k = cellKey({ reel, row })
          return (
            <rect
              key={k}
              x={reel * (CW + GAP)}
              y={row * (CH + GAP)}
              width={CW}
              height={CH}
              rx={3}
              className={combo.has(k) ? 'cell cell--combo' : active.has(k) ? 'cell cell--on' : 'cell'}
            />
          )
        }),
      )}
      {lines.map((l) => (
        <polyline
          key={l.id}
          points={l.rows.map((row, reel) => `${cx(reel)},${cy(row)}`).join(' ')}
          fill="none"
          stroke={l.color}
          strokeWidth={2.2}
          strokeLinejoin="round"
          opacity={0.9}
        />
      ))}
    </svg>
  )
}

export function Settings({ onClose }: { onClose: () => void }) {
  const settings = useGame((s) => s.settings)
  const all = useGame((s) => s.all)
  const db = useGame((s) => s.db)
  const update = useGame((s) => s.updateSettings)
  const reset = useGame((s) => s.resetProgress)
  const [source, setSource] = useState<SourceFilter>(settings.source)
  const [filter, setFilter] = useState(settings.filter)
  const [picked, setPicked] = useState<SkillId[]>(settings.skills)
  const [lineWish, setLineWish] = useState(settings.lines)

  const role = useMemo(() => roleSkillsFor(all, { source, filter }), [all, source, filter])
  // Анимации навыков раздаются по позиции — та же раздача, что будет в игре.
  const fxMap = useMemo(() => assignFx(role.map((r) => r.id), `${source}|${filter.trim().toLowerCase()}`), [role, source, filter])
  // Если позиция сменилась и из выбора почти ничего не осталось — подставляем топ-5.
  const skills = useMemo(() => resolveSkills(picked, role), [picked, role])
  const selected = new Set(skills)
  const matches = useMemo(() => playable(all, { source, filter }, skills).length, [all, source, filter, skills])
  const terms = parseFilter(filter)
  const minLines = minLinesFor(skills.length)
  const lineCount = resolveLines(lineWish, skills.length)
  const payTable = useGame((s) => s.payTable)
  const applied = useGame((s) => s.targets)
  const sameSkills = applied.join() === skills.join() && source === settings.source && filter === settings.filter
  const cost = spinCost(lineCount)

  const choosePreset = (f: string) => {
    setFilter(f)
    setPicked(defaultSkills(roleSkillsFor(all, { source, filter: f })))
  }

  const toggle = (id: SkillId) => {
    if (selected.has(id)) {
      if (skills.length > MIN_SKILLS) setPicked(skills.filter((s) => s !== id))
    } else if (skills.length < MAX_SKILLS) setPicked([...skills, id])
  }

  const apply = () => {
    update({ source, filter: filter.trim(), skills, lines: lineCount })
    onClose()
  }

  return (
    <Modal onClose={onClose} className="settings">
      <h2>Настройки</h2>

      {db.status === 'demo' && (
        <div className="note" style={{ marginTop: 0, marginBottom: 18 }}>
          База кандидатов ещё не собрана — игра работает на демо-данных. Соберите её командой <code>npm run db:update</code>.
        </div>
      )}

      {db.status === 'ready' && (
        <div className="field">
          <span className="field__label">Источник</span>
          <div className="segmented">
            {SOURCES.map((s) => (
              <button key={s.id} className={source === s.id ? 'active' : ''} onClick={() => setSource(s.id)} disabled={s.id !== 'all' && !db.counts[s.id]}>
                {s.label} <span className="muted small">{db.counts[s.id]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field__label">Кого ищем</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="например: react, docker, berlin" spellCheck={false} />
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.label} className={`chip chip--btn ${filter === p.filter ? 'chip--matched' : ''}`} onClick={() => choosePreset(p.filter)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="hint">
          Через запятую, все условия сразу. Навыки распознаются по словарю
          {terms.some((t) => t.skill) && <> ({terms.filter((t) => t.skill).map((t) => getSkill(t.skill!).label).join(', ')})</>}, остальное ищется в
          должности, городе и описании.
        </span>
      </div>

      <div className="field">
        <span className="field__label">
          Нужные навыки{' '}
          <span className="muted small">
            выбрано {skills.length} из {MAX_SKILLS}
          </span>
        </span>
        {role.length ? (
          <div className="skill-picker">
            {role.map((s) => {
              const on = selected.has(s.id)
              const sk = getSkill(s.id)
              const locked = !on && skills.length >= MAX_SKILLS
              return (
                <button
                  key={s.id}
                  className={`chip chip--btn chip--pick ${on ? 'chip--matched' : ''}`}
                  style={{ ['--c' as string]: sk.color }}
                  onClick={() => toggle(s.id)}
                  disabled={locked}
                  aria-pressed={on}
                  title={`${s.count} ${plural(s.count, 'кандидат', 'кандидата', 'кандидатов')} с этим навыком · анимация: ${fxLabel(fxMap[s.id])}`}
                >
                  {on && <span className="chip__check">✓</span>}
                  {sk.label} <span className="chip__count">{s.count}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <span className="hint">По этому фильтру нет кандидатов — навыки не из чего выбрать.</span>
        )}
        <div className="lines-info">
          <LinesPreview count={lineCount} />
          <div className="lines-info__text">
            <div className="line-stepper">
              <span>Линий</span>
              <button className="icon-btn icon-btn--sm" onClick={() => setLineWish(lineCount - 1)} disabled={lineCount <= minLines} aria-label="Меньше линий">
                −
              </button>
              <b className="line-stepper__value">{lineCount}</b>
              <button className="icon-btn icon-btn--sm" onClick={() => setLineWish(lineCount + 1)} disabled={lineCount >= MAX_LINES} aria-label="Больше линий">
                +
              </button>
              <span className="muted small">
                мин. {minLines} · спин {cost} ◎
              </span>
            </div>
            <input
              type="range"
              className="line-range"
              min={1}
              max={MAX_LINES}
              value={lineCount}
              onChange={(e) => setLineWish(Number(e.target.value))}
              aria-label="Число линий"
            />
            <span className="small">
              {sameSkills ? (
                <>
                  Выплата за человека: ×3 = +{payoutFor(3, scaleForLines(payTable, lineCount))} ◎, ×4 = +{payoutFor(4, scaleForLines(payTable, lineCount))} ◎, ×5 = +{payoutFor(5, scaleForLines(payTable, lineCount))} ◎
                </>
              ) : (
                'Выплаты пересчитаются под новые навыки после «Применить»'
              )}
            </span>
            <span className="hint">
              Барабаны честные: каждая клетка выпадает случайно, частые навыки (например, React) выпадают чаще редких. Линии включаются по
              порядку, ставка {LINE_BET} ◎ за линию. Навыки складываются у линий, которые пересекаются в клетке с совпавшим навыком; повторы
              считаются один раз. За спин может выпасть несколько человек: после каждого совпадения его линии заняты, следующее ищется на
              остальных — поэтому каждая добавленная линия даёт шанс на ещё одного человека. Выплата подбирается под навыки: редкие платят больше.
            </span>
          </div>
        </div>
        <span className={`match-count ${matches < 10 ? 'match-count--low' : ''}`}>
          Подходит: <b>{matches.toLocaleString('ru-RU')}</b> <span className="muted small">(есть 3+ выбранных навыка)</span>{' '}
          {matches < 10 && '— маловато для игры, ослабьте фильтр или выберите другие навыки'}
        </span>
      </div>

      <label className="field field--row">
        <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
        <span>Звук</span>
      </label>
      <label className="field field--row">
        <input type="checkbox" checked={settings.fx} onChange={(e) => update({ fx: e.target.checked })} />
        <span>Анимации слотов при выигрыше</span>
      </label>

      <div className="settings__actions">
        <button className="btn btn--ghost btn--sm" onClick={reset}>
          Сбросить прогресс
        </button>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={apply} disabled={matches === 0}>
          Применить
        </button>
      </div>
    </Modal>
  )
}
