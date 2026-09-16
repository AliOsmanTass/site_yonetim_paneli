// Vercel Cron Job tarafından tetiklenir (bkz. vercel.json). Nitro'nun
// croner tabanlı scheduledTasks'ı Vercel'in sunucusuz (serverless) ortamında
// sürekli açık bir process gerektirdiği için hiç çalışmıyor — aynı mantığı
// buradan, gerçek bir HTTP isteğiyle tetikliyoruz.
import { runMonthlyAccrual } from '../../utils/accrual'

export default defineEventHandler(async (event) => {
  // Vercel, CRON_SECRET tanımlıysa cron isteklerine bu header'ı otomatik ekler.
  const authHeader = getHeader(event, 'authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const today = new Date().toISOString().slice(0, 10)
  const result = await runMonthlyAccrual(useDrizzle(), today)
  return { result: 'success', ...result }
})
