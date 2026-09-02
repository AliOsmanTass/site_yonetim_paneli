import { createAuthClient } from 'better-auth/vue'
import { inferAdditionalFields } from 'better-auth/client/plugins'

// Login sayfası ve admin middleware'i bunu kullanır.
//
// inferAdditionalFields: server/utils/auth.ts'te user'a eklenen `role` ve
// `disabled` alanlarını istemci tarafına da tanıtır — bu olmadan
// `authSession.user.role` gibi erişimler çalışma zamanında doğru değeri
// verir ama TypeScript "böyle bir alan yok" der (schema burada, server'daki
// additionalFields ile birebir aynı olmalı).
export const authClient = createAuthClient({
  baseURL: import.meta.server ? (process.env.BETTER_AUTH_URL || 'http://localhost:3000') : undefined,
  plugins: [
    inferAdditionalFields({
      user: {
        role: { type: 'string' },
        disabled: { type: 'boolean' }
      }
    })
  ]
})
