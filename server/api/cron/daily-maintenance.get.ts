// Vercel Cron Job tarafından tetiklenir (bkz. vercel.json). Bkz.
// monthly-accrual.get.ts'teki not — Nitro'nun kendi zamanlayıcısı Vercel'de
// çalışmıyor.
import { runDailyMaintenance } from '../../utils/maintenance'

export default defineEventHandler(async (event) => {
  const authHeader = getHeader(event, 'authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = await runDailyMaintenance(useDrizzle(), today)
  return { result: 'success', ...result }
})
