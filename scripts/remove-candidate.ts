/**
 * Право на забвение: убирает человека из базы по запросу на удаление.
 *
 *   npm run db:remove -- <username>                    — из JSON Resume Registry
 *   npm run db:remove -- <login> --source=github        — из GitHub
 *
 * Добавляет юзернейм в data/removed.json (больше никогда не скачивается и не публикуется —
 * это проверяют db:jsonresume, db:github и db:build), стирает его сырой снимок из data/raw
 * и пересобирает public/data/candidates.json.
 */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { ROOT, RAW_DIR, REMOVED_FILE, parseArgs, readJson, writeJson } from './lib'

async function main() {
  const args = parseArgs()
  const username = process.argv[2]
  if (!username || username.startsWith('--')) {
    console.error('Использование: npm run db:remove -- <username> [--source=jsonresume|github]')
    process.exit(1)
  }
  const source = args.source === 'github' ? 'github' : 'jsonresume'
  const key = username.toLowerCase()

  const removed = await readJson<string[]>(REMOVED_FILE, [])
  if (!removed.some((u) => u.toLowerCase() === key)) {
    removed.push(key)
    await writeJson(REMOVED_FILE, removed.sort(), true)
  }

  const rawFile = resolve(RAW_DIR, source === 'github' ? 'github.json' : 'jsonresume.json')
  const store = await readJson<Record<string, unknown>>(rawFile, {})
  let erased = false
  for (const k of Object.keys(store)) {
    if (k.toLowerCase() === key) {
      delete store[k]
      erased = true
    }
  }
  if (erased) await writeJson(rawFile, store)

  console.log(`«${username}» добавлен(а) в data/removed.json (${source}), сырой снимок стёрт: ${erased ? 'да' : 'его и не было в кэше'}.`)
  console.log('Пересобираю candidates.json…')
  execFileSync('npm', ['run', 'db:build'], { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
