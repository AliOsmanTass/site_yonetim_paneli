<script setup lang="ts">
// Borç sorgusu — giriş gerektirmez, isimler maskeli gösterilir.
definePageMeta({ alias: '/borc-detay' })

interface Block {
  id: number
  name: string
}

interface StatementRow {
  id: number
  date: string
  kind: 'debt' | 'payment'
  title: string
  documentNo: string
  account?: string
  debtAmount: number | null
  penaltyAmount: number | null
  paymentAmount: number | null
  balance: number
  items?: { description: string; quantity: number; unitPrice: number; lineTotal: number }[]
}

interface DebtLookupResponse {
  unitLabel: string
  ownerInitials: string | null
  summary: { totalDebt: number; totalPenalty: number; totalPaid: number; balance: number }
  rows: StatementRow[]
}

const { data: blocks } = await useFetch<Block[]>('/api/public/blocks', { default: () => [] })

const blockOptions = computed(() => (blocks.value ?? []).map((b) => b.name))
const selectedBlock = ref<string | undefined>(undefined)
const unitNumber = ref('')
const searching = ref(false)
const searchError = ref<string | null>(null)
const result = ref<DebtLookupResponse | null>(null)

function formatCurrency(value: number) {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function exportUrl(format: 'pdf' | 'xlsx') {
  const params = new URLSearchParams({ block: selectedBlock.value ?? '', number: unitNumber.value.trim(), format })
  return `/api/public/debt-lookup-export?${params.toString()}`
}

async function search() {
  if (!selectedBlock.value || !unitNumber.value.trim()) {
    searchError.value = 'Blok ve daire no gerekli.'
    return
  }
  searching.value = true
  searchError.value = null
  result.value = null
  try {
    result.value = await $fetch<DebtLookupResponse>('/api/public/debt-lookup', {
      query: { block: selectedBlock.value, number: unitNumber.value.trim() }
    })
  } catch (e) {
    searchError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Sorgulanamadı.'
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Borç Sorgusu
        </h1>
        <p class="text-gray-500">
          Blok ve daire numaranızla borç durumunuzu görüntüleyin.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UColorModeButton />
        <UButton to="/" color="neutral" variant="outline">
          ← Anasayfa
        </UButton>
      </div>
    </div>

    <UCard>
      <div class="flex flex-wrap items-end gap-3">
        <UFormField label="Blok" class="w-32">
          <USelectMenu v-model="selectedBlock" :items="blockOptions" placeholder="Seçin" class="w-full" />
        </UFormField>
        <UFormField label="Daire No" class="w-32">
          <UInput v-model="unitNumber" @keyup.enter="search" />
        </UFormField>
        <UButton :loading="searching" @click="search">
          Sorgula
        </UButton>
      </div>
      <UAlert v-if="searchError" color="error" variant="subtle" :title="searchError" class="mt-4" />
    </UCard>

    <template v-if="result">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-semibold">
          {{ result.unitLabel }}<span v-if="result.ownerInitials"> — {{ result.ownerInitials }}</span>
        </h2>
        <div class="flex gap-2">
          <UButton :to="exportUrl('pdf')" target="_blank" color="neutral" variant="outline" icon="i-lucide-file-text">
            PDF İndir
          </UButton>
          <UButton :to="exportUrl('xlsx')" target="_blank" color="neutral" variant="outline" icon="i-lucide-file-spreadsheet">
            Excel İndir
          </UButton>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <UCard>
          <p class="text-sm text-gray-500">
            Toplam Borç
          </p>
          <p class="text-xl font-bold">
            {{ formatCurrency(result.summary.totalDebt) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-gray-500">
            Açık Tazminat
          </p>
          <p class="text-xl font-bold">
            {{ formatCurrency(result.summary.totalPenalty) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-gray-500">
            Toplam Ödenen
          </p>
          <p class="text-xl font-bold">
            {{ formatCurrency(result.summary.totalPaid) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-sm text-gray-500">
            Güncel Bakiye
          </p>
          <p class="text-xl font-bold">
            {{ formatCurrency(result.summary.balance) }}
          </p>
        </UCard>
      </div>

      <UCard>
        <template #header>
          Ekstre
        </template>
        <div v-if="result.rows.length" class="divide-y divide-gray-100 dark:divide-gray-800">
          <div v-for="(row, index) in result.rows" :key="index" class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
            <div class="flex items-start gap-3">
              <div
                class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
                :class="row.kind === 'debt'
                  ? 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400'
                  : 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-400'"
              >
                <UIcon :name="row.kind === 'debt' ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-left'" class="size-4" />
              </div>
              <div>
                <p class="font-medium">
                  {{ row.title }}
                </p>
                <p class="text-xs text-gray-500">
                  {{ formatDate(row.date) }} · Evr.No: {{ row.documentNo }}
                </p>
                <div v-if="row.items?.length" class="mt-2 space-y-1 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-900">
                  <div v-for="(item, i) in row.items" :key="i" class="flex justify-between gap-4">
                    <span>{{ item.description }}</span>
                    <span>{{ formatCurrency(item.lineTotal) }}</span>
                  </div>
                </div>
                <UBadge v-if="row.penaltyAmount" :color="row.kind === 'payment' ? 'warning' : 'neutral'" variant="subtle" size="sm" class="mt-2">
                  +{{ formatCurrency(row.penaltyAmount) }} {{ row.kind === 'payment' ? 'tazminat sabitlendi' : 'açık tazminat' }}
                </UBadge>
              </div>
            </div>
            <div class="shrink-0 text-right">
              <p
                class="font-semibold tabular-nums"
                :class="row.kind === 'debt' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'"
              >
                {{ row.kind === 'debt' ? '+' : '−' }}{{ formatCurrency((row.debtAmount ?? row.paymentAmount) ?? 0) }}
              </p>
              <p class="text-xs text-gray-500">
                Kalan Borç {{ formatCurrency(row.balance) }}
              </p>
            </div>
          </div>
        </div>
        <p v-else class="py-8 text-center text-sm text-gray-500">
          Kayıt yok.
        </p>
      </UCard>
    </template>
  </div>
</template>
