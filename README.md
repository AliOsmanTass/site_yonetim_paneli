# Site Yönetim Paneli

mosstar.com.tr için geliştirilen apartman/site yönetim uygulaması. Aidat tahakkuku, borç/ödeme takibi, sakin borç sorgulama, gider yönetimi ve raporlama (PDF/Excel) içerir.

## Stack

- [Nuxt 4](https://nuxt.com) + [NuxtHub](https://hub.nuxt.com) (Cloudflare Workers'a edge deploy)
- [Drizzle ORM](https://orm.drizzle.team) + Cloudflare D1
- [Better Auth](https://better-auth.com) — admin oturum yönetimi
- [Nuxt UI](https://ui.nuxt.com)
- PDF üretimi: `pdf-lib`, Excel export: `xlsx`
- E-posta bildirimleri: [Resend](https://resend.com) (opsiyonel)

## Kurulum

```bash
npm install
cp .env.example .env   # değerleri doldur
```

## Geliştirme

```bash
npm run dev             # http://localhost:3000
npm run test            # vitest
npm run db:generate     # drizzle migration üret
npm run db:studio       # drizzle studio
```

## Build / Deploy

```bash
npm run build
```

NuxtHub üzerinden Cloudflare Workers'a deploy edilir.
