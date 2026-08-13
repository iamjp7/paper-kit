import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib'

export type FontFamily =
  | 'helvetica'
  | 'times'
  | 'courier'
  | 'noto-sans'
  | 'noto-serif'
  | 'noto-mono'

export type TextLook = {
  family: FontFamily
  bold: boolean
  fontSize: number
}

type FontMeta = {
  id: FontFamily
  label: string
  css: string
  unicode?: { regular: string; bold: string }
}

export const FONT_FAMILIES: FontMeta[] = [
  { id: 'helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  { id: 'times', label: 'Times', css: '"Times New Roman", Times, serif' },
  { id: 'courier', label: 'Courier', css: '"Courier New", Courier, monospace' },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    css: '"Noto Sans", Helvetica, sans-serif',
    unicode: { regular: '/fonts/NotoSans-Regular.ttf', bold: '/fonts/NotoSans-Bold.ttf' },
  },
  {
    id: 'noto-serif',
    label: 'Noto Serif',
    css: '"Noto Serif", Times, serif',
    unicode: { regular: '/fonts/NotoSerif-Regular.ttf', bold: '/fonts/NotoSerif-Bold.ttf' },
  },
  {
    id: 'noto-mono',
    label: 'Noto Sans Mono',
    css: '"Noto Sans Mono", "Courier New", monospace',
    unicode: { regular: '/fonts/NotoSansMono-Regular.ttf', bold: '/fonts/NotoSansMono-Bold.ttf' },
  },
]

const UNICODE_FALLBACK: FontFamily = 'noto-sans'
const fileCache = new Map<string, ArrayBuffer>()
const embedCache = new WeakMap<PDFDocument, Map<string, PDFFont>>()
const registered = new WeakSet<PDFDocument>()

export function inferFamily(fontName: string, fontFamily: string): FontFamily {
  const hint = `${stripSubset(fontName)} ${fontFamily}`.toLowerCase()
  if (/courier|mono|consolas|menlo|lucida console/.test(hint)) return 'noto-mono'
  if (/times|georgia|garamond|palatino|cambria|serif/.test(hint) && !/sans/.test(hint)) {
    return 'noto-serif'
  }
  if (/noto/.test(hint)) return 'noto-sans'
  return 'noto-sans'
}

export function inferBold(fontName: string, fontFamily: string): boolean {
  const hint = `${stripSubset(fontName)} ${fontFamily}`
  return /bold|black|heavy|semibold|demi|extrabold|ultra|boldmt|(?:^|[-_,. ])bd(?:$|[-_,. ])|bolditalic|wgt700|weight700|fw700/i.test(
    hint,
  )
}

function stripSubset(fontName: string): string {
  return fontName.replace(/^[A-Za-z0-9]{6}\+/, '')
}

export function cssFontFamily(family: FontFamily): string {
  return FONT_FAMILIES.find((item) => item.id === family)?.css ?? 'sans-serif'
}

function standardFace(family: FontFamily, bold: boolean): StandardFonts | null {
  if (family === 'times') return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman
  if (family === 'courier') return bold ? StandardFonts.CourierBold : StandardFonts.Courier
  if (family === 'helvetica') return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica
  return null
}

async function loadFontFile(path: string): Promise<Uint8Array> {
  const cached = fileCache.get(path)
  if (cached) return new Uint8Array(cached.slice(0))
  const response = await fetch(path)
  if (!response.ok) throw new Error(`Could not load font ${path}`)
  const buffer = await response.arrayBuffer()
  fileCache.set(path, buffer)
  return new Uint8Array(buffer.slice(0))
}

function ensureFontkit(pdf: PDFDocument) {
  if (registered.has(pdf)) return
  pdf.registerFontkit(fontkit)
  registered.add(pdf)
}

function canEncode(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text)
    return true
  } catch {
    return false
  }
}

export async function embedPdfFont(
  pdf: PDFDocument,
  family: FontFamily,
  bold: boolean,
): Promise<PDFFont> {
  ensureFontkit(pdf)
  let docCache = embedCache.get(pdf)
  if (!docCache) {
    docCache = new Map()
    embedCache.set(pdf, docCache)
  }
  const key = `${family}-${bold ? 'bold' : 'regular'}`
  const existing = docCache.get(key)
  if (existing) return existing

  const meta = FONT_FAMILIES.find((item) => item.id === family)
  const unicodePath = bold ? meta?.unicode?.bold : meta?.unicode?.regular
  const standard = standardFace(family, bold)
  const font = unicodePath
    ? await pdf.embedFont(await loadFontFile(unicodePath), { subset: true })
    : await pdf.embedFont(standard ?? StandardFonts.Helvetica)

  docCache.set(key, font)
  return font
}

export async function embedFontForText(
  pdf: PDFDocument,
  family: FontFamily,
  bold: boolean,
  text: string,
): Promise<PDFFont> {
  const preferred = await embedPdfFont(pdf, family, bold)
  if (canEncode(preferred, text)) return preferred
  return embedPdfFont(pdf, UNICODE_FALLBACK, bold)
}

export function safeText(font: PDFFont, value: string): string {
  try {
    font.encodeText(value)
    return value
  } catch {
    return [...value]
      .map((ch) => {
        try {
          font.encodeText(ch)
          return ch
        } catch {
          return '?'
        }
      })
      .join('')
  }
}
