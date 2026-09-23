import { useMemo, useState } from 'react'
import { parseFilter, playable, resolveLines, resolveSkills, defaultSkills, roleSkillsFor, useGame, type SourceFilter } from '../game/store'
import { activeCells, cellKey, combosFor, linesFor, MAX_LINES, MAX_SKILLS, minLinesFor, MIN_SKILLS, REELS, ROWS } from '../game/outcome'
import { LINE_BET, payoutFor, plural, scaleForLines, spinCost } from '../game/economy'
import { getSkill } from '../game/skills'
import { assignFx, fxLabel } from '../game/fx'
import { Modal } from './common'
import type { SkillId } from '../game/types'

const PRESETS: { label: string; filter: string }[] = [
  { label: 'All', filter: '' },
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
  { id: 'all', label: 'All' },
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
      <h2>Settings</h2>

      {db.status === 'demo' && (
        <div className="note" style={{ marginTop: 0, marginBottom: 18 }}>
          The candidate database hasn't been built yet — the game is running on demo data. Build it with <code>npm run db:update</code>.
        </div>
      )}

      {db.status === 'ready' && (
        <div className="field">
          <span className="field__label">Source</span>
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
        <span className="field__label">Who we're looking for</span>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g.: react, docker, berlin" spellCheck={false} />
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.label} className={`chip chip--btn ${filter === p.filter ? 'chip--matched' : ''}`} onClick={() => choosePreset(p.filter)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="hint">
          Comma-separated, all conditions apply together. Skills are recognized from a dictionary
          {terms.some((t) => t.skill) && <> ({terms.filter((t) => t.skill).map((t) => getSkill(t.skill!).label).join(', ')})</>}, everything else is
          searched for in the title, city, and description.
        </span>
      </div>

      <div className="field">
        <span className="field__label">
          Skills needed{' '}
          <span className="muted small">
            {skills.length} of {MAX_SKILLS} selected
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
                  title={`${s.count} ${plural(s.count, 'candidate', 'candidates', 'candidates')} with this skill · animation: ${fxLabel(fxMap[s.id])}`}
                >
                  {on && <span className="chip__check">✓</span>}
                  {sk.label} <span className="chip__count">{s.count}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <span className="hint">No candidates match this filter — there are no skills to choose from.</span>
        )}
        <div className="lines-info">
          <LinesPreview count={lineCount} />
          <div className="lines-info__text">
            <div className="line-stepper">
              <span>Lines</span>
              <button className="icon-btn icon-btn--sm" onClick={() => setLineWish(lineCount - 1)} disabled={lineCount <= minLines} aria-label="Fewer lines">
                −
              </button>
              <b className="line-stepper__value">{lineCount}</b>
              <button className="icon-btn icon-btn--sm" onClick={() => setLineWish(lineCount + 1)} disabled={lineCount >= MAX_LINES} aria-label="More lines">
                +
              </button>
              <span className="muted small">
                min. {minLines} · spin {cost} ◎
              </span>
            </div>
            <input
              type="range"
              className="line-range"
              min={1}
              max={MAX_LINES}
              value={lineCount}
              onChange={(e) => setLineWish(Number(e.target.value))}
              aria-label="Number of lines"
            />
            <span className="small">
              {sameSkills ? (
                <>
                  Payout per person: ×3 = +{payoutFor(3, scaleForLines(payTable, lineCount))} ◎, ×4 = +{payoutFor(4, scaleForLines(payTable, lineCount))} ◎, ×5 = +{payoutFor(5, scaleForLines(payTable, lineCount))} ◎
                </>
              ) : (
                'Payouts recalculate for the new skills after "Apply"'
              )}
            </span>
            <span className="hint">
              The reels are fair: every cell lands at random, and common skills (like React) come up more often than rare ones. Lines
              activate in order, at a cost of {LINE_BET} ◎ per line. Skills add up on lines that cross at a cell with a matched skill; repeats
              count once. Several people can appear per spin: once a match is made its lines are used up, and the next match is searched for on
              the rest — so every extra line is a chance at another person. Payouts are tuned to the skills: rare ones pay more.
            </span>
          </div>
        </div>
        <span className={`match-count ${matches < 10 ? 'match-count--low' : ''}`}>
          Matches: <b>{matches.toLocaleString('en-US')}</b> <span className="muted small">(has 3+ selected skills)</span>{' '}
          {matches < 10 && '— too few to play, loosen the filter or pick different skills'}
        </span>
      </div>

      <label className="field field--row">
        <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
        <span>Sound</span>
      </label>
      <label className="field field--row">
        <input type="checkbox" checked={settings.fx} onChange={(e) => update({ fx: e.target.checked })} />
        <span>Slot animations on win</span>
      </label>

      <div className="settings__actions">
        <button className="btn btn--ghost btn--sm" onClick={reset}>
          Reset progress
        </button>
        <span className="spacer" />
        <button className="btn btn--primary" onClick={apply} disabled={matches === 0}>
          Apply
        </button>
      </div>
    </Modal>
  )
}
