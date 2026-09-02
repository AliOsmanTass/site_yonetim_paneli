import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../server/db/schema'
import type { Database as AppDatabase } from '../../server/utils/drizzle'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = resolve(__dirname, '../../server/db/migrations')

/**
 * Testler için in-memory SQLite DB. Var olan migration SQL dosyalarının hepsini
 * doğrudan uygular — şema burada tekrar tanımlanmıyor.
 */
export function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:')

  const migrationFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of migrationFiles) {
    const migrationSql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8')
    for (const statement of migrationSql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim()
      if (trimmed) sqlite.exec(trimmed)
    }
  }

  return drizzle(sqlite, { schema }) as unknown as AppDatabase
}
