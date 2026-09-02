<script setup lang="ts">
// Admin panel ortak kabuğu: üstte header, solda sabit gezinme menüsü.
// sayfalar(login hariç) definePageMeta({ layout: 'admin' }) ile kullanır.
const route = useRoute()

// Sol menü — header'daki menü ikonuna basınca açılır/kapanır.
const sidebarOpen = ref(true)

const sessionHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data: authSession } = await authClient.getSession({ fetchOptions: { headers: sessionHeaders } })

interface SiteSettings {
  managerUnitId: number | null
  assistantUnitId: number | null
}
interface UnitRow {
  id: number
  blockName: string
  number: string
}

const { data: settings } = await useFetch<SiteSettings | null>('/api/admin/site-settings')
const { data: units } = await useFetch<UnitRow[]>('/api/admin/units', { default: () => [] })

// Yönetici/yardımcı yönetici aynı zamanda bir dairenin maliki olabilir
// öyleyse baş harf menüsünde dairesi de gösterilir.
const residentUnitLabel = computed(() => {
  const role = authSession?.user?.role
  const unitId = role === 'admin' ? settings.value?.managerUnitId : role === 'assistant' ? settings.value?.assistantUnitId : null
  if (!unitId) return null
  const unit = units.value?.find((u) => u.id === unitId)
  return unit ? `${unit.blockName}-${unit.number}` : null
})

const userInitial = computed(() => (authSession?.user?.name?.trim().charAt(0) || '?').toUpperCase())

const userMenuItems = computed(() => [
  [{
    type: 'label' as const,
    label: authSession?.user?.name ?? '',
    description: residentUnitLabel.value ? `Daire: ${residentUnitLabel.value}` : undefined,
    avatar: { text: userInitial.value, color: 'primary' as const },
    ui: { itemDescription: 'font-normal' }
  }],
  [{ label: 'Çıkış Yap', icon: 'i-lucide-log-out', onSelect: logout, class: 'font-bold' }]
])

const navItems = [
  { label: 'Yönetici Özeti', to: '/admin', icon: 'i-lucide-layout-dashboard' },
  { label: 'Site Bilgisi', to: '/admin/site-info', icon: 'i-lucide-building-2' },
  { label: 'Borç Listesi', to: '/admin/debts', icon: 'i-lucide-list-checks' },
  { label: 'Kasa / Harcama', to: '/admin/cash-expenses', icon: 'i-lucide-wallet' },
  { label: 'Duyurular', to: '/admin/announcements', icon: 'i-lucide-megaphone' },
  { label: 'Kullanıcılar', to: '/admin/users', icon: 'i-lucide-users' }
]

function isActive(to: string) {
  return to === '/admin' ? route.path === '/admin' : route.path.startsWith(to)
}

async function logout() {
  await authClient.signOut()
  await navigateTo('/admin/login')
}
</script>

<template>
  <div class="min-h-screen bg-muted">
    <header class="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-default bg-default px-4 sm:px-6">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          square
          :aria-label="sidebarOpen ? 'Menüyü daralt' : 'Menüyü genişlet'"
          @click="() => { sidebarOpen = !sidebarOpen }"
        />
        <UIcon name="i-lucide-building-2" class="size-6 text-primary" />
        <span class="text-lg font-bold">Site Yönetim Paneli</span>
      </div>
      <div class="flex items-center gap-2">
        <UColorModeButton />
        <UDropdownMenu :items="userMenuItems" :content="{ align: 'end' }" size="xl" :ui="{ content: 'min-w-64' }">
          <button type="button" class="flex items-center rounded-md px-2 py-1.5 outline-none ring-primary transition-colors hover:bg-elevated focus-visible:ring-2">
            <UAvatar :text="userInitial" size="md" color="primary" />
          </button>
        </UDropdownMenu>
      </div>
    </header>

    <div class="flex">
      <aside
        class="sticky top-16 h-[calc(100vh-4rem)] shrink-0 overflow-hidden border-r border-default transition-[width,padding] duration-200"
        :class="sidebarOpen ? 'w-60 p-4' : 'w-16 p-2'"
      >
        <nav class="space-y-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            :title="!sidebarOpen ? item.label : undefined"
            class="flex items-center rounded-md text-sm font-medium whitespace-nowrap transition-colors"
            :class="[
              isActive(item.to) ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-elevated',
              sidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center py-2'
            ]"
          >
            <UIcon :name="item.icon" class="size-5 shrink-0" />
            <span v-if="sidebarOpen">{{ item.label }}</span>
          </NuxtLink>
        </nav>
      </aside>

      <main class="min-w-0 flex-1 p-4 sm:p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
