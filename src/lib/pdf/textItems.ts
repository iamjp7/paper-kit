import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'
import { inferBold, inferFamily, type FontFamily } from './fonts'
import { clampAdvanceWidth } from './runBounds'

export type PdfTextRun = {
  id: string
  pageIndex: number
  str: string
  x: number
  y: number
  /** Click-target width in the editor overlay */
  width: number
  /** Actual PDF horizontal advance — use for erase/redraw bounds */
  advanceWidth: number
  height: number
  fontSize: number
  transform: number[]
  bold: boolean
  family: FontFamily
  fontName: string
}

function isTextItem(item: unknown): item is TextItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    'str' in item &&
    'transform' in item
  )
}

async function readTextContent(doc: PDFDocumentProxy, pageIndex: number): Promise<TextContent> {
  const page = await doc.getPage(pageIndex + 1)
  const stream = page.streamTextContent({
    includeMarkedContent: false,
    disableNormalization: false,
  })
  const reader = stream.getReader()
  const textContent: TextContent = {
    items: [],
    styles: Object.create(null) as TextContent['styles'],
    lang: null,
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    Object.assign(textContent.styles, value.styles)
    textContent.items.push(...value.items)
  }

  return textContent
}

function mergeTrailingPunctuation(runs: PdfTextRun[]): PdfTextRun[] {
  if (runs.length < 2) return runs
  const merged: PdfTextRun[] = []

  for (const run of runs) {
    const prev = merged[merged.length - 1]
    const punctOnly = /^[\s;,.:)\]"']+$/.test(run.str) && run.str.length <= 3
    const sameLine =
      prev && Math.abs(prev.y - run.y) <= Math.max(prev.fontSize, run.fontSize) * 0.35
    const gap = prev ? run.x - (prev.x + prev.advanceWidth) : Number.POSITIVE_INFINITY
    const adjacent = gap >= -2 && gap <= (prev?.fontSize ?? 12) * 0.45

    if (prev && punctOnly && sameLine && adjacent) {
      const endX = run.x + run.advanceWidth
      prev.str += run.str
      prev.advanceWidth = endX - prev.x
      prev.width = Math.max(prev.width, prev.advanceWidth)
      continue
    }

    merged.push({ ...run })
  }

  return merged
}

export async function extractPageTextRuns(
  doc: PDFDocumentProxy,
  pageIndex: number,
): Promise<PdfTextRun[]> {
  const content = await readTextContent(doc, pageIndex)
  const runs: PdfTextRun[] = []

  for (const raw of content.items) {
    if (!isTextItem(raw)) continue
    const str = raw.str
    if (!str.replace(/\s/g, '')) continue
    const [a, b, c, d, e, f] = raw.transform
    const fontSize = Math.hypot(c, d) || Math.hypot(a, b) || 12
    const advanceWidth = clampAdvanceWidth(fontSize, str, raw.width)
    const width = Math.max(advanceWidth, fontSize * 0.45)
    const height = raw.height || fontSize
    const style = content.styles[raw.fontName]
    const fontFamily = style?.fontFamily ?? ''
    runs.push({
      id: `${pageIndex}-${runs.length}`,
      pageIndex,
      str,
      x: e,
      y: f,
      width,
      advanceWidth,
      height,
      fontSize,
      transform: [...raw.transform],
      bold: inferBold(raw.fontName, fontFamily),
      family: inferFamily(raw.fontName, fontFamily),
      fontName: raw.fontName,
    })
  }

  return mergeTrailingPunctuation(runs)
}
