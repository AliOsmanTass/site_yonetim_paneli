// Site tanıtımı — sadece isim ve açıklama döner. 
export default defineEventHandler(async () => {
  const [settings] = await useDrizzle().select().from(tables.siteSettings).where(eq(tables.siteSettings.id, 1))
  return {
    siteName: settings?.siteName ?? '',
    siteDescription: settings?.siteDescription ?? null
  }
})
