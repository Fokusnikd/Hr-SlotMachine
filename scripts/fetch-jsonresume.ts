/**
 * Сборщик резюме из JSON Resume Registry (registry.jsonresume.org).
 *
 *   npm run db:jsonresume                 — догрузить новых людей
 *   npm run db:jsonresume -- --limit=200  — не больше 200 новых резюме (для пробы)
 *   npm run db:jsonresume -- --relist     — заново получить список username
 *   npm run db:jsonresume -- --refresh    — перекачать всех, даже уже скачанных
 *
 * Результат: data/raw/jsonresume.json (сырые снимки). Базу для игры собирает `npm run db:build`.
 */
import { resolve } from 'node:path'
import { compactResume, JSONRESUME_REGISTRY, type JsonResumeRaw } from '../src/data/sources/jsonresume'
import { fetchWithRetry, HttpError, loadRemoved, mapLimit, parseArgs, progress, RAW_DIR, readJson, sleep, writeJson } from './lib'

const LIST_FILE = resolve(RAW_DIR, 'jsonresume-usernames.json')
const RAW_FILE = resolve(RAW_DIR, 'jsonresume.json')
const LIST_TTL = 7 * 24 * 3600 * 1000
const REFETCH_AFTER = 30 * 24 * 3600 * 1000
/** Не держим снимок дольше этого без успешного обновления — старше удаляется из кэша совсем (не «храним резюме всегда»). */
const PURGE_AFTER = 180 * 24 * 3600 * 1000

type RawStore = Record<string, JsonResumeRaw | { username: string; fetchedAt: string; missing: true }>

const args = parseArgs()
const limit = args.limit ? Number(args.limit) : Infinity
const concurrency = args.concurrency ? Number(args.concurrency) : 4

/** Недокументированный JSON-эндпоинт списка. Иногда бывает медленным. */
async function listViaApi(): Promise<string[]> {
  const names = new Set<string>()
  const per = 100
  for (let page = 1; page < 500; page++) {
    const res = await fetchWithRetry(`${JSONRESUME_REGISTRY}/api/resumes?limit=${per}&page=${page}`, { timeoutMs: 45_000, retries: 2 })
    const items = (await res.json()) as { username?: string }[]
    items.forEach((i) => i.username && names.add(i.username))
    process.stdout.write(`\r  /api/resumes: страница ${page}, всего ${names.size}   `)
    if (items.length < per) break
    await sleep(300)
  }
  process.stdout.write('\n')
  return [...names]
}

/** Запасной путь: страницы /explore (100 резюме на страницу, данные вшиты в HTML). */
async function listViaExplore(): Promise<string[]> {
  const names = new Set<string>()
  for (let page = 1; page < 500; page++) {
    const res = await fetchWithRetry(`${JSONRESUME_REGISTRY}/explore?page=${page}`, { timeoutMs: 60_000, retries: 2 })
    const html = (await res.text()).replace(/\\"/g, '"')
    const before = names.size
    for (const m of html.matchAll(/"username":"([^"]+)"/g)) names.add(m[1])
    process.stdout.write(`\r  /explore: страница ${page}, всего ${names.size}   `)
    const total = Number(html.match(/"totalPages":(\d+)/)?.[1] ?? 0)
    if (names.size === before || (total && page >= total)) break
    await sleep(500)
  }
  process.stdout.write('\n')
  return [...names]
}

async function getUsernames(): Promise<string[]> {
  const cached = await readJson<{ fetchedAt: string; usernames: string[] } | null>(LIST_FILE, null)
  if (cached && !args.relist && Date.now() - Date.parse(cached.fetchedAt) < LIST_TTL) {
    console.log(`Список username из кэша: ${cached.usernames.length}`)
    return cached.usernames
  }
  console.log('Получаем список резюме…')
  let usernames: string[] = []
  try {
    usernames = await listViaApi()
  } catch (e) {
    console.warn(`\n  /api/resumes не ответил (${(e as Error).message}), пробуем /explore`)
  }
  if (usernames.length < 100) {
    try {
      usernames = [...new Set([...usernames, ...(await listViaExplore())])]
    } catch (e) {
      console.warn(`\n  /explore тоже не ответил: ${(e as Error).message}`)
    }
  }
  if (!usernames.length) {
    if (cached) {
      console.warn('Реестр недоступен — используем старый список.')
      return cached.usernames
    }
    throw new Error('Не удалось получить список резюме. Попробуйте позже.')
  }
  await writeJson(LIST_FILE, { fetchedAt: new Date().toISOString(), usernames })
  console.log(`Найдено резюме: ${usernames.length}`)
  return usernames
}

async function main() {
  const removed = await loadRemoved()
  const usernames = (await getUsernames()).filter((u) => !removed.has(u.toLowerCase()))
  const store = await readJson<RawStore>(RAW_FILE, {})

  // Право на забвение: стираем из кэша сразу, не дожидаясь пересборки.
  let erased = 0
  for (const key of Object.keys(store)) {
    if (removed.has(key.toLowerCase())) {
      delete store[key]
      erased++
    }
  }

  // Не храним резюме бессрочно: снимок, который давно не обновлялся (реестр недоступен, человек исчез
  // из выдачи и т.п.), из локального кэша удаляется, а не копится вечно.
  let purged = 0
  for (const [key, r] of Object.entries(store)) {
    if (Date.now() - Date.parse(r.fetchedAt) > PURGE_AFTER) {
      delete store[key]
      purged++
    }
  }
  if (erased || purged) console.log(`Забвение/просрочка: удалено из кэша ${erased} (запрос на удаление), ${purged} (старше ${PURGE_AFTER / 86400000} дней).`)

  const todo = usernames
    .filter((u) => {
      const r = store[u]
      return args.refresh || !r || Date.now() - Date.parse(r.fetchedAt) > REFETCH_AFTER
    })
    .slice(0, limit)
  console.log(`В кэше: ${Object.keys(store).length}. К загрузке: ${todo.length}`)

  let ok = 0
  let missing = 0
  let failed = 0
  let sinceSave = 0
  await mapLimit(
    todo,
    concurrency,
    async (username) => {
      try {
        const res = await fetchWithRetry(`${JSONRESUME_REGISTRY}/api/${encodeURIComponent(username)}.json`, { timeoutMs: 30_000, retries: 2 })
        const full = await res.json()
        store[username] = compactResume(username, full)
        ok++
      } catch (e) {
        if (e instanceof HttpError && (e.status === 404 || e.status === 400)) {
          store[username] = { username, fetchedAt: new Date().toISOString(), missing: true }
          missing++
        } else failed++
      }
      if (++sinceSave >= 100) {
        sinceSave = 0
        await writeJson(RAW_FILE, store)
      }
      await sleep(150)
    },
    (done) => progress('  резюме', done, todo.length),
  )
  await writeJson(RAW_FILE, store)
  console.log(`Готово: +${ok}, нет резюме: ${missing}, ошибок сети: ${failed}. Всего в кэше: ${Object.keys(store).length}`)
  console.log('Дальше: npm run db:build')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
