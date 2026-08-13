import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy, RenderTask, PageViewport } from 'pdfjs-dist'

export async function getPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<PDFPageProxy> {
  return doc.getPage(pageNumber)
}

export function pageViewport(page: PDFPageProxy, scale: number): PageViewport {
  return page.getViewport({ scale })
}

export function viewportBox(
  viewport: PageViewport,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const [x1, y1] = viewport.convertToViewportPoint(x, y)
  const [x2, y2] = viewport.convertToViewportPoint(x + width, y + height)
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

/** Typical ascent/descent ratios for sans-serif PDF/canvas alignment. */
export const TEXT_ASCENT_EM = 0.76
export const TEXT_DESCENT_EM = 0.24

export type TextOverlayBox = {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  baseline: number
}

export function textOverlayBoxFromPdf(
  viewport: PageViewport,
  pdfX: number,
  pdfY: number,
  pdfFontSize: number,
  pdfWidth: number,
): TextOverlayBox {
  const [left, baseline] = viewport.convertToViewportPoint(pdfX, pdfY)
  const fontSizePx = pdfFontSize * viewport.scale
  return textOverlayBoxFromViewportBaseline(left, baseline, fontSizePx, pdfWidth * viewport.scale)
}

/** Calibrated nudge so canvas export matches the HTML edit overlay. */
export const PREVIEW_BASELINE_NUDGE_EM = 0.05

export function previewBaselineY(box: TextOverlayBox): number {
  return box.baseline + box.fontSize * PREVIEW_BASELINE_NUDGE_EM
}

export function textOverlayBoxFromViewportBaseline(
  left: number,
  baseline: number,
  fontSizePx: number,
  widthPx: number,
): TextOverlayBox {
  const padX = 1
  return {
    left: left - padX,
    top: baseline - fontSizePx * TEXT_ASCENT_EM,
    width: Math.max(widthPx, 12) + padX * 2,
    height: fontSizePx * (TEXT_ASCENT_EM + TEXT_DESCENT_EM),
    fontSize: fontSizePx,
    baseline,
  }
}

export function overlayFromTextTransform(
  viewport: PageViewport,
  transform: number[],
  pdfWidth: number,
) {
  const tx = Util.transform(viewport.transform, transform)
  const fontSizePx = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 12
  return textOverlayBoxFromViewportBaseline(tx[4], tx[5], fontSizePx, pdfWidth * viewport.scale)
}

export type Rgb01 = { r: number; g: number; b: number }

export type TextBackdrop = Rgb01 & {
  shadow?: Rgb01 & { dx: number; dy: number }
}

function luminance(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function to01(r: number, g: number, b: number): Rgb01 {
  return { r: r / 255, g: g / 255, b: b / 255 }
}

export function sampleTextBackdrop(
  canvas: HTMLCanvasElement,
  box: { left: number; top: number; width: number; height: number },
): TextBackdrop {
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.clientWidth === 0) return { r: 1, g: 1, b: 1 }

  const sx = canvas.width / canvas.clientWidth
  const sy = canvas.height / canvas.clientHeight
  const pad = Math.ceil(5 * sx)
  const x = Math.max(0, Math.floor(box.left * sx) - pad)
  const y = Math.max(0, Math.floor(box.top * sy) - pad)
  const w = Math.min(canvas.width - x, Math.max(1, Math.ceil(box.width * sx) + pad * 2))
  const h = Math.min(canvas.height - y, Math.max(1, Math.ceil(box.height * sy) + pad * 2))

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(x, y, w, h).data
  } catch {
    return { r: 1, g: 1, b: 1 }
  }

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
  const grayPixels: { r: number; g: number; b: number; px: number; py: number }[] = []

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const a = data[i + 3] ?? 0
    if (a < 200) continue
    const lum = luminance(r, g, b)
    if (lum < 28) continue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.n += 1
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { n: 1, r, g, b })
    }
    const sat = Math.max(r, g, b) - Math.min(r, g, b)
    if (sat < 30 && lum < 205 && lum > 40) {
      const index = i / 4
      grayPixels.push({ r, g, b, px: index % w, py: Math.floor(index / w) })
    }
  }

  let fill = { r: 1, g: 1, b: 1 }
  let best = 0
  for (const bucket of buckets.values()) {
    if (bucket.n > best) {
      best = bucket.n
      fill = to01(bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n)
    }
  }

  const area = w * h
  const grayShare = grayPixels.length / Math.max(area, 1)
  const midX = w * 0.55
  const midY = h * 0.55
  const lowerRight = grayPixels.filter((p) => p.px >= midX && p.py >= midY).length
  const hasShadow = grayShare > 0.03 && grayShare < 0.55 && lowerRight > grayPixels.length * 0.35

  if (!hasShadow || grayPixels.length === 0) return fill

  const shadowAvg = grayPixels.reduce(
    (acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }),
    { r: 0, g: 0, b: 0 },
  )
  const n = grayPixels.length
  return {
    ...fill,
    shadow: {
      ...to01(shadowAvg.r / n, shadowAvg.g / n, shadowAvg.b / n),
      dx: 0.75,
      dy: -0.55,
    },
  }
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<{ viewport: PageViewport; task: RenderTask | null }> {
  const viewport = pageViewport(page, scale)
  const outputScale = window.devicePixelRatio || 1
  canvas.width = Math.floor(viewport.width * outputScale)
  canvas.height = Math.floor(viewport.height * outputScale)
  canvas.style.width = `${viewport.width}px`
  canvas.style.height = `${viewport.height}px`

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create canvas context')

  ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0)
  try {
    const task = page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    })
    await task.promise
    return { viewport, task }
  } catch {
    return { viewport, task: null }
  }
}

export async function renderThumbnail(
  doc: PDFDocumentProxy,
  pageNumber: number,
  maxWidth = 140,
): Promise<string> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const scale = maxWidth / base.width
  const canvas = document.createElement('canvas')
  await renderPageToCanvas(page, canvas, scale)
  return canvas.toDataURL('image/jpeg', 0.72)
}
