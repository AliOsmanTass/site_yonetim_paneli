<script setup lang="ts">
// Yönetici girişi. Bu sayfa admin-auth middleware'ini kullanmaz 

const errorMessage = ref<string | null>(null)
const pending = ref(false)

const fields = [
  { name: 'email', type: 'email' as const, label: 'E-posta', placeholder: 'ornek@site.com', required: true },
  { name: 'password', type: 'password' as const, label: 'Şifre', required: true }
]

async function onSubmit(event: { data: { email: string; password: string } }) {
  errorMessage.value = null
  pending.value = true
  try {
    const { error } = await authClient.signIn.email({
      email: event.data.email,
      password: event.data.password
    })
    if (error) {
      errorMessage.value = 'E-posta veya şifre hatalı.'
      return
    }
    await navigateTo('/admin')
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center p-4">
    <UColorModeButton class="absolute top-4 right-4" />
    <UAuthForm
      :fields="fields"
      title="Yönetici Girişi"
      description="Site Yönetim Uygulaması — Yönetici Paneli"
      icon="i-lucide-lock"
      :submit="{ label: 'Giriş Yap' }"
      :loading="pending"
      class="w-full max-w-sm"
      @submit="onSubmit"
    >
      <template v-if="errorMessage" #validation>
        <UAlert color="error" variant="subtle" :title="errorMessage" />
      </template>
    </UAuthForm>
  </div>
</template>
