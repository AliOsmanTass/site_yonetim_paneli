<script setup lang="ts">
// Site anasayfası — açık erişim, salt okunur.
interface SiteInfo {
  siteName: string
  siteDescription: string | null
}

interface DashboardSummary {
  unitCount: number
  unpaidUnitCount: number
  unpaidDuesCount: number
  totalDuesDebt: number
}

interface Announcement {
  title: string
  body: string
  publishedAt: string
}

const { data: siteInfo } = await useFetch<SiteInfo>('/api/public/site-info')
const { data: summary } = await useFetch<DashboardSummary>('/api/public/dashboard-summary')
const { data: announcements } = await useFetch<Announcement[]>('/api/public/announcements', { default: () => [] })

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-8 p-8">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        {{ siteInfo?.siteName || 'Site Yönetimi' }}
      </h1>
      <div class="flex items-center gap-2">
        <UColorModeButton />
        <UButton to="/borc-detay" color="neutral" variant="outline">
          Borç Detay
        </UButton>
        <UButton to="/admin/login">
          Yönetici Girişi
        </UButton>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <UCard>
        <p class="text-sm text-gray-500">
          Daire Sayısı
        </p>
        <p class="text-2xl font-bold">
          {{ summary?.unitCount ?? 0 }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Aidat Ödemeyen Daire
        </p>
        <p class="text-2xl font-bold">
          {{ summary?.unpaidUnitCount ?? 0 }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Ödenmeyen Aidat (ay)
        </p>
        <p class="text-2xl font-bold">
          {{ summary?.unpaidDuesCount ?? 0 }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Toplam Aidat Borcu
        </p>
        <p class="text-2xl font-bold">
          {{ (summary?.totalDuesDebt ?? 0).toLocaleString('tr-TR') }} ₺
        </p>
      </UCard>
      
    </div>

    <p v-if="siteInfo?.siteDescription" class="text-gray-600 dark:text-gray-300">
      {{ siteInfo.siteDescription }}
    </p>

    <div>
      <h2 class="mb-3 text-lg font-semibold">
        Duyurular
      </h2>
      <div v-if="announcements?.length" class="space-y-3">
        <UCard v-for="(a, i) in announcements" :key="i">
          <p class="font-medium">
            {{ a.title }}
          </p>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
            {{ a.body }}
          </p>
          <p class="mt-2 text-xs text-gray-500">
            {{ formatDate(a.publishedAt) }}
          </p>
        </UCard>
      </div>
      <p v-else class="text-sm text-gray-500">
        Henüz duyuru yok.
      </p>
    </div>
  </div>
</template>
