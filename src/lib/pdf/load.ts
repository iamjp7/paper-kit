import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

let workerConfigured = false

export function ensurePdfjsWorker() {
  if (workerConfigured) return
  GlobalWorkerOptions.workerSrc = workerUrl
  workerConfigured = true
}

export async function readPdfBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer())
}

export async function loadPdfjs(data: Uint8Array): Promise<PDFDocumentProxy> {
  ensurePdfjsWorker()
  return getDocument({ data: data.slice() }).promise
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function previewPdfUrl(bytes: Uint8Array): string {
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const blob = new Blob([toArrayBuffer(bytes)], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function withPdfName(original: string, suffix: string): string {
  const base = original.replace(/\.pdf$/i, '') || 'document'
  return `${base}-${suffix}.pdf`
}
