import { defineConfig } from 'drizzle-kit'

// Şema ve migration konumları 

export default defineConfig({
  out: './server/db/migrations',
  schema: './server/db/schema.ts',
  dialect: 'sqlite'
})
