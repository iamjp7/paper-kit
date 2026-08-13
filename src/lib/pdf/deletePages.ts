import { PDFDocument } from 'pdf-lib'

export async function deletePdfPages(
  source: Uint8Array,
  pagesToDelete: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(source)
  const remove = new Set(pagesToDelete)
  const keep = src.getPageIndices().filter((index) => !remove.has(index))

  if (keep.length === 0) {
    throw new Error('Keep at least one page')
  }

  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, keep)
  copied.forEach((page) => out.addPage(page))
  return out.save()
}
