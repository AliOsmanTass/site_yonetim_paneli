<script setup lang="ts">
// Kasa/Harcama — kasa defteri ve standart/demirbaş harcama ayrımı.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

interface CashSummary {
  cashBalance: number
  monthIncome: number
  monthExpense: number
  fixtureFund: number
}

interface Expense {
  id: number
  type: 'standard' | 'fixture' | 'stipend'
  title: string
  expenseDate: string
  totalAmount: number
  perUnitAmount: number | null
  announcementId: number | null
}

interface DashboardSummary {
  unitCount: number
}
// Cookie'yi elle ileten tek seferlik getSession() kullanıyoruz 
const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })
const isReadOnly = computed(() => authSession?.user?.role === 'assistant')

const { data: summary, refresh: refreshSummary } = await useFetch<CashSummary>('/api/admin/cash-summary')
const { data: expenses, refresh: refreshExpenses } = await useFetch<Expense[]>('/api/admin/expenses', { default: () => [] })
const { data: dashboard } = await useFetch<DashboardSummary>('/api/admin/dashboard-summary')

const listError = ref<string | null>(null)

async function deleteExpense(expense: Expense) {
  if (!confirm(`"${expense.title}" harcaması silinsin mi?`)) return
  listError.value = null
  try {
    await $fetch(`/api/admin/expenses/${expense.id}`, { method: 'DELETE' })
    await Promise.all([refreshSummary(), refreshExpenses()])
  } catch (e) {
    listError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Silinemedi.'
  }
}

const selectedMonth = ref(new Date().toISOString().slice(0, 7))
function r5Url(format: 'pdf' | 'xlsx') {
  return `/api/admin/reports/r5?month=${selectedMonth.value}&format=${format}`
}

function formatCurrency(value: number) {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function typeLabel(type: Expense['type']) {
  return type === 'fixture' ? 'Demirbaş' : type === 'standard' ? 'Standart' : 'Huzur Hakkı'
}

function typeColor(type: Expense['type']) {
  return type === 'fixture' ? 'warning' : type === 'standard' ? 'neutral' : 'info'
}

// --- Harcama Ekle ---
interface ItemForm {
  description: string
  quantity: number
  unitPrice: number
}

function emptyItem(): ItemForm {
  return { description: '', quantity: 1, unitPrice: 0 }
}

const isModalOpen = ref(false)
const saving = ref(false)
const formError = ref<string | null>(null)

const form = reactive({
  type: 'standard' as 'standard' | 'fixture',
  title: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date().toISOString().slice(0, 10),
  penaltyApplicable: true,
  items: [emptyItem()] as ItemForm[]
})

watch([() => form.penaltyApplicable, () => form.expenseDate], ([applicable, expenseDate]) => {
  if (!applicable) form.dueDate = expenseDate
})

const itemsTotal = computed(() => form.items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice || 0), 0))
const perUnitPreview = computed(() => {
  const count = dashboard.value?.unitCount ?? 0
  return count > 0 ? itemsTotal.value / count : 0
})

function addItemRow() {
  form.items.push(emptyItem())
}

function removeItemRow(index: number) {
  if (form.items.length > 1) form.items.splice(index, 1)
}

function openModal() {
  formError.value = null
  Object.assign(form, {
    type: 'standard',
    title: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    penaltyApplicable: true,
    items: [emptyItem()]
  })
  isModalOpen.value = true
}

async function submit() {
  const items = form.items.filter((i) => i.description.trim())
  if (!form.title.trim() || !items.length || items.some((i) => !i.quantity || i.quantity <= 0 || i.unitPrice < 0)) {
    formError.value = 'Başlık ve en az bir geçerli kalem (adet, birim fiyat) gerekli.'
    return
  }
  saving.value = true
  formError.value = null
  try {
    await $fetch('/api/admin/expenses', {
      method: 'POST',
      body: {
        type: form.type,
        title: form.title,
        expenseDate: form.expenseDate,
        dueDate: form.type === 'fixture' ? form.dueDate : undefined,
        penaltyApplicable: form.penaltyApplicable,
        items
      }
    })
    isModalOpen.value = false
    await Promise.all([refreshSummary(), refreshExpenses()])
  } catch (e) {
    formError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Kasa / Harcama
      </h1>
      <p class="text-gray-500">
        Kasa defteri, standart/demirbaş harcama girişi.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <UCard>
        <p class="text-sm text-gray-500">
          Kasa Bakiyesi
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(summary?.cashBalance ?? 0) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Bu Ay Gelir
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(summary?.monthIncome ?? 0) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Bu Ay Gider
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(summary?.monthExpense ?? 0) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Bu Ay Demirbaş
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(summary?.fixtureFund ?? 0) }}
        </p>
      </UCard>
    </div>

    <div class="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p class="mr-2 text-sm font-medium">
        Aylık Kasa Raporu (R5)
      </p>
      <UFormField class="w-40">
        <UInput v-model="selectedMonth" type="month" aria-label="Ay" class="w-full" />
      </UFormField>
      <UButton :to="r5Url('pdf')" target="_blank" size="sm" variant="outline" color="neutral">
        PDF
      </UButton>
      <UButton :to="r5Url('xlsx')" target="_blank" size="sm" variant="outline" color="neutral">
        Excel
      </UButton>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span>Harcama Listesi</span>
          <UButton v-if="!isReadOnly" @click="openModal">
            + Harcama Ekle
          </UButton>
        </div>
      </template>
      <UAlert v-if="listError" color="error" variant="subtle" :title="listError" class="mb-4" />
      <div v-if="expenses?.length" class="divide-y divide-gray-100 dark:divide-gray-800">
        <div v-for="expense in expenses" :key="expense.id" class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div>
            <p class="font-medium">
              {{ expense.title }}
            </p>
            <p class="text-xs text-gray-500">
              {{ formatDate(expense.expenseDate) }}
            </p>
            <UBadge :color="typeColor(expense.type)" variant="subtle" size="sm" class="mt-1">
              {{ typeLabel(expense.type) }}
            </UBadge>
            <UBadge v-if="expense.announcementId" color="success" variant="subtle" size="sm" class="mt-1 ml-1">
              Duyuru oluşturuldu
            </UBadge>
          </div>
          <div class="flex shrink-0 items-start gap-3">
            <div class="text-right">
              <p class="font-semibold tabular-nums">
                {{ formatCurrency(expense.totalAmount) }}
              </p>
              <p v-if="expense.perUnitAmount" class="text-xs text-gray-500">
                Daire payı ~{{ formatCurrency(expense.perUnitAmount) }}
              </p>
            </div>
            <UButton
              v-if="!isReadOnly"
              size="xs"
              variant="soft"
              color="error"
              @click="deleteExpense(expense)"
            >
              Sil
            </UButton>
          </div>
        </div>
      </div>
      <p v-else class="py-8 text-center text-sm text-gray-500">
        Kayıt yok.
      </p>
    </UCard>

    <UModal v-model:open="isModalOpen" title="Harcama Ekle">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="formError" color="error" variant="subtle" :title="formError" />

          <URadioGroup
            v-model="form.type"
            orientation="horizontal"
            :items="[{ label: 'Standart', value: 'standard' }, { label: 'Demirbaş', value: 'fixture' }]"
          />
          <UAlert
            v-if="form.type === 'fixture'"
            color="warning"
            variant="subtle"
            title="Bu harcama gerçek dairelere eşit bölünüp borç olarak yazılacak ve otomatik bir duyuru oluşturacak."
          />

          <UFormField label="Başlık" required>
            <UInput v-model="form.title" class="w-full" />
          </UFormField>

          <UCheckbox v-if="form.type === 'fixture'" v-model="form.penaltyApplicable" label="Gecikirse tazminat işlesin" />

          <div :class="form.type === 'fixture' && form.penaltyApplicable ? 'grid grid-cols-2 gap-4' : ''">
            <UFormField label="Harcama Tarihi" required>
              <UInput v-model="form.expenseDate" type="date" class="w-full" />
            </UFormField>
            <UFormField v-if="form.type === 'fixture' && form.penaltyApplicable" label="Daire Borcu Son Ödeme Tarihi" required>
              <UInput v-model="form.dueDate" type="date" class="w-full" />
            </UFormField>
          </div>

          <div class="space-y-2">
            <p class="text-sm font-medium">
              Kalemler
            </p>
            <div v-for="(item, i) in form.items" :key="i" class="flex items-end gap-2">
              <UFormField label="Ürün / Hizmet" class="flex-1">
                <UInput v-model="item.description" class="w-full" />
              </UFormField>
              <UFormField label="Adet" class="w-20">
                <UInput v-model.number="item.quantity" type="number" min="0" class="w-full" />
              </UFormField>
              <UFormField label="Birim Fiyat (₺)" class="w-28">
                <UInput v-model.number="item.unitPrice" type="number" min="0" class="w-full" />
              </UFormField>
              <UButton
                icon="i-lucide-trash-2"
                size="sm"
                variant="ghost"
                color="error"
                :disabled="form.items.length === 1"
                @click="removeItemRow(i)"
              />
            </div>
            <UButton size="sm" variant="outline" icon="i-lucide-plus" @click="addItemRow">
              Kalem Ekle
            </UButton>
            <p class="text-right text-sm text-gray-500">
              Toplam: {{ formatCurrency(itemsTotal) }}
            </p>
            <p v-if="form.type === 'fixture'" class="text-right text-sm text-gray-500">
              {{ dashboard?.unitCount ?? 0 }} gerçek daireye eşit bölünecek — kişi başı ~{{ formatCurrency(perUnitPreview) }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isModalOpen = false }">
          Vazgeç
        </UButton>
        <UButton :loading="saving" @click="submit">
          Kaydet
        </UButton>
      </template>
    </UModal>
  </div>
</template>
