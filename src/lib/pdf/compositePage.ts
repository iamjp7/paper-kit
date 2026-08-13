import type { PDFDocumentProxy } from 'pdfjs-dist'
import { cssFontFamily, FONT_FAMILIES, type FontFamily } from './fonts'
import { toArrayBuffer } from './load'
import { overlayFromTextTransform, previewBaselineY, renderPageToCanvas, textOverlayBoxFromPdf, viewportBox } from './render'
import { eraseCoverWidth } from './runBounds'
import type { AddedImage, AddedText, TextReplacement, WhiteoutRect } from './applyTextEdits'

export type PagePatch = {
  replacements: TextReplacement[]
  addedTexts: AddedText[]
  whiteouts: WhiteoutRect[]
  images: AddedImage[]
}

const loadedCanvasFonts = new Set<string>()

function fontFile(family: FontFamily, bold: boolean): string | null {
  const meta = FONT_FAMILIES.find((item) => item.id === family)
  const path = bold ? meta?.unicode?.bold : meta?.unicode?.regular
  return path ?? null
}

async function ensureCanvasFont(family: FontFamily, bold: boolean): Promise<string> {
  const css = cssFontFamily(family)
  const path = fontFile(family, bold)
  if (!path) return css

  const name = `PaperKit-${family}-${bold ? 'bold' : 'regular'}`
  if (!loadedCanvasFonts.has(name)) {
    const face = new FontFace(name, `url(${path})`)
    await face.load()
    document.fonts.add(face)
    loadedCanvasFonts.add(name)
  }
  return `"${name}", ${css}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

function erasePdfWidth(
  fontSize: number,
  originalText: string,
  newText: string,
  advanceWidth: number,
): number {
  return eraseCoverWidth(fontSize, originalText, newText, advanceWidth)
}

function backdropCss(backdrop?: TextReplacement['backdrop']): string {
  if (!backdrop) return '#ffffff'
  const r = Math.round(backdrop.r * 255)
  const g = Math.round(backdrop.g * 255)
  const b = Math.round(backdrop.b * 255)
  return `rgb(${r} ${g} ${b})`
}

function fillBox(
  ctx: CanvasRenderingContext2D,
  box: { left: number; top: number; width: number; height: number },
  color: string,
) {
  ctx.fillStyle = color
  ctx.fillRect(box.left, box.top, box.width, box.height)
}

export async function compositePageToPng(
  doc: PDFDocumentProxy,
  pageIndex: number,
  scale: number,
  patch: PagePatch,
): Promise<Uint8Array> {
  const page = await doc.getPage(pageIndex + 1)
  const canvas = document.createElement('canvas')
  const { viewport } = await renderPageToCanvas(page, canvas, scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  for (const whiteout of patch.whiteouts) {
    fillBox(ctx, viewportBox(viewport, whiteout.x, whiteout.y, whiteout.width, whiteout.height), '#ffffff')
  }

  for (const item of patch.replacements) {
    const eraseStr = item.newText.trim() ? item.newText : item.run.str
    const pdfWidth = erasePdfWidth(
      item.run.fontSize,
      item.run.str,
      eraseStr,
      item.run.advanceWidth,
    )
    const eraseColor = backdropCss(item.backdrop)

    fillBox(
      ctx,
      overlayFromTextTransform(viewport, item.run.transform, pdfWidth),
      eraseColor,
    )
  }

  for (const item of patch.replacements) {
    if (!item.newText.trim()) continue
    const box = textOverlayBoxFromPdf(viewport, item.drawX, item.drawY, item.fontSize, item.run.advanceWidth)
    const [textX] = viewport.convertToViewportPoint(item.drawX, item.drawY)
    const face = await ensureCanvasFont(item.family, item.bold)
    ctx.font = `${item.bold ? 'bold ' : ''}${box.fontSize}px ${face}`
    ctx.fillStyle = '#000000'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(item.newText, textX, previewBaselineY(box))
  }

  for (const added of patch.addedTexts) {
    if (!added.text.trim()) continue
    const box = textOverlayBoxFromPdf(viewport, added.x, added.y, added.fontSize, added.text.length * added.fontSize * 0.52)
    const [textX] = viewport.convertToViewportPoint(added.x, added.y)
    const face = await ensureCanvasFont(added.family, added.bold)
    ctx.font = `${added.bold ? 'bold ' : ''}${box.fontSize}px ${face}`
    ctx.fillStyle = '#000000'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(added.text, textX, previewBaselineY(box))
  }

  for (const image of patch.images) {
    const blob = new Blob([toArrayBuffer(image.bytes)], { type: image.mime })
    const url = URL.createObjectURL(blob)
    try {
      const img = await loadImage(url)
      const box = viewportBox(viewport, image.x, image.y, image.width, image.height)
      ctx.drawImage(img, box.left, box.top, box.width, box.height)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) throw new Error('Could not export edited page')
  return new Uint8Array(await blob.arrayBuffer())
}
