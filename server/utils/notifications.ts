// Borç/ödeme olaylarında dairenin kayıtlı malikine bilgilendirme e-postası.
import { and, eq, tables, type Database } from './drizzle'
import { sendEmail } from './email'
import { formatCurrency, formatDate } from './report-format'

interface UnitContactInfo {
  unitLabel: string
  email: string | null
}

async function getUnitContactInfo(db: Database, unitId: number): Promise<UnitContactInfo | null> {
  const [row] = await db
    .select({ blockName: tables.blocks.name, number: tables.units.number, email: tables.unitContacts.email })
    .from(tables.units)
    .innerJoin(tables.blocks, eq(tables.units.blockId, tables.blocks.id))
    .leftJoin(tables.unitContacts, and(eq(tables.unitContacts.unitId, tables.units.id), eq(tables.unitContacts.role, 'malik')))
    .where(eq(tables.units.id, unitId))

  if (!row) return null
  return { unitLabel: `${row.blockName}-${row.number}`, email: row.email }
}

// Yeni bir borç kaydedildiğinde çağrılır. Malikin e-postası yoksa sessizce çıkar.
export async function notifyNewDebt(db: Database, unitId: number, title: string, amount: number, dueDate: string): Promise<void> {
  const info = await getUnitContactInfo(db, unitId)
  if (!info?.email) return

  await sendEmail(
    info.email,
    `Yeni Borç Bildirimi — ${info.unitLabel}`,
    `<p>Sayın yetkili,</p>
     <p><strong>${info.unitLabel}</strong> dairesi için <strong>${title}</strong> kalemiyle <strong>${formatCurrency(amount)} ₺</strong> tutarında yeni bir borç kaydedildi.</p>
     <p>Son ödeme tarihi: <strong>${formatDate(dueDate)}</strong></p>`
  )
}

// Bir ödeme onaylanıp kaydedildiğinde çağrılır. Malikin e-postası yoksa sessizce çıkar.
export async function notifyPayment(db: Database, unitId: number, amount: number, paidAt: string): Promise<void> {
  const info = await getUnitContactInfo(db, unitId)
  if (!info?.email) return

  await sendEmail(
    info.email,
    `Ödeme Alındı — ${info.unitLabel}`,
    `<p>Sayın yetkili,</p>
     <p><strong>${info.unitLabel}</strong> dairesi için <strong>${formatCurrency(amount)} ₺</strong> tutarındaki ödemeniz ${formatDate(paidAt)} tarihinde kaydedildi. Teşekkür ederiz.</p>`
  )
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Diğer bildirimlerin aksine tek bir daireye değil, hem malik hem kiracıya gönderilir.
async function getAllResidentEmails(db: Database): Promise<string[]> {
  const contacts: { email: string | null }[] = await db
    .select({ email: tables.unitContacts.email })
    .from(tables.unitContacts)
    .innerJoin(tables.units, eq(tables.units.id, tables.unitContacts.unitId))
    .where(eq(tables.units.isVirtual, false))

  const emails = contacts.map((c) => c.email).filter((e): e is string => !!e)
  return [...new Set(emails)]
}

// Bir duyuru "active" durumuna geçtiğinde çağrılır
export async function notifyAnnouncement(db: Database, title: string, body: string, publishedAt: string): Promise<void> {
  const emails = await getAllResidentEmails(db)
  if (!emails.length) return

  const html = `<p>Sayın sakinimiz,</p>
     <p><strong>${escapeHtml(title)}</strong></p>
     <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
     <p>Yayın tarihi: <strong>${formatDate(publishedAt)}</strong></p>`

  await Promise.all(emails.map((email) => sendEmail(email, `Yeni Duyuru — ${title}`, html)))
}
