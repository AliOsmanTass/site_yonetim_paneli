// 'xlsx' paketinin type tanımları sadece ana giriş ('xlsx') için var.
// cpexcel.js sorunundan kaçınmak için doğrudan ESM dosyasından import
// ediyoruz (bkz. tabular-report.ts, r1-report.ts) — aynı API, tipler de aynı.
declare module 'xlsx/xlsx.mjs' {
  export * from 'xlsx'
}
