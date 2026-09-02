<script setup lang="ts">
// Kullanıcı yönetimi — sadece yönetici hesapları, site sakinlerinin hesabı yok.
definePageMeta({ middleware: 'admin-auth', layout: 'admin' })

interface UserRow {
  id: string
  name: string
  email: string
  role: 'admin' | 'assistant'
  disabled: boolean
  lastLoginAt: string | null
}

const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })
const isReadOnly = computed(() => authSession?.user?.role === 'assistant')
const currentUserId = computed(() => authSession?.user?.id)

const { data: users, refresh: refreshUsers } = await useFetch<UserRow[]>('/api/admin/users', { default: () => [] })

function formatDateTime(iso: string | null) {
  if (!iso) return 'Hiç giriş yapmadı'
  const d = new Date(iso)
  return d.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

const ROLE_LABELS = { admin: 'Yönetici', assistant: 'Yardımcı Yönetici' } as const

function generateRandomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!?%'
  let result = ''
  for (let i = 0; i < 12; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

// --- Kullanıcı Ekle ---
const isCreateModalOpen = ref(false)
const createSaving = ref(false)
const createError = ref<string | null>(null)
const createForm = reactive({ name: '', email: '', password: '', role: 'assistant' as 'admin' | 'assistant' })

function openCreateModal() {
  createError.value = null
  Object.assign(createForm, { name: '', email: '', password: '', role: 'assistant' })
  isCreateModalOpen.value = true
}

async function submitCreate() {
  if (!createForm.name.trim() || !createForm.email.trim() || createForm.password.length < 8) {
    createError.value = 'Ad, e-posta ve en az 8 karakterlik şifre gerekli.'
    return
  }
  createSaving.value = true
  createError.value = null
  try {
    await $fetch('/api/admin/users', { method: 'POST', body: createForm })
    isCreateModalOpen.value = false
    await refreshUsers()
  } catch (e) {
    createError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Kaydedilemedi.'
  } finally {
    createSaving.value = false
  }
}

// --- Şifre Sıfırla ---
const isResetModalOpen = ref(false)
const resetSaving = ref(false)
const resetError = ref<string | null>(null)
const resetDone = ref<string | null>(null)
const resetTarget = ref<UserRow | null>(null)
const resetPasswordValue = ref('')

function openResetModal(user: UserRow) {
  resetTarget.value = user
  resetError.value = null
  resetDone.value = null
  resetPasswordValue.value = generateRandomPassword()
  isResetModalOpen.value = true
}

async function submitReset() {
  if (!resetTarget.value || resetPasswordValue.value.length < 8) {
    resetError.value = 'En az 8 karakterlik şifre gerekli.'
    return
  }
  resetSaving.value = true
  resetError.value = null
  try {
    await $fetch('/api/admin/users-reset-password', { method: 'POST', body: { userId: resetTarget.value.id, password: resetPasswordValue.value } })
    resetDone.value = resetPasswordValue.value
  } catch (e) {
    resetError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Sıfırlanamadı.'
  } finally {
    resetSaving.value = false
  }
}

// --- Pasifleştir / Aktifleştir ---
const toggleError = ref<string | null>(null)

async function toggleDisabled(user: UserRow) {
  const nextDisabled = !user.disabled
  if (nextDisabled && !confirm(`${user.name} pasifleştirilsin mi? Tekrar giriş yapamaz.`)) return
  toggleError.value = null
  try {
    await $fetch('/api/admin/users-toggle-disabled', { method: 'POST', body: { userId: user.id, disabled: nextDisabled } })
    await refreshUsers()
  } catch (e) {
    toggleError.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage || 'İşlem yapılamadı.'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">
        Kullanıcı Yönetimi
      </h1>
      <p class="text-gray-500">
        Yönetici hesapları (site sakinlerinin hesabı yoktur).
      </p>
    </div>

    <UAlert v-if="toggleError" color="error" variant="subtle" :title="toggleError" />

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span>Kullanıcı Listesi</span>
          <UButton v-if="!isReadOnly" @click="openCreateModal">
            + Kullanıcı Ekle
          </UButton>
        </div>
      </template>
      <div v-if="users?.length" class="divide-y divide-gray-100 dark:divide-gray-800">
        <div
          v-for="user in users"
          :key="user.id"
          class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          :class="{ 'opacity-50': user.disabled }"
        >
          <div>
            <p class="font-medium">
              {{ user.name }}
              <span v-if="user.id === currentUserId" class="text-xs text-gray-500">(siz)</span>
            </p>
            <p class="text-xs text-gray-500">
              {{ user.email }} · Son Giriş: {{ formatDateTime(user.lastLoginAt) }}
            </p>
            <div class="mt-1 flex gap-1">
              <UBadge :color="user.role === 'admin' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                {{ ROLE_LABELS[user.role] }}
              </UBadge>
              <UBadge v-if="user.disabled" color="error" variant="subtle" size="sm">
                Pasif
              </UBadge>
            </div>
          </div>
          <div v-if="!isReadOnly" class="flex shrink-0 gap-2">
            <UButton size="xs" variant="outline" color="neutral" @click="openResetModal(user)">
              Şifre Sıfırla
            </UButton>
            <UButton
              v-if="user.id !== currentUserId"
              size="xs"
              variant="outline"
              :color="user.disabled ? 'success' : 'error'"
              @click="toggleDisabled(user)"
            >
              {{ user.disabled ? 'Aktifleştir' : 'Pasifleştir' }}
            </UButton>
          </div>
        </div>
      </div>
      <p v-else class="py-8 text-center text-sm text-gray-500">
        Kayıt yok.
      </p>
    </UCard>

    <UModal v-model:open="isCreateModalOpen" title="Kullanıcı Ekle">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="createError" color="error" variant="subtle" :title="createError" />
          <UFormField label="Ad Soyad" required>
            <UInput v-model="createForm.name" class="w-full" />
          </UFormField>
          <UFormField label="E-posta" required>
            <UInput v-model="createForm.email" type="email" class="w-full" />
          </UFormField>
          <UFormField label="Rol" required>
            <USelectMenu
              v-model="createForm.role"
              :items="[{ label: 'Yönetici', value: 'admin' }, { label: 'Yardımcı Yönetici', value: 'assistant' }]"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Şifre" required>
            <UInput v-model="createForm.password" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isCreateModalOpen = false }">
          Vazgeç
        </UButton>
        <UButton :loading="createSaving" @click="submitCreate">
          Kaydet
        </UButton>
      </template>
    </UModal>

    <UModal v-model:open="isResetModalOpen" title="Şifre Sıfırla">
      <template #body>
        <div class="space-y-4">
          <UAlert v-if="resetError" color="error" variant="subtle" :title="resetError" />
          <template v-if="!resetDone">
            <p class="text-sm text-gray-500">
              {{ resetTarget?.name }} için yeni şifre:
            </p>
            <div class="flex gap-2">
              <UInput v-model="resetPasswordValue" class="flex-1" />
              <UButton variant="outline" color="neutral" @click="() => { resetPasswordValue = generateRandomPassword() }">
                Yeniden Oluştur
              </UButton>
            </div>
          </template>
          <UAlert
            v-else
            color="success"
            variant="subtle"
            title="Şifre değiştirildi"
            :description="`Yeni şifre: ${resetDone} — bu bir daha gösterilmeyecek, kullanıcıya iletin.`"
          />
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="() => { isResetModalOpen = false }">
          {{ resetDone ? 'Kapat' : 'Vazgeç' }}
        </UButton>
        <UButton v-if="!resetDone" :loading="resetSaving" @click="submitReset">
          Sıfırla
        </UButton>
      </template>
    </UModal>
  </div>
</template>
