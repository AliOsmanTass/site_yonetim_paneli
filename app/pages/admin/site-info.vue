<script setup lang="ts">
// Site bilgisi — site kimliği, aidat, tazminat oranı, bloklar, huzur hakkı.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

interface SiteSettings {
  id: number
  siteName: string
  siteDescription: string | null
  monthlyFee: number
  dueDayStart: number
  dueDayEnd: number
  latePenaltyMonthlyRate: number
  managerStipend: number | null
  managerUnitId: number | null
  managerStipendOffsetAidat: boolean
  assistantStipend: number | null
  assistantUnitId: number | null
}

interface Block {
  id: number
  name: string
}

interface UnitRow {
  id: number
  blockName: string
  number: string
}


const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })
// Yardımcı yönetici salt okunur — asıl kısıt sunucu tarafında.
const isReadOnly = computed(() => authSession?.user?.role === 'assistant')

const { data: settings } = await useFetch<SiteSettings | null>('/api/admin/site-settings')
const { data: blocks, refresh: refreshBlocks } = await useFetch<Block[]>('/api/admin/blocks', { default: () => [] })
const { data: units } = await useFetch<UnitRow[]>('/api/admin/units', { default: () => [] })

const unitOptions = computed(() => (units.value ?? []).map((u) => ({ id: u.id, label: `${u.blockName}-${u.number}` })))

const form = reactive({
  siteName: settings.value?.siteName ?? '',
  siteDescription: settings.value?.siteDescription ?? '',
  monthlyFee: settings.value?.monthlyFee ?? 0,
  dueDayStart: settings.value?.dueDayStart ?? 1,
  dueDayEnd: settings.value?.dueDayEnd ?? 5,
  latePenaltyMonthlyRate: settings.value?.latePenaltyMonthlyRate ?? 0.05,
  managerStipend: settings.value?.managerStipend ?? undefined,
  managerUnitId: settings.value?.managerUnitId ?? undefined,
  managerStipendOffsetAidat: settings.value?.managerStipendOffsetAidat ?? true,
  assistantStipend: settings.value?.assistantStipend ?? undefined,
  assistantUnitId: settings.value?.assistantUnitId ?? undefined
})

const managerIsOwner = ref(!!form.managerUnitId)
const assistantIsOwner = ref(!!form.assistantUnitId)

const saving = ref(false)
const saveMessage = ref<string | null>(null)
const saveError = ref<string | null>(null)

async function save() {
  saving.value = true
  saveMessage.value = null
  saveError.value = null
  try {
    const updated = await $fetch('/api/admin/site-settings', {
      method: 'PUT',
      body: {
        ...form,
        managerUnitId: managerIsOwner.value ? form.managerUnitId : null,
        assistantUnitId: assistantIsOwner.value ? form.assistantUnitId : null
      }
    })
    settings.value = updated
    saveMessage.value = 'Kaydedildi.'
  } catch (e) {
    saveError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    saving.value = false
  }
}

const newBlockName = ref('')
const blockError = ref<string | null>(null)

async function addBlock() {
  if (!newBlockName.value.trim()) return
  blockError.value = null
  try {
    await $fetch('/api/admin/blocks', { method: 'POST', body: { name: newBlockName.value.trim() } })
    newBlockName.value = ''
    await refreshBlocks()
  } catch (e) {
    blockError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Blok eklenemedi.'
  }
}

async function removeBlock(id: number) {
  blockError.value = null
  try {
    await $fetch(`/api/admin/blocks/${id}`, { method: 'DELETE' })
    await refreshBlocks()
  } catch (e) {
    blockError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Blok silinemedi.'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Site Bilgisi
      </h1>
      <p class="text-gray-500">
        Site kimliği, aidat, tazminat oranı, bloklar ve huzur hakkı.
      </p>
    </div>

    <UAlert v-if="saveMessage" color="success" variant="subtle" :title="saveMessage" />
    <UAlert v-if="saveError" color="error" variant="subtle" :title="saveError" />

    <UCard>
      <template #header>
        Site Kimliği
      </template>
      <div class="space-y-4">
        <UFormField label="Site adı" required>
          <UInput v-model="form.siteName" class="w-full" />
        </UFormField>
        <UFormField label="Tanıtım metni">
          <UTextarea v-model="form.siteDescription" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        Aidat
      </template>
      <div class="grid grid-cols-3 gap-4">
        <UFormField label="Aylık tutar (₺)" required>
          <UInput v-model.number="form.monthlyFee" type="number" min="0" class="w-full" />
        </UFormField>
        <UFormField label="Ödeme aralığı başlangıcı (gün)" required>
          <UInput v-model.number="form.dueDayStart" type="number" min="1" max="31" class="w-full" />
        </UFormField>
        <UFormField label="Ödeme aralığı bitişi (gün)" required>
          <UInput v-model.number="form.dueDayEnd" type="number" min="1" max="31" class="w-full" />
        </UFormField>
      </div>
    </UCard>

    <UCard>
      <template #header>
        Tazminat Oranı
      </template>
      <UFormField label="Aylık oran" hint="Ondalık girilir — ör. 0.05 = %5">
        <UInput v-model.number="form.latePenaltyMonthlyRate" type="number" step="0.01" min="0" class="w-full" />
      </UFormField>
    </UCard>

    <UCard>
      <template #header>
        Bloklar
      </template>
      <div class="space-y-3">
        <ul class="space-y-2">
          <li v-for="block in blocks" :key="block.id" class="flex items-center justify-between rounded border border-gray-200 px-3 py-2 dark:border-gray-800">
            {{ block.name }}
            <UButton v-if="!isReadOnly" color="error" variant="ghost" size="xs" @click="removeBlock(block.id)">
              Sil
            </UButton>
          </li>
          <li v-if="!blocks?.length" class="text-sm text-gray-500">
            Henüz blok eklenmedi.
          </li>
        </ul>
        <UAlert v-if="blockError" color="error" variant="subtle" :title="blockError" />
        <div v-if="!isReadOnly" class="flex gap-2">
          <UInput v-model="newBlockName" placeholder="ör. A" class="flex-1" @keyup.enter="addBlock" />
          <UButton @click="addBlock">
            Blok Ekle
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        Huzur Hakkı
      </template>
      <div class="space-y-6">
        <div class="space-y-2">
          <UFormField label="Yönetici aylık tutar (₺)">
            <UInput v-model.number="form.managerStipend" type="number" min="0" class="w-full" />
          </UFormField>
          <UCheckbox v-model="managerIsOwner" label="Yönetici sitede daire sahibi" />
          <UFormField v-if="managerIsOwner" label="Daire">
            <USelectMenu
              v-model="form.managerUnitId"
              :items="unitOptions"
              value-key="id"
              label-key="label"
              placeholder="Henüz daire eklenmedi"
              class="w-full"
            />
          </UFormField>
          <UCheckbox
            v-if="managerIsOwner"
            v-model="form.managerStipendOffsetAidat"
            label="Huzur hakkı aidattan düşülsün"
            help="İşaretliyse her ay aidat tahakkuk ettiğinde, yöneticinin huzur hakkı aynı miktarda ödeme olarak otomatik girilip borcundan düşülür. İşaretli değilse huzur hakkı sadece kasa gideri olarak kaydedilir."
          />
        </div>
        <div class="space-y-2">
          <UFormField label="Yardımcı yönetici aylık tutar (₺)">
            <UInput v-model.number="form.assistantStipend" type="number" min="0" class="w-full" />
          </UFormField>
          <UCheckbox v-model="assistantIsOwner" label="Yardımcı yönetici sitede daire sahibi" />
          <UFormField v-if="assistantIsOwner" label="Daire">
            <USelectMenu
              v-model="form.assistantUnitId"
              :items="unitOptions"
              value-key="id"
              label-key="label"
              placeholder="Henüz daire eklenmedi"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
    </UCard>

    <UButton v-if="!isReadOnly" block :loading="saving" @click="save">
      Kaydet
    </UButton>
  </div>
</template>
