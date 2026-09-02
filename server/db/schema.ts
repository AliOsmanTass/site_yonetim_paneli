import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core'

// Better Auth'un kendi tabloları. Sadece admin/yardımcı girişi için var,
// site sakinlerinin hesabı yok.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['admin', 'assistant'] }).notNull().default('admin'),
  disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
})

// Site ayarları. Aidat tutarı ya da ödeme günleri değişse bile eski borçlar
// aynı kalır, değişiklik sadece bundan sonraki tahakkuklara yansır.
export const siteSettings = sqliteTable('site_settings', {
  id: integer('id').primaryKey(),
  siteName: text('site_name').notNull(),
  siteDescription: text('site_description'),
  monthlyFee: real('monthly_fee').notNull(),
  dueDayStart: integer('due_day_start').notNull(),
  dueDayEnd: integer('due_day_end').notNull(),
  latePenaltyMonthlyRate: real('late_penalty_monthly_rate').notNull().default(0.05),
  managerStipend: real('manager_stipend'),
  assistantStipend: real('assistant_stipend'),
  managerUnitId: integer('manager_unit_id').references(() => units.id),
  assistantUnitId: integer('assistant_unit_id').references(() => units.id)
})

// Oran/ayar değişikliklerinin tarihçesi — geçmişe dönük hesaplamalar
// o günkü geçerli değeri kullanır.
export const settingHistory = sqliteTable('setting_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  effectiveFrom: text('effective_from').notNull(),
  changedBy: text('changed_by').references(() => user.id)
})

// Bloklar (A, B gibi).
export const blocks = sqliteTable('blocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
})

// Daireler. Borcu ya da ödemesi olan bir daire silinemez.
//
// isVirtual: malik değişince eski açık borcu taşımak için açılan gölge daire.
// Normal listede görünmez, sadece borç takibi için var.
export const units = sqliteTable('units', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  blockId: integer('block_id').notNull().references(() => blocks.id),
  number: text('number').notNull(),
  isVirtual: integer('is_virtual', { mode: 'boolean' }).notNull().default(false)
}, (t) => [
  uniqueIndex('units_block_number_unique').on(t.blockId, t.number)
])

// Daire sahibi/kiracı bilgisi. Açık sayfalarda gizlilik için sadece baş
// harfler gösterilir. Her dairenin bir maliki olmak zorunda, kiracı isteğe
// bağlı — bu kural veritabanında değil, units API'sinde uygulanıyor.
export const unitContacts = sqliteTable('unit_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  unitId: integer('unit_id').notNull().references(() => units.id, { onDelete: 'cascade' }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  phone: text('phone'),
  email: text('email'),
  role: text('role', { enum: ['malik', 'kiraci'] }).notNull().default('malik')
})

// Borç türleri (aidat, demirbaş, otopark vb.)
export const debtTypes = sqliteTable('debt_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false)
})

// Borç kayıtları — ekstrede görünen her borç satırı.
// unit_id+debt_type_id+period+installment_no birlikte unique, aynı borç iki
// kere tahakkuk edemez.
export const debts = sqliteTable('debts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  unitId: integer('unit_id').notNull().references(() => units.id),
  debtTypeId: integer('debt_type_id').notNull().references(() => debtTypes.id),
  title: text('title').notNull(),
  period: text('period'),
  documentNo: text('document_no').notNull(),
  documentDate: text('document_date').notNull(),
  dueDate: text('due_date').notNull(),
  penaltyStartDate: text('penalty_start_date'),
  amount: real('amount').notNull(),
  installmentNo: integer('installment_no'),
  installmentTotal: integer('installment_total'),
  expenseId: integer('expense_id').references(() => expenses.id),
  status: text('status', { enum: ['open', 'partial', 'paid'] }).notNull().default('open'),
  // Sadece bir ödemenin ürettiği "Tazminat" borçlarında dolu — o ödeme
  // silinirse bu borcun da silinmesi gerektiğini bilmek için.
  sourcePaymentId: integer('source_payment_id').references(() => payments.id)
}, (t) => [
  uniqueIndex('debts_double_accrual_unique').on(t.unitId, t.debtTypeId, t.period, t.installmentNo)
])

// Bir borcun kalemleri (ürün/hizmet, adet, birim fiyat).
export const debtItems = sqliteTable('debt_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  debtId: integer('debt_id').notNull().references(() => debts.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  lineTotal: real('line_total').notNull()
})

// Tahsilatlar. Ödeme tarihi elle girilir, zorunlu.
export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  unitId: integer('unit_id').notNull().references(() => units.id),
  receiptNo: text('receipt_no').notNull(),
  paidAt: text('paid_at').notNull(),
  amount: real('amount').notNull(),
  account: text('account').notNull(),
  reference: text('reference'),
  note: text('note'),
  createdBy: text('created_by').references(() => user.id)
})

// Bir ödemenin hangi borca ne kadar gittiğini gösteren mahsup kayıtları
// (en eski borçtan başlanarak dağıtılır). Tazminat tutarı burada sabitlenir,
// başka hiçbir yerde tekrar hesaplanmaz.
export const paymentAllocations = sqliteTable('payment_allocations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  debtId: integer('debt_id').notNull().references(() => debts.id),
  principalAmount: real('principal_amount').notNull(),
  penaltyAmount: real('penalty_amount').notNull(),
  penaltyDays: integer('penalty_days').notNull()
})

// Harcamalar — standart gider, demirbaş ya da huzur hakkı olabilir.
export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['standard', 'fixture', 'stipend'] }).notNull(),
  title: text('title').notNull(),
  expenseDate: text('expense_date').notNull(),
  totalAmount: real('total_amount').notNull(),
  perUnitAmount: real('per_unit_amount'),
  announcementId: integer('announcement_id').references((): any => announcements.id),
  createdBy: text('created_by').references(() => user.id)
})

// Bir harcamanın kalemleri.
export const expenseItems = sqliteTable('expense_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  expenseId: integer('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  quantity: real('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  lineTotal: real('line_total').notNull()
})

// Kasa defteri — her tahsilat ve harcama burada bir satır bırakır.
export const cashTransactions = sqliteTable('cash_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  direction: text('direction', { enum: ['in', 'out'] }).notNull(),
  amount: real('amount').notNull(),
  transactionDate: text('transaction_date').notNull(),
  paymentId: integer('payment_id').references(() => payments.id),
  expenseId: integer('expense_id').references(() => expenses.id),
  description: text('description').notNull()
})

// Duyurular. Durum sırayla taslak → aktif → pasif → arşiv olarak ilerler.
export const announcements = sqliteTable('announcements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  status: text('status', { enum: ['draft', 'active', 'passive', 'archived'] }).notNull().default('draft'),
  publishedAt: text('published_at').notNull(),
  expiresAt: text('expires_at'),
  expenseId: integer('expense_id').references(() => expenses.id)
})
