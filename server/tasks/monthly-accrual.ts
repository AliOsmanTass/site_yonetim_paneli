// Her ayın 1'i çalışır . Tüm dairelere o ayın aidat
// borcunu yazar; cron iki kez tetiklense bile aynı borç tekrar oluşmaz
// (debts tablosundaki unique kısıt engelliyor). 
import { useDrizzle } from '../utils/drizzle'
import { runMonthlyAccrual } from '../utils/accrual'

export default defineTask({
  meta: {
    name: 'monthly-accrual',
    description: 'Aylık aidat tahakkuku ve huzur hakkı gideri'
  },
  async run() {
    const today = new Date().toISOString().slice(0, 10)
    const result = await runMonthlyAccrual(useDrizzle(), today)
    return { result: 'success', ...result }
  }
})
