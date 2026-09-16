// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: ['@nuxthub/core', '@nuxt/ui'],

  css: ['~/assets/css/main.css'],

  // Varsayılan tema açık (beyaz) — kullanıcı sağ üstteki düğmeyle karanlık moda geçebilir.
  colorMode: {
    preference: 'light',
    fallback: 'light'
  },

  hub: {

    db: 'sqlite',
    kv: true
  },

  nitro: {
    experimental: {
      tasks: true
    },
    scheduledTasks: {
      // Her ayın 1'i, gece — aylık aidat tahakkuku + huzur hakkı gideri
      '0 0 1 * *': ['monthly-accrual'],
      // Her gün — askı süresi dolan duyuruları arşive taşır
      '0 3 * * *': ['daily-maintenance']
    }
  }
})
