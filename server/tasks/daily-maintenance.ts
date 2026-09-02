// Her gün çalışır (nuxt.config.ts de belirlenir). Askı süresi geçmiş aktif
// duyuruları arşive taşır.
import { useDrizzle } from '../utils/drizzle'
import { runDailyMaintenance } from '../utils/maintenance'

export default defineTask({
  meta: {
    name: 'daily-maintenance',
    description: 'Süresi dolan duyuruların arşivlenmesi '
  },
  async run() {
    const today = new Date().toISOString().slice(0, 10)
    const result = await runDailyMaintenance(useDrizzle(), today)
    return { result: 'success', ...result }
  }
})
