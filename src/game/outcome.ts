import type { Candidate, Rarity, SkillId, SpinResult } from "./types";
import { MAX_WINS_PER_SPIN, SCATTER_P, TARGET_SHARE, TARGET_SHARE_6PLUS } from "./tuning";

export { SCATTER_P } from "./tuning";

export const REELS = 5;
/** Видимые ряды: 0 — верхний, 1 — средний (основная линия), 2 — нижний. */
export const ROWS = 3;
export const MID_ROW = 1;
export const MIN_MATCH = 3;

/** Сколько навыков можно выбрать. */
export const MIN_SKILLS = MIN_MATCH;
export const BASE_SKILLS = REELS;
export const MAX_SKILLS = 10;

export type Rng = () => number;

/** Бонусный символ «Золотая папка» (scatter). Не навык: не участвует в линиях и сетях. */
export const SCATTER: SkillId = "__hire";
/** Вероятность scatter в клетке — SCATTER_P в tuning.ts. */
export const BONUS_MIN_SCATTERS = 3;

const pick = <T>(arr: readonly T[], rng: Rng): T =>
  arr[Math.floor(rng() * arr.length)];

// ---------- Линии ----------

export interface Cell {
  reel: number;
  row: number;
}

export interface Payline {
  /** Номер линии 1–25, как на табличке выплат. */
  id: number;
  color: string;
  /** Ряд на каждом барабане (0 — верх, 1 — середина, 2 — низ). */
  rows: number[];
  /** Нота линии: сдвиг в полутонах по мажорной гамме (линия 1 — 0, дальше выше). Звучит, когда
   *  линия становится последней включённой (добавили её или убрали следующую). */
  note: number;
}

/** Ступени мажорной гаммы в полутонах. */
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
/** `i`-я ступень мажорной гаммы от тоники (0 — тоника, 7 — октава выше…). */
export const majorStep = (i: number) => 12 * Math.floor(i / 7) + MAJOR_SCALE[i % 7];

export const cellKey = (c: Cell) => c.row * REELS + c.reel;

/** 25 классических линий выплат (как на референсе): ряд на каждом из 5 барабанов. */
const PAYLINE_ROWS: [number[], string][] = [
  [[0, 0, 0, 0, 0], "#1de0d0"],
  [[1, 1, 1, 1, 1], "#ff2d3d"],
  [[2, 2, 2, 2, 2], "#22c524"],
  [[1, 0, 1, 2, 1], "#e8c21c"],
  [[1, 2, 1, 0, 1], "#ff6a4a"],
  [[0, 0, 2, 0, 0], "#6a2cf0"],
  [[2, 2, 0, 2, 2], "#f08a1e"],
  [[0, 0, 1, 2, 2], "#d75cff"],
  [[2, 2, 1, 0, 0], "#ff8d1a"],
  [[2, 1, 2, 1, 2], "#12b89a"],
  [[0, 1, 0, 1, 0], "#f21fd5"],
  [[0, 1, 1, 1, 0], "#ffb86a"],
  [[1, 2, 2, 2, 1], "#8b4dff"],
  [[1, 0, 0, 0, 1], "#e8189a"],
  [[2, 1, 1, 1, 2], "#9fc21a"],
  [[1, 1, 2, 1, 1], "#ff4db8"],
  [[1, 1, 0, 1, 1], "#a61ee0"],
  [[1, 0, 2, 0, 1], "#ff4a14"],
  [[2, 1, 0, 1, 2], "#2a8cf0"],
  [[0, 1, 2, 1, 0], "#5cff9a"],
  [[1, 2, 0, 2, 1], "#f02aa8"],
  [[0, 2, 2, 2, 0], "#6ab4ff"],
  [[2, 0, 0, 0, 2], "#c6dc50"],
  [[0, 2, 0, 2, 0], "#ffae5c"],
  [[2, 0, 2, 0, 2], "#1f7fe0"],
];

export const PAYLINES: Payline[] = PAYLINE_ROWS.map(([rows, color], i) => ({
  id: i + 1,
  rows,
  color,
  note: majorStep(i),
}));
export const MAX_LINES = PAYLINES.length;

/** Первые `count` линий — линии добавляются строго по порядку номеров. */
export const linesFor = (count: number) =>
  PAYLINES.slice(0, Math.max(1, Math.min(MAX_LINES, count)));

/** Уникальные клетки набора линий. Пересечения считаются один раз. */
export function activeCells(lines: Payline[]): Cell[] {
  const seen = new Map<number, Cell>();
  for (const l of lines)
    l.rows.forEach((row, reel) => {
      const c = { reel, row };
      seen.set(cellKey(c), c);
    });
  return [...seen.values()].sort((a, b) => a.reel - b.reel || a.row - b.row);
}

export interface Combo {
  /** Номера линий, связанных общими клетками. */
  lineIds: number[];
  cells: Cell[];
}

/**
 * Комбо — цепочки пересекающихся линий: линии, у которых есть общая клетка (напрямую или через
 * другие линии), объединяются, их клетки складываются. Непересекающиеся линии — отдельные комбо.
 */
export function combosFor(lines: Payline[]): Combo[] {
  const parent = lines.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const owner = new Map<number, number>();
  lines.forEach((l, i) =>
    l.rows.forEach((row, reel) => {
      const k = cellKey({ reel, row });
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else parent[find(i)] = find(j);
    }),
  );
  const groups = new Map<number, Payline[]>();
  lines.forEach((l, i) =>
    groups.set(find(i), [...(groups.get(find(i)) ?? []), l]),
  );
  return [...groups.values()]
    .map((ls) => ({ lineIds: ls.map((l) => l.id), cells: activeCells(ls) }))
    .sort((a, b) => b.cells.length - a.cells.length);
}

/** «1+2+4» или «1–8» для подряд идущих номеров. */
export function describeLines(ids: number[]): string {
  const sorted = [...ids].sort((a, b) => a - b);
  const consecutive = sorted.every(
    (v, i) => i === 0 || v === sorted[i - 1] + 1,
  );
  return consecutive && sorted.length > 2
    ? `${sorted[0]}–${sorted[sorted.length - 1]}`
    : sorted.join("+");
}

/** Размер самого большого комбо. */
export const maxComboSize = (lines: Payline[]) =>
  combosFor(lines)[0]?.cells.length ?? 0;

/**
 * Минимум линий, при котором по порядку набирается комбо на `skillCount` клеток.
 * До 5 навыков — 1 линия; 6–10 — нужна линия 4, которая связывает ряды 1–3 (4 линии).
 */
export function minLinesFor(skillCount: number): number {
  const need = Math.max(BASE_SKILLS, Math.min(MAX_SKILLS, skillCount));
  for (let n = 1; n <= MAX_LINES; n++)
    if (maxComboSize(linesFor(n)) >= need) return n;
  return MAX_LINES;
}

// ---------- Оценка ----------

export function rarityFor(matchCount: number): Rarity | null {
  if (matchCount >= 5) return "legendary";
  if (matchCount === 4) return "rare";
  if (matchCount === 3) return "common";
  return null;
}

/**
 * Уровень относительно пула: legendary (UNICORN) — максимум совпадений, какой вообще есть в пуле
 * под фильтром; rare (Strong match) — максимум − 1; остальное — common (Match).
 * Если выбрано 8 навыков, а в пуле ни у кого больше 7, — UNICORN'ы только с 7.
 */
export function rarityInPool(matchCount: number, poolMax: number): Rarity | null {
  if (matchCount < 3) return null;
  if (matchCount >= poolMax) return "legendary";
  if (matchCount === poolMax - 1) return "rare";
  return "common";
}

/** Топ навыков среди кандидатов — список навыков «позиции» и алфавит барабанов. */
export function topSkills(
  candidates: Candidate[],
  max = 20,
): { id: SkillId; count: number }[] {
  const freq = new Map<SkillId, number>();
  for (const c of candidates)
    for (const s of new Set(c.skills)) freq.set(s, (freq.get(s) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([id, count]) => ({ id, count }));
}

/** Совместимость со старым API: просто id топ-навыков. */
export function buildSymbolPool(candidates: Candidate[], max = 14): SkillId[] {
  return topSkills(candidates, max).map((s) => s.id);
}

/** Уникальные выбранные навыки, которые видны в активных клетках. Повторы не считаются. */
export function shownTargets(
  grid: SkillId[][],
  cells: Cell[],
  targets: ReadonlySet<SkillId>,
): Set<SkillId> {
  const out = new Set<SkillId>();
  for (const c of cells) {
    const s = grid[c.row]?.[c.reel];
    if (s && targets.has(s)) out.add(s);
  }
  return out;
}

export interface Evaluation {
  winner: Candidate | null;
  matched: SkillId[];
  nearMiss: { candidate: Candidate; matched: SkillId[] } | null;
}

/** Оценка набора видимых навыков: кандидат с наибольшим пересечением, от 3 — победа. */
export function evaluateSet(
  shown: ReadonlySet<SkillId>,
  candidates: Candidate[],
  exclude: ReadonlySet<string> = new Set(),
  preferredId?: string,
): Evaluation {
  let best: { c: Candidate; m: SkillId[] } | null = null;
  for (const c of candidates) {
    if (exclude.has(c.id)) continue;
    const m = [...new Set(c.skills)].filter((s) => shown.has(s));
    if (
      !best ||
      m.length > best.m.length ||
      (m.length === best.m.length && c.id === preferredId)
    )
      best = { c, m };
  }
  if (best && best.m.length >= MIN_MATCH)
    return { winner: best.c, matched: best.m, nearMiss: null };
  if (best && best.m.length === MIN_MATCH - 1)
    return {
      winner: null,
      matched: [],
      nearMiss: { candidate: best.c, matched: best.m },
    };
  return { winner: null, matched: [], nearMiss: null };
}

export function evaluateGrid(
  grid: SkillId[][],
  cells: Cell[],
  targets: ReadonlySet<SkillId>,
  candidates: Candidate[],
  exclude?: ReadonlySet<string>,
  preferredId?: string,
): Evaluation {
  return evaluateSet(
    shownTargets(grid, cells, targets),
    candidates,
    exclude,
    preferredId,
  );
}

/** Одна линия, все навыки считаются выбранными (старый режим; используется в тестах). */
export function evaluateLine(
  line: SkillId[],
  candidates: Candidate[],
  exclude?: ReadonlySet<string>,
  preferredId?: string,
): Evaluation {
  return evaluateSet(new Set(line), candidates, exclude, preferredId);
}

// ---------- Генерация ----------

// ---------- Совпадения через пересечения линий ----------

/**
 * Совпадение для кандидата — связная «сеть» линий:
 *  • «попадание» — клетка активной линии, в которой стоит выбранный навык кандидата;
 *  • в сеть входят только линии, на которых есть хотя бы одно попадание (пустых «мостиков» нет);
 *  • две линии связаны, только если пересекаются в клетке-попадании (просто общая клетка не считается);
 *  • цепочка любой длины: A–B, B–C → A, B, C в одной сети;
 *  • навыки сети — уникальные навыки её попаданий, порядок на линии не важен.
 * Счёт кандидата — лучшая из его сетей. Непересекающиеся линии друг другу навыки не добавляют.
 */
export interface Network {
  lineIds: number[];
  skills: SkillId[];
  /** Клетки-попадания сети. */
  cells: Cell[];
}

export function networksFor(
  grid: SkillId[][],
  lines: Payline[],
  hit: (s: SkillId, c: Cell) => boolean,
): Network[] {
  const withHits = lines
    .map((l) => ({
      l,
      hits: l.rows
        .map((row, reel) => ({ reel, row }))
        .filter((c) => hit(grid[c.row][c.reel], c)),
    }))
    .filter((x) => x.hits.length > 0);
  const parent = withHits.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const owner = new Map<number, number>();
  withHits.forEach((x, i) =>
    x.hits.forEach((c) => {
      const k = cellKey(c);
      const j = owner.get(k);
      if (j === undefined) owner.set(k, i);
      else parent[find(i)] = find(j);
    }),
  );
  const groups = new Map<number, typeof withHits>();
  withHits.forEach((x, i) =>
    groups.set(find(i), [...(groups.get(find(i)) ?? []), x]),
  );
  return [...groups.values()].map((g) => {
    const cells = new Map<number, Cell>();
    for (const x of g) for (const c of x.hits) cells.set(cellKey(c), c);
    return {
      lineIds: g.map((x) => x.l.id).sort((a, b) => a - b),
      skills: [...new Set([...cells.values()].map((c) => grid[c.row][c.reel]))],
      cells: [...cells.values()],
    };
  });
}

export interface StructureEvaluation extends Evaluation {
  /** Сеть победителя (пусто, если выигрыша нет). */
  network: Network | null;
}

/** Честная оценка поля: для каждого кандидата — лучшая сеть; побеждает наибольшая, от 3 навыков. */
export function evaluateStructure(
  grid: SkillId[][],
  lines: Payline[],
  targets: ReadonlySet<SkillId>,
  candidates: Candidate[],
  exclude: ReadonlySet<string> = new Set(),
  preferredId?: string,
): StructureEvaluation {
  let best: { c: Candidate; n: Network } | null = null;
  for (const c of candidates) {
    if (exclude.has(c.id)) continue;
    const own = new Set(c.skills.filter((s) => targets.has(s)));
    if (!own.size) continue;
    for (const n of networksFor(grid, lines, (s) => own.has(s))) {
      if (
        !best ||
        n.skills.length > best.n.skills.length ||
        (n.skills.length === best.n.skills.length &&
          c.id === preferredId &&
          best.c.id !== preferredId)
      )
        best = { c, n };
    }
  }
  if (best && best.n.skills.length >= MIN_MATCH)
    return {
      winner: best.c,
      matched: best.n.skills,
      nearMiss: null,
      network: best.n,
    };
  if (best && best.n.skills.length === MIN_MATCH - 1)
    return {
      winner: null,
      matched: [],
      nearMiss: { candidate: best.c, matched: best.n.skills },
      network: null,
    };
  return { winner: null, matched: [], nearMiss: null, network: null };
}

/**
 * Какие линии подсветить: из сети победителя — связный (через клетки-попадания) минимальный
 * набор линий, покрывающий все совпавшие навыки. Жадно растим от самой «богатой» линии.
 */
export function winningLines(
  grid: SkillId[][],
  lines: Payline[],
  network: Network,
): { lineIds: number[]; cells: Cell[] } {
  const hitKeys = new Set(network.cells.map(cellKey));
  const netLines = lines.filter((l) => network.lineIds.includes(l.id));
  const hitsOf = (l: Payline) =>
    l.rows
      .map((row, reel) => ({ reel, row }))
      .filter((c) => hitKeys.has(cellKey(c)));
  const skillsOf = (l: Payline) =>
    new Set(hitsOf(l).map((c) => grid[c.row][c.reel]));
  const touches = (l: Payline, keys: Set<number>) =>
    hitsOf(l).some((c) => keys.has(cellKey(c)));
  const left = new Set(network.skills);
  const chosen: Payline[] = [];
  const chosenKeys = new Set<number>();
  const add = (l: Payline) => {
    chosen.push(l);
    for (const c of hitsOf(l)) chosenKeys.add(cellKey(c));
    for (const sk of skillsOf(l)) left.delete(sk);
  };
  add([...netLines].sort((a, b) => skillsOf(b).size - skillsOf(a).size)[0]);
  while (left.size) {
    // Соседи набора; берём дающего больше новых навыков. Если все дают 0 — идём к ближайшему «полезному» через соседа.
    const neighbours = netLines.filter(
      (l) => !chosen.includes(l) && touches(l, chosenKeys),
    );
    if (!neighbours.length) break;
    const gain = (l: Payline) =>
      [...skillsOf(l)].filter((sk) => left.has(sk)).length;
    neighbours.sort((a, b) => gain(b) - gain(a));
    add(neighbours[0]);
  }
  // Убираем линии, без которых покрытие и связность сохраняются (остались «транзитные» лишние).
  for (const l of [...chosen].reverse()) {
    if (chosen.length === 1) break;
    const rest = chosen.filter((x) => x !== l);
    const covered = new Set(rest.flatMap((x) => [...skillsOf(x)]));
    if (!network.skills.every((sk) => covered.has(sk))) continue;
    // связность rest через клетки-попадания
    const seen = new Set([rest[0]]);
    const stack = [rest[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      const keys = new Set(hitsOf(cur).map(cellKey));
      for (const o of rest)
        if (!seen.has(o) && touches(o, keys)) (seen.add(o), stack.push(o));
    }
    if (seen.size === rest.length) chosen.splice(chosen.indexOf(l), 1);
  }
  const cells = new Map<number, Cell>();
  for (const l of chosen) for (const c of hitsOf(l)) cells.set(cellKey(c), c);
  return {
    lineIds: chosen.map((l) => l.id).sort((a, b) => a - b),
    cells: [...cells.values()],
  };
}

// ---------- Честные барабаны ----------

/**
 * Модель барабана: каждая клетка поля выпадает независимо. С вероятностью `targetShare` — выбранный
 * навык (вес ∝ √доли кандидатов пула с этим навыком: React у 40 % выпадает заметно чаще редких,
 * но не забивает поле), иначе — «пустышка» (невыбранный навык позиции, равновероятно).
 * Никакой подкрутки: выигрыш — ровно то, что выпало.
 */
export interface ReelModel {
  symbols: SkillId[];
  probs: number[];
  cum: number[];
}

/** Доля клеток с выбранными навыками. Подобрано симуляцией (scripts/sim.ts). */
export function targetShareFor(targetCount: number): number {
  // Мало навыков — у кандидата нужны почти все, поэтому выбранные выпадают чаще. Значения — tuning.ts.
  const { base, step, min } = TARGET_SHARE_6PLUS;
  return TARGET_SHARE[targetCount] ?? Math.max(min, base - step * (targetCount - 5));
}

export function buildReelModel(
  candidates: Candidate[],
  targets: SkillId[],
  blanks: SkillId[],
  targetShare = targetShareFor(targets.length),
  scatterP = SCATTER_P,
): ReelModel {
  const n = Math.max(1, candidates.length);
  const tset = new Set(targets);
  const count = new Map<SkillId, number>();
  for (const c of candidates)
    for (const s of new Set(c.skills))
      if (tset.has(s)) count.set(s, (count.get(s) ?? 0) + 1);
  const raw = targets.map((s) =>
    Math.sqrt(Math.max(0.02, (count.get(s) ?? 0) / n)),
  );
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
  const empties = blanks.filter((s) => !tset.has(s) && s !== SCATTER);
  const scatter = Math.min(scatterP, empties.length ? 1 - targetShare : 0.5);
  const share = empties.length ? targetShare : 1 - scatter;
  const symbols = [...targets, ...empties, ...(scatter > 0 ? [SCATTER] : [])];
  const probs = [
    ...raw.map((r) => (share * r) / rawSum),
    ...empties.map(() => (1 - share - scatter) / empties.length),
    ...(scatter > 0 ? [scatter] : []),
  ];
  const cum: number[] = [];
  probs.reduce((acc, p, i) => (cum[i] = acc + p), 0);
  return { symbols, probs, cum };
}

export function drawSymbol(model: ReelModel, rng: Rng): SkillId {
  const r = rng() * model.cum[model.cum.length - 1];
  let lo = 0;
  let hi = model.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (model.cum[mid] > r) hi = mid;
    else lo = mid + 1;
  }
  return model.symbols[lo];
}

export function drawGrid(model: ReelModel, rng: Rng): SkillId[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: REELS }, () => drawSymbol(model, rng)),
  );
}

/** Кандидаты, сгруппированные по набору выбранных навыков: оценка поля идёт по группам, а не по 900 людям. */
export interface SkillGroup {
  skills: ReadonlySet<SkillId>;
  members: Candidate[];
}

export function groupBySkills(
  candidates: Candidate[],
  targets: SkillId[],
): SkillGroup[] {
  const tset = new Set(targets);
  const map = new Map<string, SkillGroup>();
  for (const c of candidates) {
    const own = [...new Set(c.skills.filter((s) => tset.has(s)))].sort();
    if (own.length < MIN_MATCH - 1) continue;
    const key = own.join("|");
    const g = map.get(key) ?? { skills: new Set(own), members: [] };
    g.members.push(c);
    map.set(key, g);
  }
  return [...map.values()];
}

/** Одно совпадение спина: кандидат, его навыки и линии/клетки, на которых они сложились. */
export interface Win {
  candidate: Candidate;
  matched: SkillId[];
  lineIds: number[];
  cells: Cell[];
  rarity: Rarity;
}

export interface WinsEvaluation {
  wins: Win[];
  nearMiss: { candidate: Candidate; matched: SkillId[] } | null;
}

/**
 * Все выигрыши поля. Жадно: берём самую большую сеть (3+ навыка) среди всех кандидатов пула,
 * её линии «забираются», и следующую сеть ищем на оставшихся линиях. Клетки могут повторяться —
 * как в обычном слоте, где один символ платит по нескольким линиям. Так каждая добавленная линия —
 * шанс на ещё одного человека за спин. Среди равных кандидатов — случайный.
 */
export function evaluateWins(
  grid: SkillId[][],
  lines: Payline[],
  groups: SkillGroup[],
  exclude: ReadonlySet<string> = new Set(),
  rng: Rng = Math.random,
  maxWins = MAX_WINS_PER_SPIN,
): WinsEvaluation {
  let free = lines;
  const taken = new Set<string>(exclude);
  const wins: Win[] = [];
  let near: { g: SkillGroup; n: Network } | null = null;
  const available = (g: SkillGroup) =>
    g.members.filter((c) => !taken.has(c.id));

  // Группы, чьих навыков на поле меньше двух, не смогут ничего собрать — сразу отбрасываем.
  const onGrid = new Set(grid.flat());
  const live = groups.filter((g) => {
    let k = 0;
    for (const s of g.skills)
      if (onGrid.has(s) && ++k >= MIN_MATCH - 1) return true;
    return false;
  });

  while (wins.length < maxWins) {
    let bestSize = 0;
    let best: { g: SkillGroup; n: Network; w: number }[] = [];
    for (const g of live) {
      const people = available(g).length;
      if (!people) continue;
      for (const n of networksFor(grid, free, (s) => g.skills.has(s))) {
        const size = n.skills.length;
        if (size > bestSize) ((bestSize = size), (best = []));
        if (size === bestSize) best.push({ g, n, w: people });
      }
    }
    if (bestSize < MIN_MATCH) {
      if (!wins.length && bestSize === MIN_MATCH - 1 && best.length)
        near = pick(best, rng);
      break;
    }
    // Случайный кандидат среди лучших, пропорционально числу людей в группе.
    const total = best.reduce((a, b) => a + b.w, 0);
    let r = rng() * total;
    let chosen = best[best.length - 1];
    for (const b of best) {
      if (r < b.w) {
        chosen = b;
        break;
      }
      r -= b.w;
    }
    const candidate = pick(available(chosen.g), rng);
    const wl = winningLines(grid, free, chosen.n);
    free = free.filter((l) => !wl.lineIds.includes(l.id));
    taken.add(candidate.id);
    wins.push({
      candidate,
      matched: chosen.n.skills,
      lineIds: wl.lineIds,
      cells: wl.cells,
      rarity: rarityFor(chosen.n.skills.length)!,
    });
  }
  const nearMiss = near
    ? { candidate: pick(available(near.g), rng), matched: near.n.skills }
    : null;
  return { wins, nearMiss };
}

/** Всё, что нужно для спина при текущих настройках (строится один раз при смене настроек). */
export interface Field {
  targets: SkillId[];
  model: ReelModel;
  groups: SkillGroup[];
  /** Максимум выбранных навыков у одного кандидата пула — приз бонуса (для калибровки выплат). */
  bestMatch: number;
}

export function buildField(
  candidates: Candidate[],
  targets: SkillId[],
  blanks: SkillId[],
  targetShare?: number,
  scatterP?: number,
): Field {
  const groups = groupBySkills(candidates, targets);
  return {
    targets,
    model: buildReelModel(candidates, targets, blanks, targetShare, scatterP),
    groups,
    bestMatch: groups.reduce((m, g) => Math.max(m, g.skills.size), 0),
  };
}

/** Клетки со scatter-символом. */
export function scattersOf(grid: SkillId[][]): Cell[] {
  const out: Cell[] = [];
  grid.forEach((row, r) =>
    row.forEach((s, reel) => s === SCATTER && out.push({ reel, row: r })),
  );
  return out;
}

export interface SpinOptions {
  rng?: Rng;
  /** Кандидаты, которые уже выпадали (в шорт-листе/обменяны) — не выдаём повторно. */
  exclude?: ReadonlySet<string>;
}

export function spinField(
  field: Field,
  lineCount: number,
  opts: SpinOptions = {},
): SpinResult {
  const rng = opts.rng ?? Math.random;
  const lines = linesFor(lineCount);
  const grid = drawGrid(field.model, rng);
  const { wins, nearMiss } = evaluateWins(
    grid,
    lines,
    field.groups,
    opts.exclude,
    rng,
  );
  return resultFrom(grid, lines, wins, nearMiss);
}

export function resultFrom(
  grid: SkillId[][],
  lines: Payline[],
  wins: Win[],
  nearMiss: WinsEvaluation["nearMiss"],
): SpinResult {
  const cells = new Map<number, Cell>();
  for (const w of wins) for (const c of w.cells) cells.set(cellKey(c), c);
  const top = wins[0];
  const scatters = scattersOf(grid);
  return {
    grid,
    scatters,
    bonus: scatters.length >= BONUS_MIN_SCATTERS ? scatters.length : 0,
    line: grid[MID_ROW],
    cells: activeCells(lines),
    lines,
    wins,
    winCells: [...cells.values()],
    winLines: [...new Set(wins.flatMap((w) => w.lineIds))].sort(
      (a, b) => a - b,
    ),
    winner: top?.candidate ?? null,
    matched: [...new Set(wins.flatMap((w) => w.matched))],
    rarity: top?.rarity ?? null,
    nearMiss,
  };
}

/** Совместимость: спин по списку кандидатов (строит поле на лету). */
export function generateSpin(
  candidates: Candidate[],
  pool: SkillId[],
  targetList: SkillId[] = pool.slice(0, BASE_SKILLS),
  lineCount = minLinesFor(targetList.length),
  opts: SpinOptions = {},
): SpinResult {
  return spinField(buildField(candidates, targetList, pool), lineCount, opts);
}
