// Açık anasayfadaki gösterge kartları — admin panelle aynı hesabı kullanır,
// giriş gerektirmiyor çünkü kişisel veri içermiyor.
export default defineEventHandler(async () => {
  return getDashboardSummary(useDrizzle())
})
