import { describe, expect, it } from 'vitest'
import { maskContactName } from '../../server/utils/mask'

describe('maskContactName', () => {
  // açık erişimde isim yerine sadece baş harfler görünmeli.
  it('"Ali Osman" → "A.O."', () => {
    expect(maskContactName('Ali', 'Osman')).toBe('A.O.')
  })

  // JavaScript'in standart büyük harfe çevirme fonksiyonu Türkçe ı/i ayrımını
  // bilmiyor; bu test Türkçe kurallara göre doğru büyük harfe çevrildiğini doğruluyor.
  it('Türkçe noktasız/noktalı I ayrımını doğru çevirir (ı → I, i → İ)', () => {
    expect(maskContactName('ısmail', 'ismet')).toBe('I.İ.')
  })

  // Formdan yanlışlıkla boşluklu girilen bir isim de düzgün maskelenmeli.
  it('baştaki/sondaki boşlukları görmezden gelir', () => {
    expect(maskContactName(' Ayşe ', ' Yılmaz ')).toBe('A.Y.')
  })
})
