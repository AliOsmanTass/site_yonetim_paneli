<script setup lang="ts">
// Daire borç detayı — ekstre, borç ekleme, ödeme girişi.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

const route = useRoute()
const unitId = Number(route.params.unitId)

interface StatementRow {
  id: number
  date: string
  kind: 'debt' | 'payment'
  title: string
  documentNo: string
  account?: string
  debtTypeName?: string
  debtAmount: number | null
  penaltyAmount: number | null
  paymentAmount: number | null
  balance: number
  items?: { description: string; quantity: number; unitPrice: number; lineTotal: number }[]
}

interface StatementResponse {
  summary: { totalDebt: number; totalPenalty: number; totalPaid: number; balance: number }
  rows: StatementRow[]
}

interface DebtType {
  id: number
  name: string
  isSystem: boolean
}

interface UnitRow {
  id: number
  blockName: string
  number: string
}

const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })
// Yardımcı yönetici salt okunur — butonlar burada gizlenir 
const isReadOnly = computed(() => authSession?.user?.role === 'assistant')

const { data: statement, refresh: refreshStatement } = await useFetch<StatementResponse>(`/api/admin/units/${unitId}/statement`)
const { data: debtTypes, refresh: refreshDebtTypes } = await useFetch<DebtType[]>('/api/admin/debt-types', { default: () => [] })
const { data: units } = await useFetch<UnitRow[]>('/api/admin/units', { default: () => [] })

const unitLabel = computed(() => {
  const unit = units.value?.find((u) => u.id === unitId)
  return unit ? `${unit.blockName}-${unit.number}` : `#${unitId}`
})

function formatCurrency(value: number) {
  return `${value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

// --- Borç Ekle / Düzenle / Sil ---
// Düzenleme ve silme yalnızca henüz ödeme almamış borçlarda mümkün.
interface DebtItemForm {
  description: string
  quantity: number
  unitPrice: number
}

interface DebtDetail {
  id: number
  debtTypeId: number
  title: string
  amount: number
  dueDate: string
  penaltyStartDate: string | null
  items: DebtItemForm[]
}

const isDebtModalOpen = ref(false)
const debtModalMode = ref<'create' | 'edit'>('create')
const editingDebtId = ref<number | null>(null)
const debtError = ref<string | null>(null)
const savingDebt = ref(false)
const isNewType = ref(false)
const statementError = ref<string | null>(null)

function emptyItem(): DebtItemForm {
  return { description: '', quantity: 1, unitPrice: 0 }
}

const debtForm = reactive({
  debtTypeId: undefined as number | undefined,
  newTypeName: '',
  title: '',
  items: [emptyItem()] as DebtItemForm[],
  installmentTotal: 1,
  penaltyApplicable: true,
  dueDate: new Date().toISOString().slice(0, 10)
})

const itemsTotal = computed(() => debtForm.items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice || 0), 0))

function addItemRow() {
  debtForm.items.push(emptyItem())
}

function removeItemRow(index: number) {
  if (debtForm.items.length > 1) debtForm.items.splice(index, 1)
}

function openCreateDebtModal() {
  debtModalMode.value = 'create'
  editingDebtId.value = null
  debtError.value = null
  isNewType.value = false
  Object.assign(debtForm, {
    debtTypeId: debtTypes.value?.[0]?.id ?? undefined,
    newTypeName: '',
    title: '',
    items: [emptyItem()],
    installmentTotal: 1,
    penaltyApplicable: true,
    dueDate: new Date().toISOString().slice(0, 10)
  })
  isDebtModalOpen.value = true
}

async function openEditDebtModal(row: StatementRow) {
  debtModalMode.value = 'edit'
  editingDebtId.value = row.id
  debtError.value = null
  isNewType.value = false
  const debt = await $fetch<DebtDetail>(`/api/admin/debts/${row.id}`)
  Object.assign(debtForm, {
    debtTypeId: debt.debtTypeId,
    newTypeName: '',
    title: debt.title,
    items: debt.items.length ? debt.items.map((i) => ({ ...i })) : [emptyItem()],
    installmentTotal: 1,
    penaltyApplicable: !!debt.penaltyStartDate,
    dueDate: debt.dueDate
  })
  isDebtModalOpen.value = true
}

async function deleteDebt(row: StatementRow) {
  if (!confirm(`"${row.title}" silinsin mi?`)) return
  statementError.value = null
  try {
    await $fetch(`/api/admin/debts/${row.id}`, { method: 'DELETE' })
    await refreshStatement()
  } catch (e) {
    statementError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Silinemedi.'
  }
}

async function deletePayment(row: StatementRow) {
  // Yalnızca o dairenin en son ödemesi silinebilir
  if (!confirm('Bu ödeme silinsin mi? Mahsup edilen borçlar yeniden açık duruma dönecek.')) return
  statementError.value = null
  try {
    await $fetch(`/api/admin/payments/${row.id}`, { method: 'DELETE' })
    await refreshStatement()
  } catch (e) {
    statementError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Silinemedi.'
  }
}

async function submitDebt() {
  const items = debtForm.items.filter((i) => i.description.trim())
  if (!debtForm.title.trim() || !items.length || items.some((i) => !i.quantity || i.quantity <= 0 || i.unitPrice < 0)) {
    debtError.value = 'Başlık ve en az bir geçerli kalem (adet, birim fiyat) gerekli.'
    return
  }
  savingDebt.value = true
  debtError.value = null
  try {
    let debtTypeId = debtForm.debtTypeId
    if (isNewType.value) {
      if (!debtForm.newTypeName.trim()) {
        debtError.value = 'Yeni tür adı gerekli.'
        savingDebt.value = false
        return
      }
      const newType = await $fetch<DebtType>('/api/admin/debt-types', { method: 'POST', body: { name: debtForm.newTypeName.trim() } })
      debtTypeId = newType.id
      await refreshDebtTypes()
    }
    if (!debtTypeId) {
      debtError.value = 'Borç türü seçin.'
      savingDebt.value = false
      return
    }

    if (debtModalMode.value === 'create') {
      await $fetch('/api/admin/debts', {
        method: 'POST',
        body: {
          debtTypeId,
          title: debtForm.title,
          items,
          unitId,
          installmentTotal: debtForm.installmentTotal,
          penaltyApplicable: debtForm.penaltyApplicable,
          dueDate: debtForm.dueDate
        }
      })
    } else {
      await $fetch(`/api/admin/debts/${editingDebtId.value}`, {
        method: 'PATCH',
        body: {
          debtTypeId,
          title: debtForm.title,
          items,
          penaltyApplicable: debtForm.penaltyApplicable,
          dueDate: debtForm.dueDate
        }
      })
    }
    isDebtModalOpen.value = false
    await refreshStatement()
  } catch (e) {
    debtError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    savingDebt.value = false
  }
}

// --- Ödeme Gir ---
const isPaymentModalOpen = ref(false)
const paymentError = ref<string | null>(null)
const previewing = ref(false)
const confirming = ref(false)
const preview = ref<{ allocations: { debtId: number; debtTitle: string; principalAmount: number; penaltyAmount: number }[]; unallocatedAmount: number } | null>(null)

const PAYMENT_METHODS = [
  { label: 'Nakit', value: 'nakit' as const },
  { label: 'Havale / EFT', value: 'havale' as const }
]

// Türkiye'deki başlıca bankalar 
const TURKISH_BANKS = [
  'Ziraat Bankası', 'VakıfBank', 'Halkbank', 'Türkiye İş Bankası', 'Garanti BBVA',
  'Yapı Kredi', 'Akbank', 'QNB Finansbank', 'DenizBank', 'TEB',
  'ING Bank', 'HSBC', 'Şekerbank', 'Fibabanka', 'Odeabank',
  'Alternatif Bank', 'Anadolubank', 'Burgan Bank', 'ICBC Turkey Bank', 'Citibank',
  'Kuveyt Türk Katılım Bankası', 'Türkiye Finans Katılım Bankası', 'Albaraka Türk',
  'Vakıf Katılım', 'Ziraat Katılım', 'Emlak Katılım Bankası', 'Diğer'
]

const paymentForm = reactive({
  paidAt: new Date().toISOString().slice(0, 10),
  amount: 0,
  method: 'nakit' as 'nakit' | 'havale',
  bankName: undefined as string | undefined,
  otherBankName: '',
  reference: '',
  note: ''
})

const resolvedAccount = computed(() => {
  if (paymentForm.method === 'nakit') return 'Nakit'
  if (paymentForm.bankName === 'Diğer') return paymentForm.otherBankName.trim()
  return paymentForm.bankName ?? ''
})

function openPaymentModal() {
  paymentError.value = null
  preview.value = null
  Object.assign(paymentForm, {
    paidAt: new Date().toISOString().slice(0, 10),
    amount: 0,
    method: 'nakit',
    bankName: undefined,
    otherBankName: '',
    reference: '',
    note: ''
  })
  isPaymentModalOpen.value = true
}

function buildPaymentBody(confirm: boolean) {
  return {
    paidAt: paymentForm.paidAt,
    amount: paymentForm.amount,
    account: resolvedAccount.value,
    reference: paymentForm.reference,
    note: paymentForm.note,
    confirm
  }
}

async function previewPayment() {
  if (!paymentForm.amount || paymentForm.amount <= 0 || !resolvedAccount.value.trim()) {
    paymentError.value = paymentForm.method === 'havale' ? 'Tutar ve banka seçimi gerekli.' : 'Tutar gerekli.'
    return
  }
  previewing.value = true
  paymentError.value = null
  try {
    preview.value = await $fetch<{ allocations: { debtId: number; debtTitle: string; principalAmount: number; penaltyAmount: number }[]; unallocatedAmount: number }>(`/api/admin/units/${unitId}/payments`, {
      method: 'POST',
      body: buildPaymentBody(false)
    })
  } catch (e) {
    paymentError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Önizleme alınamadı.'
  } finally {
    previewing.value = false
  }
}

async function confirmPayment() {
  confirming.value = true
  paymentError.value = null
  try {
    await $fetch<unknown>(`/api/admin/units/${unitId}/payments`, {
      method: 'POST',
      body: buildPaymentBody(true)
    })
    isPaymentModalOpen.value = false
    await refreshStatement()
  } catch (e) {
    paymentError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    confirming.value = false
  }
  function debtStatusColor(status : 'open' | 'paid' | 'partial') {
    
    }
}

</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        {{ unitLabel }} — Borç Detayı
      </h1>
      <p class="text-gray-500">
        Ekstre, borç ekleme, ödeme girişi.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <UCard>
        <p class="text-sm text-gray-500">
          Toplam Borç
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(statement?.summary.totalDebt ?? 0) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Açık Tazminat
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(statement?.summary.totalPenalty ?? 0) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Ödenen
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(statement?.summary.totalPaid ?? 0) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-gray-500">
          Kalan Borç
        </p>
        <p class="text-xl font-bold">
          {{ formatCurrency(statement?.summary.balance ?? 0) }}
        </p>
      </UCard>
    </div>

    <div class="flex flex-wrap gap-2">
      <UButton v-if="!isReadOnly" :disabled="!debtTypes?.length" @click="openCreateDebtModal">
        + Borç Ekle
      </UButton>
      <UButton v-if="!isReadOnly" color="neutral" variant="outline" @click="openPaymentModal">
        + Ödeme Gir
      </UButton>
      <UButton :to="`/api/admin/units/${unitId}/statement-export?format=pdf`" target="_blank" color="neutral" variant="outline" icon="i-lucide-file-text">
        Ekstre PDF
      </UButton>
      <UButton :to="`/api/admin/units/${unitId}/statement-export?format=xlsx`" target="_blank" color="neutral" variant="outline" icon="i-lucide-file-spreadsheet">
        Ekstre Excel
      </UButton>
    </div>

    <UCard>
      <template #header>
        Ekstre
      </template>

      <UAlert v-if="statementError" color="error" variant="subtle" :title="statementError" class="mb-4" />

      <div v-if="statement?.rows?.length" class="divide-y divide-gray-100 dark:divide-gray-800">
        <div v-for="(row, index) in statement.rows" :key="index" class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
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
                {{ formatDate(row.date) }} · Evr.No: {{ row.documentNo }}<span v-if="row.account"> · {{ row.account }}</span>
              </p>
              <UBadge v-if="row.debtTypeName === 'Demirbaş'" color="warning" variant="subtle" size="sm" class="mt-1">
                Demirbaş
              </UBadge>
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
            <div v-if="row.kind === 'debt' && !isReadOnly" class="mt-1 flex justify-end gap-1">
              <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral" @click="openEditDebtModal(row)" />
              <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="deleteDebt(row)" />
            </div>
            <div v-else-if="row.kind === 'payment' && !isReadOnly" class="mt-1 flex justify-end">
              <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="deletePayment(row)" />
            </div>
          </div>
        </div>
      </div>
      <p v-else class="py-8 text-center text-sm text-gray-500">
        Kayıt yok.
      </p>
    </UCard>

    <UModal v-model:open="isDebtModalOpen" :title="debtModalMode === 'create' ? 'Borç Ekle' : 'Borç Düzenle'">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="debtError" color="error" variant="subtle" :title="debtError" />

          <UCheckbox v-model="isNewType" label="Yeni tür tanımla" />
          <UFormField v-if="!isNewType" label="Borç Türü" required>
            <USelectMenu v-model="debtForm.debtTypeId" :items="debtTypes ?? []" value-key="id" label-key="name" class="w-full" />
          </UFormField>
          <UFormField v-else label="Yeni Tür Adı" required>
            <UInput v-model="debtForm.newTypeName" class="w-full" />
          </UFormField>

          <UFormField label="Borç Başlığı" required>
            <UInput v-model="debtForm.title" class="w-full" />
          </UFormField>

          <div class="space-y-2">
            <p class="text-sm font-medium">
              Kalemler
            </p>
            <div v-for="(item, i) in debtForm.items" :key="i" class="flex items-end gap-2">
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
                :disabled="debtForm.items.length === 1"
                @click="removeItemRow(i)"
              />
            </div>
            <UButton size="sm" variant="outline" icon="i-lucide-plus" @click="addItemRow">
              Kalem Ekle
            </UButton>
            <p class="text-right text-sm text-gray-500">
              Toplam: {{ formatCurrency(itemsTotal) }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField v-if="debtModalMode === 'create'" label="Taksit Sayısı">
              <UInput v-model.number="debtForm.installmentTotal" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField label="Son Ödeme Tarihi" required>
              <UInput v-model="debtForm.dueDate" type="date" class="w-full" />
            </UFormField>
          </div>
          <UCheckbox v-model="debtForm.penaltyApplicable" label="Gecikirse tazminat işlesin" />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isDebtModalOpen = false }">
          Vazgeç
        </UButton>
        <UButton :loading="savingDebt" @click="submitDebt">
          Kaydet
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="isPaymentModalOpen" title="Ödeme Gir">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="paymentError" color="error" variant="subtle" :title="paymentError" />

          <UFormField label="Tahsilat Tarihi" required hint="Paranın fiilen alındığı gün">
            <UInput v-model="paymentForm.paidAt" type="date" class="w-full" />
          </UFormField>
          <UFormField label="Tutar (₺)" required>
            <UInput v-model.number="paymentForm.amount" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Ödeme Şekli" required>
            <URadioGroup
              v-model="paymentForm.method"
              orientation="horizontal"
              :items="PAYMENT_METHODS"
              @update:model-value="paymentForm.bankName = undefined"
            />
          </UFormField>
          <UFormField v-if="paymentForm.method === 'havale'" label="Banka" required>
            <USelectMenu v-model="paymentForm.bankName" :items="TURKISH_BANKS" placeholder="Banka seçin" class="w-full" />
          </UFormField>
          <UFormField v-if="paymentForm.method === 'havale' && paymentForm.bankName === 'Diğer'" label="Banka Adı" required>
            <UInput v-model="paymentForm.otherBankName" placeholder="Banka adını yazın" class="w-full" />
          </UFormField>
          <UFormField :label="paymentForm.method === 'nakit' ? 'Makbuz No' : 'Dekont No'">
            <UInput v-model="paymentForm.reference" class="w-full" />
          </UFormField>

          <div v-if="preview" class="rounded border border-gray-200 p-3 text-sm dark:border-gray-800">
            <p class="mb-2 font-medium">
              Mahsup Önizlemesi
            </p>
            <ul class="space-y-1">
              <li v-for="a in preview.allocations" :key="a.debtId">
                {{ formatCurrency(a.principalAmount) }} → {{ a.debtTitle }}
                <span v-if="a.penaltyAmount > 0" class="text-gray-500">(+{{ formatCurrency(a.penaltyAmount) }} tazminat sabitlenir)</span>
              </li>
            </ul>
            <p v-if="preview.unallocatedAmount > 0" class="mt-2 text-gray-500">
              Açık borç kalmadı — {{ formatCurrency(preview.unallocatedAmount) }} fazla ödeme (henüz saklama kararı yok).
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isPaymentModalOpen = false }">
          Vazgeç
        </UButton>
        <UButton variant="outline" :loading="previewing" @click="previewPayment">
          Önizle
        </UButton>
        <UButton :disabled="!preview" :loading="confirming" @click="confirmPayment">
          Onayla
        </UButton>
      </template>
    </UModal>
  </div>
</template>
