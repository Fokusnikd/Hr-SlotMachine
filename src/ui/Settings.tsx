import { useMemo, useState } from 'react'
import { playable, resolveLines, resolveSkills, defaultSkills, groupsFor, poolSkillsFor, roleSkillsFor, useGame, type SourceFilter } from '../game/store'
import { groupLabel } from '../data/titleGroups'
import { MAX_SKILLS, MIN_SKILLS } from '../game/outcome'
import { LINE_BET, plural } from '../game/economy'
import { BONUS_MIN, HIRES_TO_WIN, REJECTS_TO_LOSE } from '../game/bonus'
import { GUIDE } from '../copy'
import { getSkill } from '../game/skills'
import { assignFx, fxLabel } from '../game/fx'
import { Modal } from './common'
import { sfx } from '../audio/sfx'
import type { SkillId } from '../game/types'

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
  const [group, setGroup] = useState(settings.group)
  const [groupQuery, setGroupQuery] = useState('')
  const [picked, setPicked] = useState<SkillId[]>(settings.skills)

  // Пресет: навыки людей выбранной группы (без группы — все навыки пула). Ограничено только число выбранных.
  const available = useMemo(() => poolSkillsFor(all, { source, group }), [all, source, group])
  // Если пресет сменился и из выбора почти ничего не осталось — подставляем топ-5.
  const skills = useMemo(() => resolveSkills(picked, available), [picked, available])
  const selected = new Set(skills)
  // Анимации раздаются по пулу барабанов (топ навыков всего пула + выбранные) — та же раздача, что будет в игре.
  const reelSkills = useMemo(() => roleSkillsFor(all, { source }), [all, source])
  const fxMap = useMemo(() => assignFx([...new Set([...reelSkills.map((r) => r.id), ...skills])], source), [reelSkills, skills, source])
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hit = (id: SkillId) => !q || getSkill(id).label.toLowerCase().includes(q) || id.includes(q)
    // Выбранные — всегда сверху, дальше все подходящие под поиск, по числу кандидатов
    return [...available.filter((s) => selected.has(s.id)), ...available.filter((s) => !selected.has(s.id) && hit(s.id))]
  }, [available, query, skills])
  // Совпадения — во всём пуле источника: пресет только подсказывает навыки
  const matches = useMemo(() => playable(all, { source }, skills).length, [all, source, skills])
  const lineCount = resolveLines(settings.lines, skills.length)

  // Пресеты навыков — группы должностей (src/data/title-groups.json) среди кандидатов источника
  const groups = useMemo(() => groupsFor(all, { source }), [all, source])
  const shownGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase()
    return groups.filter((g) => g.id === group || !q || groupLabel(g.id).toLowerCase().includes(q))
  }, [groups, groupQuery, group])
  const chooseGroup = (g: string) => {
    setGroup(g)
    setPicked(defaultSkills(poolSkillsFor(all, { source, group: g })))
  }

  const toggle = (id: SkillId) => {
    if (selected.has(id)) {
      if (skills.length > MIN_SKILLS) setPicked(skills.filter((s) => s !== id))
    } else if (skills.length < MAX_SKILLS) setPicked([...skills, id])
  }

  const apply = () => {
    update({ source, group, skills, lines: lineCount })
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
        <span className="field__label">
          Skill preset <span className="muted small">{groups.length} positions from résumé titles · everyone stays in the pool</span>
        </span>
        <input className="skill-search" value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} placeholder={`Search ${groups.length} presets…`} spellCheck={false} />
        <div className="skill-picker skill-picker--groups">
          <button className={`chip chip--btn chip--pick ${group === '' ? 'chip--matched' : ''}`} onClick={() => chooseGroup('')} aria-pressed={group === ''}>
            All skills
          </button>
          {shownGroups.map((g) => (
            <button
              key={g.id}
              className={`chip chip--btn chip--pick ${group === g.id ? 'chip--matched' : ''}`}
              onClick={() => chooseGroup(g.id)}
              aria-pressed={group === g.id}
            >
              {groupLabel(g.id)} <span className="chip__count">{g.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">
          Skills needed{' '}
          <span className="muted small">
            {skills.length} of {MAX_SKILLS} selected
          </span>
        </span>
        {available.length ? (
          <>
          <input
            className="skill-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${available.length} skills…`}
            spellCheck={false}
          />
          <div className="skill-picker skill-picker--all">
            {shown.map((s) => {
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
                  title={`${s.count} ${plural(s.count, 'candidate', 'candidates', 'candidates')} with this skill${group ? ' in this preset' : ''}${fxMap[s.id] ? ` · animation: ${fxLabel(fxMap[s.id])}` : ''}`}
                >
                  {on && <span className="chip__check">✓</span>}
                  {sk.label} <span className="chip__count">{s.count}</span>
                </button>
              )
            })}
            {!shown.length && <span className="hint">No skills match “{query}”.</span>}
          </div>
          </>
        ) : (
          <span className="hint">No candidates in this preset — there are no skills to choose from.</span>
        )}
        <span className={`match-count ${matches < 10 ? 'match-count--low' : ''}`}>
          Matches: <b>{matches.toLocaleString('en-US')}</b> <span className="muted small">(has 3+ selected skills)</span>{' '}
          {matches < 10 && '— too few to play, pick different skills'}
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
