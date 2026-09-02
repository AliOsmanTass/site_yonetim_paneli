import { useDrizzle } from '../utils/drizzle'
import { seedAdminUser } from '../utils/seed'

// Elle tetiklenir, cron'a bağlı değil. İlk admin kullanıcısını oluşturur.
export default defineTask({
  meta: {
    name: 'seed-admin',
    description: 'İlk admin kullanıcısını oluşturur (yalnızca manuel tetiklenir)'
  },
  async run(event) {
    const payload = (event.payload ?? {}) as Partial<{ email: string; password: string; name: string; role: 'admin' | 'assistant' }>
    const email = payload.email ?? process.env.SEED_ADMIN_EMAIL
    const password = payload.password ?? process.env.SEED_ADMIN_PASSWORD
    const name = payload.name ?? process.env.SEED_ADMIN_NAME ?? 'Yönetici'
    const role = payload.role ?? 'admin'

    if (!email || !password) {
      throw new Error('email ve password gerekli (payload veya SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD env)')
    }

    const result = await seedAdminUser(useDrizzle(), { email, password, name, role })
    return { result: 'success', ...result }
  }
})
