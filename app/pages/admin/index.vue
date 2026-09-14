<script setup lang="ts">
// Yönetici özeti — gösterge kartları + daire listesi ve düzenleme.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

interface DashboardSummary {
  unitCount: number
  unpaidUnitCount: number
  unpaidDuesCount: number
  totalDuesDebt: number
}
interface UnitRow {
  id: number
  blockId: number
  blockName: string
  number: string
  isVirtual: boolean
  isClosed: boolean
  malikFirstName: string | null
  malikLastName: string | null
  malikPhone: string | null
  malikEmail: string | null
  kiraciFirstName: string | null
  kiraciLastName: string | null
  kiraciPhone: string | null
  kiraciEmail: string | null
}

interface Block {
  id: number
  name: string
}

const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })
// Yardımcı yönetici salt okunur — yazma butonları burada gizlenir
const isReadOnly = computed(() => authSession?.user?.role === 'assistant')

const { data: summary } = await useFetch<DashboardSummary>('/api/admin/dashboard-summary')
const { data: units, refresh: refreshUnits } = await useFetch<UnitRow[]>('/api/admin/units', { default: () => [] })
const { data: blocks } = await useFetch<Block[]>('/api/admin/blocks', { default: () => [] })

// --- Arama + istemci tarafı sayfalama ---
const search = ref('')
const page = ref(1)
const pageSize = 10
// Sanal daireler (malik değişikliğinde eski borcu taşıyan gölge kayıtlar)
// normal listede görünmez, sadece istenirse açılır.
const showVirtual = ref(false)
const virtualCount = computed(() => (units.value ?? []).filter((u) => u.isVirtual).length)

const filteredUnits = computed(() => {
  const term = search.value.trim().toLowerCase()
  const base = (units.value ?? []).filter((u) => showVirtual.value || !u.isVirtual)
  if (!term) return base
  return base.filter((u) => {
    const malikName = `${u.malikFirstName ?? ''} ${u.malikLastName ?? ''}`.toLowerCase()
    const kiraciName = `${u.kiraciFirstName ?? ''} ${u.kiraciLastName ?? ''}`.toLowerCase()
    return u.blockName.toLowerCase().includes(term) || u.number.toLowerCase().includes(term) || malikName.includes(term) || kiraciName.includes(term)
  })
})

const pagedUnits = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredUnits.value.slice(start, start + pageSize)
})

watch(search, () => { page.value = 1 })

// --- Daire ekle/düzenle modalı ---
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const modalError = ref<string | null>(null)
const savingUnit = ref(false)

const unitForm = reactive({
  blockId: undefined as number | undefined,
  number: '',
  malikFirstName: '',
  malikLastName: '',
  malikPhone: '',
  malikEmail: '',
  kiraciFirstName: '',
  kiraciLastName: '',
  kiraciPhone: '',
  kiraciEmail: ''
})

function resetUnitForm() {
  Object.assign(unitForm, {
    blockId: blocks.value?.[0]?.id ?? undefined,
    number: '',
    malikFirstName: '',
    malikLastName: '',
    malikPhone: '',
    malikEmail: '',
    kiraciFirstName: '',
    kiraciLastName: '',
    kiraciPhone: '',
    kiraciEmail: ''
  })
}

function openCreateModal() {
  modalMode.value = 'create'
  editingId.value = null
  modalError.value = null
  resetUnitForm()
  isModalOpen.value = true
}

function openEditModal(unit: UnitRow) {
  modalMode.value = 'edit'
  editingId.value = unit.id
  modalError.value = null
  Object.assign(unitForm, {
    blockId: unit.blockId,
    number: unit.number,
    malikFirstName: unit.malikFirstName ?? '',
    malikLastName: unit.malikLastName ?? '',
    malikPhone: unit.malikPhone ?? '',
    malikEmail: unit.malikEmail ?? '',
    kiraciFirstName: unit.kiraciFirstName ?? '',
    kiraciLastName: unit.kiraciLastName ?? '',
    kiraciPhone: unit.kiraciPhone ?? '',
    kiraciEmail: unit.kiraciEmail ?? ''
  })
  isModalOpen.value = true
}

async function submitUnit() {
  if (!unitForm.blockId || !unitForm.number.trim()) {
    modalError.value = 'Blok ve daire no gerekli.'
    return
  }
  if (!unitForm.malikFirstName.trim() || !unitForm.malikLastName.trim()) {
    modalError.value = 'Malik adı ve soyadı gerekli.'
    return
  }
  savingUnit.value = true
  modalError.value = null
  try {
    const body = {
      blockId: unitForm.blockId,
      number: unitForm.number.trim(),
      malik: { firstName: unitForm.malikFirstName, lastName: unitForm.malikLastName, phone: unitForm.malikPhone, email: unitForm.malikEmail },
      kiraci: unitForm.kiraciFirstName.trim() ? { firstName: unitForm.kiraciFirstName, lastName: unitForm.kiraciLastName, phone: unitForm.kiraciPhone, email: unitForm.kiraciEmail } : undefined
    }
    if (modalMode.value === 'create') {
      await $fetch('/api/admin/units', { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/units/${editingId.value}`, { method: 'PATCH', body })
    }
    isModalOpen.value = false
    await refreshUnits()
  } catch (e) {
    modalError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    savingUnit.value = false
  }
}

// --- Malik Değiştir modalı ---
const isTransferModalOpen = ref(false)
const transferError = ref<string | null>(null)
const transferSuccessMessage = ref<string | null>(null)
const transferringUnit = ref<UnitRow | null>(null)
const savingTransfer = ref(false)

const transferForm = reactive({
  malikFirstName: '',
  malikLastName: '',
  malikPhone: '',
  malikEmail: '',
  kiraciFirstName: '',
  kiraciLastName: '',
  kiraciPhone: '',
  kiraciEmail: ''
})

function openTransferModal(unit: UnitRow) {
  transferringUnit.value = unit
  transferError.value = null
  Object.assign(transferForm, {
    malikFirstName: '',
    malikLastName: '',
    malikPhone: '',
    malikEmail: '',
    kiraciFirstName: '',
    kiraciLastName: '',
    kiraciPhone: '',
    kiraciEmail: ''
  })
  isTransferModalOpen.value = true
}

async function submitTransfer() {
  if (!transferForm.malikFirstName.trim() || !transferForm.malikLastName.trim()) {
    transferError.value = 'Yeni malik adı ve soyadı gerekli.'
    return
  }
  savingTransfer.value = true
  transferError.value = null
  try {
    const result = await $fetch<{ transferred: boolean; virtualUnitNumber: string | null }>('/api/admin/units/transfer-owner', {
      method: 'POST',
      body: {
        unitId: transferringUnit.value?.id,
        newMalik: { firstName: transferForm.malikFirstName, lastName: transferForm.malikLastName, phone: transferForm.malikPhone, email: transferForm.malikEmail },
        newKiraci: transferForm.kiraciFirstName.trim()
          ? { firstName: transferForm.kiraciFirstName, lastName: transferForm.kiraciLastName, phone: transferForm.kiraciPhone, email: transferForm.kiraciEmail }
          : undefined
      }
    })
    isTransferModalOpen.value = false
    await refreshUnits()
    transferSuccessMessage.value = result.transferred
      ? `Eski borç "${result.virtualUnitNumber}" numaralı sanal daireye taşındı.`
      : 'Malik güncellendi.'
  } catch (e) {
    transferError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    savingTransfer.value = false
  }
}

const listError = ref<string | null>(null)

async function deleteUnit(unit: UnitRow) {
  if (!confirm(`${unit.blockName}-${unit.number} silinsin mi?`)) return
  listError.value = null
  try {
    await $fetch(`/api/admin/units/${unit.id}`, { method: 'DELETE' })
    await refreshUnits()
  } catch (e) {
    listError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Silinemedi.'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Yönetici Özeti
      </h1>
      <p class="text-gray-500">
        Daireler, aidat ve borç durumuna genel bakış.
      </p>
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

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span>Daireler</span>
          <UButton v-if="!isReadOnly" :disabled="!blocks?.length" @click="openCreateModal">
            + Daire Ekle
          </UButton>
        </div>

      </template>

      <p v-if="!blocks?.length" class="mb-4 text-sm text-gray-500">
        Daire eklemeden önce
        <NuxtLink to="/admin/site-info" class="text-primary underline">
          Site Bilgisi
        </NuxtLink>
        sayfasından en az bir blok oluşturun.
      </p>

      <UAlert v-if="listError" color="error" variant="subtle" :title="listError" class="mb-4" />
      <UAlert v-if="transferSuccessMessage" color="success" variant="subtle" :title="transferSuccessMessage" class="mb-4" />

      <UInput v-model="search" placeholder="Blok / no / ad ile ara" class="mb-4 w-full max-w-sm" />

      <table class="w-full text-left text-sm">
        <thead>
          <tr class="border-b border-gray-200 dark:border-gray-800">
            <th class="py-2">
              Blok
            </th>
            <th class="py-2">
              No
            </th>
            <th class="py-2">
              Yetkili
            </th>
            <th class="py-2">
              Telefon
            </th>
            <th class="py-2">
              E-posta
            </th>
            <th class="py-2" />
            </tr>
        </thead>
        <tbody>
          <tr
            v-for="unit in pagedUnits"
            :key="unit.id"
            class="border-b border-gray-100 dark:border-gray-800"
            :class="unit.isVirtual ? 'bg-gray-50 dark:bg-gray-900/50' : ''"
          >
            <td class="py-2">
              {{ unit.blockName }}
            </td>
            <td class="py-2">
              {{ unit.number }}
              <UBadge v-if="unit.isVirtual" color="neutral" variant="subtle" size="sm" class="ml-1">
                Sanal
              </UBadge>
              <UBadge v-if="unit.isClosed" color="error" variant="subtle" size="sm" class="ml-1">
                Kapalı
              </UBadge>
            </td>
            <td class="py-2">
              <div>{{ unit.malikFirstName ? `${unit.malikFirstName} ${unit.malikLastName}` : '—' }}</div>
              <div v-if="unit.kiraciFirstName" class="text-xs text-gray-500">
                Kiracı: {{ unit.kiraciFirstName }} {{ unit.kiraciLastName }}
              </div>
            </td>
            <td class="py-2">
              {{ unit.malikPhone || '—' }}
            </td>
            <td class="py-2">
              {{ unit.malikEmail || '—' }}
            </td>
            <td class="py-2 text-right">
              <div class="flex flex-wrap justify-end gap-1">
                <UButton size="xs" variant="soft" :to="`/admin/debts/${unit.id}`">
                  Detay
                </UButton>
                <template v-if="!unit.isVirtual && !isReadOnly">
                  <UButton size="xs" variant="soft" @click="openEditModal(unit)">
                    Düzenle
                  </UButton>
                  <UButton size="xs" variant="soft" color="warning" @click="openTransferModal(unit)">
                    Malik Değiştir
                  </UButton>
                  <UButton size="xs" variant="soft" color="error" @click="deleteUnit(unit)">
                    Sil
                  </UButton>
                </template>
              </div>
            </td>
          </tr>
          <tr v-if="!pagedUnits.length">
            <td colspan="6" class="py-6 text-center text-sm text-gray-500">
              Kayıt yok.
            </td>
          </tr>
        </tbody>
      </table>

      <div class="mt-4 flex items-center justify-between">
        <UCheckbox v-if="virtualCount > 0" v-model="showVirtual" :label="`Sanal daireleri göster (${virtualCount})`" />
        <div v-else />
        <UPagination v-model:page="page" :total="filteredUnits.length" :items-per-page="pageSize" />
      </div>
    </UCard>

    <UModal v-model:open="isModalOpen" :title="modalMode === 'create' ? 'Daire Ekle' : 'Daire Düzenle'">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="modalError" color="error" variant="subtle" :title="modalError" />
          <UFormField label="Blok" required>
            <USelectMenu v-model="unitForm.blockId" :items="blocks ?? []" value-key="id" label-key="name" class="w-full" />
          </UFormField>
          <UFormField label="Daire no" required>
            <UInput v-model="unitForm.number" class="w-full" />
          </UFormField>

          <p class="text-sm font-medium">
            Malik
          </p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Ad" required>
              <UInput v-model="unitForm.malikFirstName" class="w-full" />
            </UFormField>
            <UFormField label="Soyad" required>
              <UInput v-model="unitForm.malikLastName" class="w-full" />
            </UFormField>
            <UFormField label="Telefon">
              <UInput v-model="unitForm.malikPhone" class="w-full" />
            </UFormField>
            <UFormField label="E-posta">
              <UInput v-model="unitForm.malikEmail" class="w-full" />
            </UFormField>
          </div>

          <p class="text-sm font-medium">
            Kiracı (opsiyonel)
          </p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Ad">
              <UInput v-model="unitForm.kiraciFirstName" class="w-full" />
            </UFormField>
            <UFormField label="Soyad">
              <UInput v-model="unitForm.kiraciLastName" class="w-full" />
            </UFormField>
            <UFormField label="Telefon">
              <UInput v-model="unitForm.kiraciPhone" class="w-full" />
            </UFormField>
            <UFormField label="E-posta">
              <UInput v-model="unitForm.kiraciEmail" class="w-full" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isModalOpen = false }">
          Vazgeç
        </UButton>
        <UButton :loading="savingUnit" @click="submitUnit">
          Kaydet
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="isTransferModalOpen" title="Malik Değiştir">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            {{ transferringUnit?.blockName }}-{{ transferringUnit?.number }} için yeni malik bilgisi girin. Açık borç
            varsa eskisi bu dairede görünmeyecek, ayrı bir sanal daireye taşınıp takip edilecek.
          </p>
          <UAlert v-if="transferError" color="error" variant="subtle" :title="transferError" />

          <p class="text-sm font-medium">
            Yeni Malik
          </p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Ad" required>
              <UInput v-model="transferForm.malikFirstName" class="w-full" />
            </UFormField>
            <UFormField label="Soyad" required>
              <UInput v-model="transferForm.malikLastName" class="w-full" />
            </UFormField>
            <UFormField label="Telefon">
              <UInput v-model="transferForm.malikPhone" class="w-full" />
            </UFormField>
            <UFormField label="E-posta">
              <UInput v-model="transferForm.malikEmail" class="w-full" />
            </UFormField>
          </div>

          <p class="text-sm font-medium">
            Yeni Kiracı (opsiyonel)
          </p>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Ad">
              <UInput v-model="transferForm.kiraciFirstName" class="w-full" />
            </UFormField>
            <UFormField label="Soyad">
              <UInput v-model="transferForm.kiraciLastName" class="w-full" />
            </UFormField>
            <UFormField label="Telefon">
              <UInput v-model="transferForm.kiraciPhone" class="w-full" />
            </UFormField>
            <UFormField label="E-posta">
              <UInput v-model="transferForm.kiraciEmail" class="w-full" />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isTransferModalOpen = false }">
          Vazgeç
        </UButton>
        <UButton :loading="savingTransfer" @click="submitTransfer">
          Değiştir
        </UButton>
      </template>
    </UModal>
  </div>
</template>
