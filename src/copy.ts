/**
 * Все тексты игры в одном месте — табло сообщений, надписи на автомате, карточка, шорт-лист.
 *
 * Как устроено:
 *  - Массив = набор вариантов. Каждый раз берётся случайный, но не тот же, что в прошлый раз
 *    (`say` / `pick`), — чтобы фразы не приедались. Хотите новую шутку — просто допишите строку в массив.
 *  - Вариант может быть строкой или функцией от параметров (имя кандидата, число навыков и т. п.).
 *    Параметры у всех вариантов одного набора одинаковые — смотрите тип набора.
 *  - Одиночная строка/функция (не массив) — служебный текст, который должен быть всегда одинаковым
 *    (кнопки, подписи табло, подсказки про управление).
 *
 * Тон: английский HR-сленг. Нейтральные подсказки — легко, промахи и проигрыши — острее.
 * Шутим над процессом найма, а не над реальными людьми из базы: имя кандидата не должно
 * стоять рядом с оценкой его самого (никаких «rejected», «not a fit» про конкретного человека).
 * Кнопки и настройки остаются понятными.
 */

import type { Rarity } from './game/types'

// ---------- Механика выбора ----------

type Line<A extends unknown[]> = string | ((...args: A) => string)

const lastPicked = new WeakMap<readonly unknown[], number>()

/** Случайный элемент набора, не повторяющий предыдущий выбор из этого же набора. */
export function pick<T>(list: readonly T[]): T {
  if (list.length < 2) return list[0]
  const prev = lastPicked.get(list)
  let i = Math.floor(Math.random() * list.length)
  if (i === prev) i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length
  lastPicked.set(list, i)
  return list[i]
}

/** Детерминированный выбор по ключу — для текстур, которые перерисовываются много раз в одном состоянии
 *  (одно и то же состояние → одна и та же фраза, без мигания). */
export function pickStable<T>(list: readonly T[], key: string | number): T {
  const s = String(key)
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return list[(h >>> 0) % list.length]
}

/** Выбрать вариант из набора и подставить параметры. */
export function say<A extends unknown[]>(list: readonly Line<A>[], ...args: A): string {
  const v = pick(list)
  return typeof v === 'function' ? v(...args) : v
}

/** То же, но стабильно по ключу (см. pickStable). */
export function sayStable<A extends unknown[]>(list: readonly Line<A>[], key: string | number, ...args: A): string {
  const v = pickStable(list, key)
  return typeof v === 'function' ? v(...args) : v
}

// ---------- Бренд ----------

export const BRAND = {
  /** Большая надпись на вывеске. */
  name: 'TALENT JACKPOT',
  /** Подзаголовок вывески — выбирается при загрузке страницы. */
  taglines: ['SOURCING, GAMIFIED', 'ALWAYS HIRING', 'SPIN TO SOURCE', 'WHERE PIPELINES PAY OUT', 'ATS WITH EXTRA STEPS'],
  /** Имя файла экспорта шорт-листа (без даты и расширения). */
  csvFile: 'talent-jackpot-shortlist',
} as const

// ---------- Надписи на автомате ----------

export const MACHINE = {
  /** Панель под барабанами: правило игры (всегда одно) + шутка (выбирается при загрузке). */
  rule: "3+ skills in combo = it's a match",
  ruleJokes: [
    'crossing lines stack · no cover letter needed',
    'crossing lines stack · just like interview rounds',
    'crossing lines stack · referrals welcome',
    'crossing lines stack · no take-home assignment',
  ],
  /** Подписи на кнопках панели. */
  spin: 'SPIN',
  minus: '−',
  plus: '+',
  open: 'OPEN',
  auto: 'AUTO',
  autoSub: 'SPIN',
  line: 'LINE',
  lines: 'LINES',
  shortlist: 'SHORTLIST',
  settings: 'SETTINGS',
  /** Табло линий и ставки. */
  linesLabel: 'LINES',
  linesAutoLabel: 'LINES · AUTO',
  betLabel: 'BET',
  /** Табло статистики. */
  stats: { pool: 'POOL', eligible: 'ELIGIBLE', seen: 'SEEN', spins: 'SPINS', finds: 'FINDS' },
  loadingDb: 'WARMING UP THE TALENT POOL…',
  demoCandidates: 'DEMO CANDIDATES',
  allSources: 'ALL SOURCES',
  skill: 'SKILL',
  skills: 'SKILLS',
  /** Табло кредитов. */
  credits: 'CREDITS',
  /** Просьба о деньгах, когда кредиты кончились (кликабельно). */
  askBudget: [
    (n: number) => `CLICK: BEG HRD FOR +${n}`,
    (n: number) => `CLICK: ASK FINANCE FOR +${n}`,
    (n: number) => `CLICK: PITCH A BUDGET +${n}`,
  ],
  /** Штамп на папке-скаттере, когда она «принята». */
  scatterStamp: 'SOURCED',
} as const

// ---------- Бонус «Золотая папка» ----------

export const FOLDERS = {
  front: 'RESUME',
  empty: 'no-show',
  match: 'MATCH',
  miss: 'MISS',
  shield: 'SHIELD',
  shieldBroken: 'miss',
} as const

// ---------- Колесо торга (миниигра улучшения) ----------

export const WHEEL = {
  title: 'OFFER NEGOTIATION',
  headLost: ['GHOSTED', 'OFFER DECLINED', 'COUNTER-OFFERED'],
  headSigned: ['OFFER ACCEPTED', 'SIGNED', 'DEAL CLOSED'],
  headHolding: ['ON THE TABLE', 'IN TALKS', 'OFFER PENDING'],
  lostTitle: 'NO DEAL',
  lost: ['took a counter-offer · whole chain lost', 'went with a competitor · whole chain lost', 'current employer matched it · chain lost'],
  maxTitle: '★ MAXIMUM',
  maxUnicorn: ['certified unicorn · nobody stronger in the pool', 'unicorn spotted · nobody stronger in the pool'],
  maxLeft: ['nobody stronger left in the pool', 'best of what the pool has left'],
  spinning: ['CIRCLING BACK…', 'WAITING FOR REPLY…', 'LEGAL IS REVIEWING…'],
  odds: (p: number) => `${p}% to sign`,
  oddsTitle: (p: number) => `${p}% TO SIGN`,
  push: ['"let me think about it" — free respin!', '"let me ask my partner" — free respin!', '"can we hop on a call?" — free respin!'],
  legend: 'envelope = +skills · yellow = free respin · red = lose all',
  /** Окошко над стрелкой: жёлтый и красный сектора (на зелёном — навыки цели). */
  windowPush: '↻ FREE RESPIN',
  windowLose: '✕ GHOSTED',
  /** Кнопки у колеса. */
  spinBtn: 'SPIN',
  takeBtn: 'TAKE',
  backBtn: 'BACK',
  maxBtn: '★ MAX',
  maxBtnSub: 'nobody stronger',
  keep: (grade: number) => `keep ×${grade}`,
  sign: (grade: number) => `sign ×${grade}`,
} as const

// ---------- Уровни совпадения ----------

/** Название уровня на баннере карточки. legendary — максимум совпадений в пуле, rare — максимум − 1. */
export const RARITY_NAME: Record<Rarity, string> = {
  common: 'Match',
  rare: 'Strong match',
  legendary: '🦄 UNICORN',
}

// ---------- Карточка кандидата и шорт-лист ----------

export const CARD = {
  fromBonus: 'Golden Folder · ',
  of: 'of',
  maxUnicorn: '★ Unicorn — max match in the pool',
  maxLeft: "★ Best match that's left",
  wheelBtn: '🎡 Negotiation wheel',
  wheelHint:
    'Spin the negotiation wheel: green — a stronger match steps in and you can keep climbing, yellow — free respin, red — the candidate walks and the whole chain is lost',
  openResume: 'Open resume ↗',
  openProfile: 'Open profile ↗',
  shortlist: '⭐ Add to shortlist',
  exchange: (gain: number) => `Exchange for +${gain} ◎`,
  demoNote: 'Demo candidate: the link opens a search for similar profiles on GitHub.',
  lessThanYear: '< 1 year experience',
  years: (y: number) => `${y} ${y === 1 ? 'year' : 'years'} experience`,
} as const

export const SHORTLIST = {
  title: '⭐ Shortlist',
  /** Пустой шорт-лист — выбирается при открытии. */
  empty: [
    'Pipeline is empty. Spin the reels and save the ones you like.',
    'Nobody here yet. Emptier than the office on a Friday at 5 pm — go spin!',
    'Your shortlist is waiting for its first unicorn. Spin the reels!',
    'No candidates yet. The hiring manager is already asking for updates.',
  ],
} as const

// ---------- Табло сообщений ----------

type Grade = { from: number; to: number | null; odds: string }

export const MSG = {
  loading: ['Warming up the talent pool…', 'Syncing with the ATS… any minute now…', 'Loading candidates. HR is on their third coffee…'],
  ready: [
    "Press SPIN or Space — talent won't source itself!",
    'Press SPIN or Space. The pipeline is hungry.',
    "Press SPIN or Space — let's fill that headcount!",
  ],
  demo: 'No database yet — interviewing demo candidates for now',
  noMatch: [
    'Hunting unicorns? Nobody matches this filter — relax it in settings ⚙',
    'This job ad scared everyone off — loosen the filter in settings ⚙',
    'Zero applicants. Maybe drop "10 years of experience"? Settings ⚙',
  ],
  outOfCredits: [
    'Hiring freeze! Out of credits — beg HRD for budget (button up top)',
    'Budget is gone. Time to ask HRD nicely (button up top)',
    'Out of credits. Finance says "next quarter". Ask HRD (button up top)',
  ],
  poolDrained: [
    'Talent pool drained — change the filter or reset progress ⚙',
    "You've met everyone. Literally. Change the filter or reset progress ⚙",
  ],
  spinning: ['Sourcing…', 'Scanning resumes…', 'Boolean search in progress…', 'Screening…'],
  autoSpinning: ['Auto-spin: spray and pray…', 'Auto-spin: mass outreach mode…', 'Auto-spin: copy-pasting InMails…'],
  /** Неразобранные кандидаты обменяны при новом спине (служебный префикс). */
  autoExchanged: (who: string, gain: number) => `${who} → +${gain} ◎. `,
  miss: [
    'Miss. Your outreach was left on read.',
    'Miss. Ghosted before the screening call.',
    "Miss. Even the ATS couldn't find anyone.",
    'Miss. Maybe try posting on a Tuesday?',
  ],
  nearMiss: [
    (name: string) => `Almost! ${name} has 2 skills — the job ad wants 3+. Spin again?`,
    (name: string) => `So close! ${name} ticks 2 boxes, the hiring manager wants 3. Spin again?`,
    (name: string) => `Almost! 2 skills for ${name}. One more and it's a screening call. Spin again?`,
  ],
  winOne: [
    (p: { skills: string; where: string; name: string; total: number }) => `It's a match! ${p.skills} on ${p.where} — ${p.name}. OPEN — card, SPIN — exchange for +${p.total} ◎`,
    (p: { skills: string; where: string; name: string; total: number }) => `Screening call booked! ${p.skills} on ${p.where} — ${p.name}. OPEN — card, SPIN — exchange for +${p.total} ◎`,
    (p: { skills: string; where: string; name: string; total: number }) => `Hot lead! ${p.skills} on ${p.where} — ${p.name}. OPEN — card, SPIN — exchange for +${p.total} ◎`,
  ],
  winMany: [
    (p: { people: string; best: number; name: string; total: number }) => `${p.people} in the pipeline, best ×${p.best} — ${p.name}! OPEN — cards, SPIN — exchange all for +${p.total} ◎`,
    (p: { people: string; best: number; name: string; total: number }) => `Inbox exploded: ${p.people}, best ×${p.best} — ${p.name}! OPEN — cards, SPIN — exchange all for +${p.total} ◎`,
    (p: { people: string; best: number; name: string; total: number }) => `Busy day: ${p.people}, best ×${p.best} — ${p.name}! OPEN — cards, SPIN — exchange all for +${p.total} ◎`,
  ],
  /** После разбора кандидата, если в этом спине есть ещё (служебный хвост). */
  nextUp: (note: string, left: number, name: string, grade: number) => `${note} Next up (${left} in the lobby): ${name} ×${grade}`,
  exchange: [
    (name: string, gain: number) => `Swapped ${name} for +${gain} credits. Budget season is brutal.`,
    (name: string, gain: number) => `+${gain} credits for ${name}. Finance is thrilled.`,
    (name: string, gain: number) => `Traded ${name} for +${gain} credits. Headcount is just a number.`,
  ],
  keep: [
    (name: string) => `${name} shortlisted ⭐ Only 6 interview rounds to go.`,
    (name: string) => `${name} shortlisted ⭐ Now find a slot in 5 calendars.`,
    (name: string) => `${name} shortlisted ⭐ Scheduling hell starts now.`,
  ],
  refill: [
    (n: number) => `HRD approved +${n} credits. Took only 3 syncs and a deck.`,
    (n: number) => `HRD found +${n} credits in the "misc" budget line.`,
    (n: number) => `+${n} credits. HRD says it's the last time. It's never the last time.`,
  ],
  /** Сводка после смены настроек — служебная. */
  poolSummary: (p: { total: number; eligible: number; skills: string; lines: string; cost: number }) =>
    `Pool: ${p.total} · eligible ${p.eligible} · ${p.skills}, ${p.lines}, spin ${p.cost} ◎`,
  minLines: (skills: string, lines: string) => `${skills} need at least ${lines}`,
  linesSet: (lines: string, cost: number) => `${lines} · spin ${cost} ◎`,
  autoStopped: ['Auto-spin stopped. Back to hand-crafted outreach.', 'Auto-spin off. Personalized InMails only from now on.'],
  reset: ['Progress reset. New quarter, new KPIs!', 'Clean slate. Same job ad, new hope.', 'Progress reset. Pretend last quarter never happened.'],

  // --- Бонус «Золотая папка» ---
  bonusStart: [
    (n: number) => `GOLDEN FOLDER ×${n}! Referral round: 3 "Match" — a candidate, 3 "Miss" — round over.`,
    (n: number) => `GOLDEN FOLDER ×${n}! Referrals incoming: 3 "Match" — a candidate, 3 "Miss" — you're out.`,
  ],
  bonusShields: (n: number) => ` Shields against "Miss": ${n}`,
  bonusIncoming: (n: number, waiting: string) => `GOLDEN FOLDER ×${n}!${waiting}`,
  bonusWaiting: (people: string, verb: string) => ` Bonus first — ${people} from the lines ${verb} waiting in the lobby.`,
  bonusStatus: (p: { hires: number; needHires: number; rejects: number; maxRejects: number; shields: string }) =>
    `Match ${p.hires}/${p.needHires} · Miss ${p.rejects}/${p.maxRejects}${p.shields}`,
  bonusShieldsLeft: (left: number, total: number) => ` · Shields ${left}/${total}`,
  folderMatch: ['MATCH!', 'MATCH! Nice referral.', 'MATCH! That one checks out.'],
  folderEmpty: ['No-show.', 'No-show. Calendar invite declined.', 'Empty. Someone forgot to attach the CV.'],
  folderShield: ['Miss — blocked by a shield. Plan B!', 'Miss — shield up. HR always has a backup.'],
  folderMiss: ['MISS.', 'MISS. Wrong referral.', "MISS. That was the CEO's nephew."],
  bonusPrize: [
    (name: string, got: number, of: number) => `REFERRAL HIT! ${name} — ${got} of ${of} skills. Opening the card…`,
    (name: string, got: number, of: number) => `Golden referral! ${name} — ${got} of ${of} skills. Opening the card…`,
  ],
  consolationEmpty: (gain: number) => `Talent pool is empty — consolation prize +${gain} ◎`,
  consolationMiss: [
    'Three misses. Classic hiring quarter.',
    "Three misses. Referrals aren't what they used to be.",
  ],
  goldenMore: (name: string, grade: number, more: number, total: number) =>
    `Golden Folder: ${name} ×${grade}! Then ${more} more from the lines. SPIN — exchange all for +${total} ◎`,
  goldenOne: (name: string, grade: number, gain: number) => `Golden Folder: ${name} ×${grade}! SPIN — exchange for +${gain} ◎`,
  bonusOverWith: (text: string) => `Bonus over. ${text}`,
  bonusOver: ['Bonus over. Back to cold outreach!', 'Bonus over. Back to the LinkedIn trenches!'],

  // --- Колесо торга ---
  wheelStart: [
    (g: Grade) => `Offer talks ${g.from}★ → ${g.to}★ · ${g.odds}. Red = ghosted, you lose it all.`,
    (g: Grade) => `Counter-offer time ${g.from}★ → ${g.to}★ · ${g.odds}. Red = ghosted, you lose it all.`,
  ],
  negotiating: [
    (g: Grade) => `Circling back on the offer ${g.from}★ → ${g.to}★…`,
    (g: Grade) => `Waiting for their reply ${g.from}★ → ${g.to}★…`,
    (g: Grade) => `Legal is reviewing the offer ${g.from}★ → ${g.to}★…`,
  ],
  push: [
    (g: Grade) => `"Let me think about it over the weekend" — free respin! ${g.from}★ → ${g.to}★ · ${g.odds}.`,
    (g: Grade) => `"I need to discuss it with my partner" — free respin! ${g.from}★ → ${g.to}★ · ${g.odds}.`,
    (g: Grade) => `"Can we hop on a call first?" — free respin! ${g.from}★ → ${g.to}★ · ${g.odds}.`,
  ],
  /** chain — пустая строка или хвост из lostChain. */
  lost: [
    (chain: string) => `Red! Ghosted — they took a counter-offer${chain}.`,
    (chain: string) => `Red! They accepted another offer${chain}.`,
    (chain: string) => `Red! Their current employer matched it${chain}.`,
  ],
  lostChain: (steps: number) => ` and the whole ${steps}-step chain is gone`,
  signed: [
    (g: Grade & { plus: string }) => `Offer accepted! ×${g.from}${g.plus}. TAKE it or push your luck: ${g.from}★ → ${g.to}★ · ${g.odds}.`,
    (g: Grade & { plus: string }) => `They signed! ×${g.from}${g.plus}. TAKE it or push your luck: ${g.from}★ → ${g.to}★ · ${g.odds}.`,
  ],
  signedUnicorn: [
    (grade: number, plus: string) => `Offer accepted! ×${grade}${plus} — ★ UNICORN, nobody stronger in the pool. TAKE it!`,
    (grade: number, plus: string) => `Unicorn signed! ×${grade}${plus} — the pool has nothing better. TAKE it!`,
  ],
  signedMaxLeft: [
    (grade: number, plus: string) => `Offer accepted! ×${grade}${plus} — ★ best of what's left in the pool. TAKE it!`,
  ],
  /** steps — пустая строка или хвост из dealSteps. */
  deal: [
    (steps: string, name: string, grade: number) => `Offer signed! ${steps}${name} ×${grade}.`,
    (steps: string, name: string, grade: number) => `Paperwork done! ${steps}${name} ×${grade}.`,
    (steps: string, name: string, grade: number) => `Welcome aboard (almost)! ${steps}${name} ×${grade}.`,
  ],
  dealSteps: (n: number) => `${n} steps up — `,
  stays: [
    (name: string, grade: number) => `No counter-offer. ${name} stays at ×${grade}.`,
    (name: string, grade: number) => `Keeping it simple — ${name} stays at ×${grade}.`,
  ],
  /** chain — пустая строка или хвост из walkedChain. */
  walkedAway: [
    (chain: string) => `Ghosted after the final round${chain}. No deal.`,
    (chain: string) => `They took the other offer${chain}. No deal.`,
  ],
  walkedChain: (steps: string) => ` — ${steps} lost`,
}
