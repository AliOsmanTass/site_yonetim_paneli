// Resend üzerinden düz HTTP ile e-posta gönderimi. 
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY tanımlı değil, e-posta gönderilmedi.')
    return
  }

  // Kendi doğrulanmış alan adın yoksa Resend'in test göndericisiyle de çalışır.
  const from = process.env.RESEND_FROM_EMAIL || 'Site Yönetimi <onboarding@resend.dev>'

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to, subject, html })
    })

    if (!response.ok) {
      console.error('[email] Gönderilemedi:', response.status, await response.text())
    }
  } catch (error) {
    // Bildirim gönderimi bir yan etki — başarısız olsa bile asıl işlemi
    // (borç/ödeme kaydı) asla bozmamalı, bu yüzden burada yutuluyor.
    console.error('[email] İstek başarısız:', error)
  }
}
