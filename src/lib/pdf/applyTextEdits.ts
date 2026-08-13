import { PDFDocument, rgb } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { compositePageToPng, type PagePatch } from './compositePage'
import type { FontFamily } from './fonts'
import type { PdfTextRun } from './textItems'

export type TextReplacement = {
  run: PdfTextRun
  newText: string
  drawX: number
  drawY: number
  family: FontFamily
  bold: boolean
  fontSize: number
  backdrop?: { r: number; g: number; b: number; shadow?: { r: number; g: number; b: number; dx: number; dy: number } }
}

export type AddedText = {
  id: string
  pageIndex: number
  x: number
  y: number
  fontSize: number
  text: string
  family: FontFamily
  bold: boolean
}

export type WhiteoutRect = {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
}

export type AddedImage = {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  bytes: Uint8Array
  mime: 'image/png' | 'image/jpeg'
}

export type EditPayload = {
  replacements: TextReplacement[]
  addedTexts: AddedText[]
  whiteouts: WhiteoutRect[]
  images: AddedImage[]
}

const COMPOSITE_SCALE = 2

function editedPageIndexes(payload: EditPayload): number[] {
  const pages = new Set<number>()
  for (const item of payload.replacements) pages.add(item.run.pageIndex)
  for (const item of payload.addedTexts) pages.add(item.pageIndex)
  for (const item of payload.whiteouts) pages.add(item.pageIndex)
  for (const item of payload.images) pages.add(item.pageIndex)
  return [...pages].sort((a, b) => a - b)
}

function patchForPage(payload: EditPayload, pageIndex: number): PagePatch {
  return {
    replacements: payload.replacements.filter((item) => item.run.pageIndex === pageIndex),
    addedTexts: payload.addedTexts.filter((item) => item.pageIndex === pageIndex),
    whiteouts: payload.whiteouts.filter((item) => item.pageIndex === pageIndex),
    images: payload.images.filter((item) => item.pageIndex === pageIndex),
  }
}

export async function applyEdits(
  source: Uint8Array,
  payload: EditPayload,
  doc: PDFDocumentProxy | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source)
  const pages = pdf.getPages()
  const pageIndexes = editedPageIndexes(payload)

  if (!doc || pageIndexes.length === 0) {
    return pdf.save()
  }

  for (const pageIndex of pageIndexes) {
    const page = pages[pageIndex]
    if (!page) continue
    const pngBytes = await compositePageToPng(doc, pageIndex, COMPOSITE_SCALE, patchForPage(payload, pageIndex))
    const embedded = await pdf.embedPng(pngBytes)
    const { width, height } = page.getSize()
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) })
    page.drawImage(embedded, { x: 0, y: 0, width, height })
  }

  return pdf.save()
}
