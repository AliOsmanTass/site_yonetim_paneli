import * as schema from '../db/schema'

export { sql, eq, and, or, desc, asc, lt, gt } from 'drizzle-orm'

// Testler auto-import olmadan çalıştığı için şemayı burada elle içe
// aktarıyoruz. Bu, NuxtHub'ın aynı schema.ts'ten ürettiği `schema` ile
// birebir aynı nesne.
export const tables = schema


export function useDrizzle() {
  return db
}

export type Database = ReturnType<typeof useDrizzle>
