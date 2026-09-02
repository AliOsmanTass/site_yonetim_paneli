<script setup lang="ts">
// Borç bilgisi — daire listesi ve raporlar.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

interface UnitDebtOverview {
  unitId: number
  blockName: string
  number: string
  ownerName: string | null
  openDebt: number
  penalty: number
  total: number
  oldestDueDate: string | null
}

const { data: overview } = await useFetch<UnitDebtOverview[]>('/api/admin/debts-overview', { default: () => [] })

const onlyWithDebt = ref(false)
const filtered = computed(() => (onlyWithDebt.value ? (overview.value ?? []).filter((u) => u.openDebt > 0) : overview.value ?? []))

// Aylık borç raporu ay seçiciye bağlı, diğer ikisi her zaman bugünün durumunu gösterir.
const selectedMonth = ref(new Date().toISOString().slice(0, 7))

function r2Url(format: 'pdf' | 'xlsx') {
  return `/api/admin/reports/r2?month=${selectedMonth.value}&format=${format}`
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Borç Bilgisi
      </h1>
      <p class="text-gray-500">
        Tüm dairelerin açık borç ve tazminat durumu.
      </p>
    </div>

    <UCheckbox v-model="onlyWithDebt" label="Yalnızca borçlular" />

    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <span>Raporlar</span>
          <UInput v-model="selectedMonth" type="month" size="sm" aria-label="R2 için ay" class="w-40" />
        </div>
      </template>
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p class="text-sm font-medium">Aylık Borç (R2)</p>
          <div class="flex gap-2">
            <UButton :to="r2Url('pdf')" target="_blank" size="xs" variant="outline" color="neutral">PDF</UButton>
            <UButton :to="r2Url('xlsx')" target="_blank" size="xs" variant="outline" color="neutral">Excel</UButton>
          </div>
        </div>
        <div class="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p class="text-sm font-medium">Tazminat Listesi (R3)</p>
          <div class="flex gap-2">
            <UButton to="/api/admin/reports/r3?format=pdf" target="_blank" size="xs" variant="outline" color="neutral">PDF</UButton>
            <UButton to="/api/admin/reports/r3?format=xlsx" target="_blank" size="xs" variant="outline" color="neutral">Excel</UButton>
          </div>
        </div>
        <div class="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
          <p class="text-sm font-medium">Birleşik Borç (R4)</p>
          <div class="flex gap-2">
            <UButton to="/api/admin/reports/r4?format=pdf" target="_blank" size="xs" variant="outline" color="neutral">PDF</UButton>
            <UButton to="/api/admin/reports/r4?format=xlsx" target="_blank" size="xs" variant="outline" color="neutral">Excel</UButton>
          </div>
        </div>
      </div>
    </UCard>

    <UCard>
      <div v-if="filtered.length" class="divide-y divide-gray-100 dark:divide-gray-800">
        <div v-for="row in filtered" :key="row.unitId" class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div>
            <p class="font-medium">
              {{ row.blockName }}-{{ row.number }}
              <span class="font-normal text-gray-500"> · {{ row.ownerName ?? '—' }}</span>
            </p>
            <p class="text-xs text-gray-500">
              En Eski Vade: {{ formatDate(row.oldestDueDate) }}
            </p>
          </div>
          <div class="flex items-center gap-6">
            <div class="text-right">
              <p class="text-xs text-gray-500">
                Açık Borç
              </p>
              <p class="font-semibold tabular-nums">
                {{ formatCurrency(row.openDebt) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500">
                Tazminat
              </p>
              <p class="font-semibold tabular-nums">
                {{ formatCurrency(row.penalty) }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500">
                Toplam
              </p>
              <p class="font-semibold tabular-nums">
                {{ formatCurrency(row.total) }}
              </p>
            </div>
            <UButton :to="`/admin/debts/${row.unitId}`" size="xs" variant="outline" color="neutral">
              Detay
            </UButton>
          </div>
        </div>
      </div>
      <p v-else class="py-8 text-center text-sm text-gray-500">
        Kayıt yok.
      </p>
    </UCard>
  </div>
</template>
