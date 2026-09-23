/**
 * Сборщик профилей разработчиков с GitHub.
 *
 *   GITHUB_TOKEN=ghp_xxx npm run db:github
 *   npm run db:github -- --pages=3 --query="language:go location:berlin"
 *
 * Токен (fine-grained, без прав) можно положить в .env.local как GITHUB_TOKEN=...
 * Без токена лимит 60 запросов/час — хватит примерно на 25 профилей.
 *
 * Результат: data/raw/github.json. Базу для игры собирает `npm run db:build`.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fetchGithubRaw, RateLimitError, searchUsers, type GithubRaw } from '../src/data/sources/github'
import { mapLimit, parseArgs, progress, RAW_DIR, readJson, ROOT, sleep, writeJson } from './lib'

const RAW_FILE = resolve(RAW_DIR, 'github.json')
const REFETCH_AFTER = 30 * 24 * 3600 * 1000

/** Набор запросов по умолчанию — разные стеки и города, чтобы база была разнообразной. */
const DEFAULT_QUERIES = [
  'language:typescript followers:>50 repos:>10',
  'language:javascript followers:>80 repos:>10',
  'language:python followers:>80 repos:>10',
  'language:go followers:>50 repos:>10',
  'language:java followers:>50 repos:>10',
  'language:kotlin followers:>30 repos:>10',
  'language:swift followers:>30 repos:>10',
  'language:rust followers:>50 repos:>10',
  'language:php followers:>50 repos:>10',
  'language:c# followers:>50 repos:>10',
  'location:moscow followers:>30 repos:>10',
  'location:"saint petersburg" followers:>30 repos:>10',
]

async function loadToken(): Promise<string | undefined> {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
  for (const f of ['.env.local', '.env']) {
    try {
      const txt = await readFile(resolve(ROOT, f), 'utf8')
      const m = txt.match(/^\s*(?:VITE_)?GITHUB_TOKEN\s*=\s*(\S+)/m)
      if (m) return m[1]
    } catch {
      /* файла нет */
    }
  }
  return undefined
}

const args = parseArgs()
const pages = Number(args.pages ?? 2)
const perPage = 30
const queries = typeof args.query === 'string' ? [args.query] : DEFAULT_QUERIES

let limitHits = 0

async function waitForReset(e: RateLimitError): Promise<boolean> {
  // Если сразу после ожидания снова 403 — это не лимит (нет доступа/блок), не крутимся бесконечно.
  if (++limitHits > 3) {
    console.warn('\nGitHub продолжает отвечать 403 — прекращаем. Проверьте токен и сеть.')
    return false
  }
  const wait = e.resetAt ? e.resetAt - Date.now() + 2000 : 60_000
  if (wait > 15 * 60_000) {
    console.warn(`\nЛимит GitHub исчерпан до ${new Date(e.resetAt!).toLocaleTimeString()}. Сохраняем прогресс и выходим.`)
    return false
  }
  console.warn(`\nЛимит GitHub: ждём ${Math.ceil(wait / 1000)} с…`)
  await sleep(Math.max(1000, wait))
  return true
}

async function main() {
  const token = await loadToken()
  if (!token) console.warn('⚠ GITHUB_TOKEN не найден: лимит 60 запросов/час. Добавьте токен в .env.local.')
  const store = await readJson<Record<string, GithubRaw>>(RAW_FILE, {})
  let stop = false

  // 1. Собираем логины
  const logins = new Set<string>()
  for (const q of queries) {
    for (let page = 1; page <= pages && !stop; page++) {
      try {
        const found = await searchUsers(q, page, perPage, token)
        limitHits = 0
        found.forEach((l) => logins.add(l))
        process.stdout.write(`\rПоиск: «${q}» стр. ${page} → всего ${logins.size}      `)
        if (found.length < perPage) break
        await sleep(2200) // search API: 30 запросов/мин с токеном
      } catch (e) {
        if (e instanceof RateLimitError) {
          if (!(await waitForReset(e))) stop = true
          else page--
        } else {
          console.warn(`\n${(e as Error).message}`)
          break
        }
      }
    }
  }
  process.stdout.write('\n')

  // 2. Качаем профили
  const todo = [...logins].filter((l) => {
    const r = store[l.toLowerCase()]
    return args.refresh || !r || Date.now() - Date.parse(r.fetchedAt) > REFETCH_AFTER
  })
  console.log(`Новых профилей к загрузке: ${todo.length} (в кэше ${Object.keys(store).length})`)
  let ok = 0
  let sinceSave = 0
  await mapLimit(
    todo,
    3,
    async (login) => {
      while (!stop) {
        try {
          store[login.toLowerCase()] = await fetchGithubRaw(login, token)
          limitHits = 0
          ok++
          break
        } catch (e) {
          if (e instanceof RateLimitError) {
            if (!(await waitForReset(e))) stop = true
          } else break
        }
      }
      if (++sinceSave >= 50) {
        sinceSave = 0
        await writeJson(RAW_FILE, store)
      }
    },
    (done) => progress('  профили', done, todo.length),
  )
  await writeJson(RAW_FILE, store)
  console.log(`Готово: +${ok}. Всего в кэше: ${Object.keys(store).length}`)
  console.log('Дальше: npm run db:build')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
