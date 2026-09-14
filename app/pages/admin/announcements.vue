<script setup lang="ts">
// Duyurular. Durum sırayla taslak → aktif → pasif → arşiv olarak ilerler.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

type AnnouncementStatus = 'draft' | 'active' | 'passive' | 'archived'

interface Announcement {
  id: number
  title: string
  body: string
  status: AnnouncementStatus
  publishedAt: string
  expiresAt: string | null
  expenseId: number | null
}

const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })
const isReadOnly = computed(() => authSession?.user?.role === 'assistant')

const { data: announcements, refresh: refreshAnnouncements } = await useFetch<Announcement[]>('/api/admin/announcements', { default: () => [] })

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const STATUS_LABELS: Record<AnnouncementStatus, string> = { draft: 'Taslak', active: 'Aktif', passive: 'Pasif', archived: 'Arşiv' }
const STATUS_COLORS: Record<AnnouncementStatus, 'neutral' | 'success' | 'warning'> = { draft: 'neutral', active: 'success', passive: 'warning', archived: 'neutral' }
const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as AnnouncementStatus[]).map((value) => ({ label: STATUS_LABELS[value], value }))

// --- Tür filtresi: Tümü / Duyuru (manuel) / Demirbaş (otomatik oluşan) ---
type TypeFilter = 'all' | 'manual' | 'fixture'
const typeFilter = ref<TypeFilter>('all')
const TYPE_FILTER_OPTIONS: { label: string, value: TypeFilter }[] = [
  { label: 'Tümü', value: 'all' },
  { label: 'Duyuru', value: 'manual' },
  { label: 'Demirbaş', value: 'fixture' }
]

const filteredAnnouncements = computed(() => {
  const list = announcements.value ?? []
  if (typeFilter.value === 'manual') return list.filter((a) => !a.expenseId)
  if (typeFilter.value === 'fixture') return list.filter((a) => !!a.expenseId)
  return list
})

// --- Duyuru Ekle / Düzenle ---
const isModalOpen = ref(false)
const modalMode = ref<'create' | 'edit'>('create')
const editingId = ref<number | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

const form = reactive({
  title: '',
  body: '',
  publishedAt: new Date().toISOString().slice(0, 10),
  expiresAt: '',
  status: 'draft' as AnnouncementStatus
})

function openCreateModal() {
  modalMode.value = 'create'
  editingId.value = null
  formError.value = null
  Object.assign(form, { title: '', body: '', publishedAt: new Date().toISOString().slice(0, 10), expiresAt: '', status: 'draft' })
  isModalOpen.value = true
}

function openEditModal(a: Announcement) {
  modalMode.value = 'edit'
  editingId.value = a.id
  formError.value = null
  Object.assign(form, { title: a.title, body: a.body, publishedAt: a.publishedAt, expiresAt: a.expiresAt ?? '', status: a.status })
  isModalOpen.value = true
}

async function submit() {
  if (!form.title.trim() || !form.body.trim() || !form.publishedAt) {
    formError.value = 'Başlık, içerik ve yayın tarihi gerekli.'
    return
  }
  saving.value = true
  formError.value = null
  try {
    const payload = {
      title: form.title,
      body: form.body,
      publishedAt: form.publishedAt,
      expiresAt: form.expiresAt || null,
      status: form.status
    }
    if (modalMode.value === 'create') {
      await $fetch('/api/admin/announcements', { method: 'POST', body: payload })
    } else {
      await $fetch(`/api/admin/announcements/${editingId.value}`, { method: 'PATCH', body: payload })
    }
    isModalOpen.value = false
    await refreshAnnouncements()
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
        Duyurular
      </h1>
      <p class="text-gray-500">
        Duyuru yönetimi ve durum takibi.
      </p>
    </div>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span>Duyuru Listesi</span>
          <UButton v-if="!isReadOnly" @click="openCreateModal">
            + Duyuru Ekle
          </UButton>
        </div>
      </template>
      <URadioGroup
        v-model="typeFilter"
        orientation="horizontal"
        :items="TYPE_FILTER_OPTIONS"
        class="mb-4"
      />

      <div v-if="filteredAnnouncements.length" class="divide-y divide-gray-100 dark:divide-gray-800">
        <div v-for="a in filteredAnnouncements" :key="a.id" class="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
          <div>
            <p class="font-medium">
              {{ a.title }}
            </p>
            <p class="text-xs text-gray-500">
              Yayın: {{ formatDate(a.publishedAt) }}<span v-if="a.expiresAt"> · Askı Bitişi: {{ formatDate(a.expiresAt) }}</span>
            </p>
            <div class="mt-1 flex gap-1">
              <UBadge :color="STATUS_COLORS[a.status]" variant="subtle" size="sm">
                {{ STATUS_LABELS[a.status] }}
              </UBadge>
              <UBadge :color="a.expenseId ? 'warning' : 'neutral'" variant="outline" size="sm">
                {{ a.expenseId ? 'Demirbaş' : 'Manuel' }}
              </UBadge>
            </div>
          </div>
          <UButton v-if="!isReadOnly" size="xs" variant="outline" color="neutral" @click="openEditModal(a)">
            Düzenle
          </UButton>
        </div>
      </div>
      <p v-else-if="announcements?.length" class="py-8 text-center text-sm text-gray-500">
        Bu filtreye uygun duyuru yok.
      </p>
      <p v-else class="py-8 text-center text-sm text-gray-500">
        Henüz duyuru yok.
      </p>
    </UCard>

    <UModal v-model:open="isModalOpen" :title="modalMode === 'create' ? 'Duyuru Ekle' : 'Duyuru Düzenle'">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="formError" color="error" variant="subtle" :title="formError" />

          <UFormField label="Başlık" required>
            <UInput v-model="form.title" class="w-full" />
          </UFormField>
          <UFormField label="İçerik" required>
            <UTextarea v-model="form.body" class="w-full" :rows="4" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Yayın Tarihi" required>
              <UInput v-model="form.publishedAt" type="date" class="w-full" />
            </UFormField>
            <UFormField label="Askı Bitiş Tarihi">
              <UInput v-model="form.expiresAt" type="date" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Durum" required>
            <USelectMenu v-model="form.status" :items="STATUS_OPTIONS" value-key="value" label-key="label" class="w-full" />
          </UFormField>
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
