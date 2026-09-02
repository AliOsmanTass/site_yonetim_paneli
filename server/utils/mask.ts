// Gizlilik için açık erişimde ad-soyad yalnızca baş harfleriyle gösterilir.
export function maskContactName(firstName: string, lastName: string): string {
  const first = firstName.trim().charAt(0).toLocaleUpperCase('tr-TR')
  const last = lastName.trim().charAt(0).toLocaleUpperCase('tr-TR')
  return `${first}.${last}.`
}
