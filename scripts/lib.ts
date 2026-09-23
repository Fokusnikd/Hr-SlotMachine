import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const RAW_DIR = resolve(ROOT, 'data/raw')
export const DB_FILE = resolve(ROOT, 'public/data/candidates.json')
/** Юзернеймы, которые попросили удалить (право на забвение) — данные больше никогда не скачиваются и не публикуются. */
export const REMOVED_FILE = resolve(ROOT, 'data/removed.json')

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Множество удалённых по запросу юзернеймов (в нижнем регистре) — см. data/removed.json, npm run db:remove. */
export async function loadRemoved(): Promise<Set<string>> {
  const list = await readJson<string[]>(REMOVED_FILE, [])
  return new Set(list.map((u) => u.toLowerCase()))
}

/** Пишем через временный файл, чтобы прерванный скрипт не оставил битый JSON. */
export async function writeJson(file: string, data: unknown, pretty = false): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, pretty ? 2 : 0))
  await rename(tmp, file)
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out: Record<string, string | boolean> = {}
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    if (m) out[m[1]] = m[2] ?? true
  }
  return out
}

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
  ) {
    super(`HTTP ${status} ${url}`)
  }
}

export async function fetchWithRetry(
  url: string,
  { timeoutMs = 30_000, retries = 3, headers = {} as Record<string, string> } = {},
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'hrgacha-collector', ...headers }, signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404 || res.status === 400) throw new HttpError(res.status, url) // не повторяем
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status} ${url}`)
      if (!res.ok) throw new HttpError(res.status, url)
      return res
    } catch (e) {
      if (e instanceof HttpError) throw e
      lastErr = e
      if (attempt < retries) await sleep(1000 * 2 ** attempt + Math.random() * 500)
    }
  }
  throw lastErr
}

/** Параллельная обработка с ограничением; onProgress вызывается после каждого элемента. */
export async function mapLimit<T>(items: T[], limit: number, fn: (x: T, i: number) => Promise<void>, onProgress?: (done: number) => void) {
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      await fn(items[i], i)
      onProgress?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export function progress(label: string, done: number, total: number) {
  if (done === total || done % 25 === 0) process.stdout.write(`\r${label}: ${done}/${total}   `)
  if (done === total) process.stdout.write('\n')
}
