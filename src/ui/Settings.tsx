import { useMemo, useState } from 'react'
import { parseFilter, playable, resolveLines, resolveSkills, defaultSkills, roleSkillsFor, useGame, type SourceFilter } from '../game/store'
import { MAX_SKILLS, MIN_SKILLS } from '../game/outcome'
import { LINE_BET, plural } from '../game/economy'
import { BONUS_MIN, HIRES_TO_WIN, REJECTS_TO_LOSE } from '../game/bonus'
import { GUIDE } from '../copy'
import { getSkill } from '../game/skills'
import { assignFx, fxLabel } from '../game/fx'
import { Modal } from './common'
import { sfx } from '../audio/sfx'
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

/** Короткий гайд: барабаны, миниигра «Золотая папка», колесо торга. */
function Guide() {
  const sections = GUIDE.sections({ lineBet: LINE_BET, bonusMin: BONUS_MIN, hires: HIRES_TO_WIN, rejects: REJECTS_TO_LOSE })
  return (
    <div className="guide">
      <span className="field__label">{GUIDE.title}</span>
      <div className="guide__grid">
        {sections.map((sec) => (
          <section key={sec.title} className="guide__card">
            <h3>
              <span aria-hidden="true">{sec.icon}</span> {sec.title}
            </h3>
            <ul>
              {sec.points.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

/** Ползунок громкости 0..100 %; `preview` — отпустили ползунок, звучит короткий пример. */
function VolumeSlider({ label, value, onChange, preview }: { label: string; value: number; onChange: (v: number) => void; preview?: boolean }) {
  const pct = Math.round(value * 100)
  return (
    <label className="volume__row">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={preview ? () => sfx.button() : undefined}
        onKeyUp={preview ? () => sfx.button() : undefined}
        aria-label={`${label} volume`}
      />
      <span className="muted small volume__value">{pct}%</span>
    </label>
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

  const role = useMemo(() => roleSkillsFor(all, { source, filter }), [all, source, filter])
  // Анимации навыков раздаются по позиции — та же раздача, что будет в игре.
  const fxMap = useMemo(() => assignFx(role.map((r) => r.id), `${source}|${filter.trim().toLowerCase()}`), [role, source, filter])
  // Если позиция сменилась и из выбора почти ничего не осталось — подставляем топ-5.
  const skills = useMemo(() => resolveSkills(picked, role), [picked, role])
  const selected = new Set(skills)
  const matches = useMemo(() => playable(all, { source, filter }, skills).length, [all, source, filter, skills])
  const terms = parseFilter(filter)
  const lineCount = resolveLines(settings.lines, skills.length)

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
        <span className={`match-count ${matches < 10 ? 'match-count--low' : ''}`}>
          Matches: <b>{matches.toLocaleString('en-US')}</b> <span className="muted small">(has 3+ selected skills)</span>{' '}
          {matches < 10 && '— too few to play, loosen the filter or pick different skills'}
        </span>
      </div>

      <Guide />

      <label className="field field--row">
        <input type="checkbox" checked={settings.sound} onChange={(e) => update({ sound: e.target.checked })} />
        <span>Sound</span>
      </label>
      <div className={`field volume ${settings.sound ? '' : 'volume--muted'}`}>
        <VolumeSlider label="Volume" value={settings.masterVol} onChange={(v) => update({ masterVol: v })} preview />
        <VolumeSlider label="Music" value={settings.musicVol} onChange={(v) => update({ musicVol: v })} />
        <VolumeSlider label="Effects" value={settings.sfxVol} onChange={(v) => update({ sfxVol: v })} preview />
      </div>
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
