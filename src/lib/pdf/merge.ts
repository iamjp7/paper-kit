import { PDFDocument } from 'pdf-lib'

export type MergePageRef = {
  id: string
  sourceIndex: number
  pageIndex: number
}

export async function mergePdfs(
  sources: Uint8Array[],
  order: MergePageRef[],
): Promise<Uint8Array> {
  if (order.length === 0) {
    throw new Error('Add at least one page to merge')
  }

  const loaded = await Promise.all(sources.map((bytes) => PDFDocument.load(bytes)))
  const out = await PDFDocument.create()

  for (const ref of order) {
    const src = loaded[ref.sourceIndex]
    if (!src) continue
    const [page] = await out.copyPages(src, [ref.pageIndex])
    out.addPage(page)
  }

  return out.save()
}

export function defaultMergeOrder(
  sources: { pageCount: number }[],
): MergePageRef[] {
  const order: MergePageRef[] = []
  sources.forEach((source, sourceIndex) => {
    for (let pageIndex = 0; pageIndex < source.pageCount; pageIndex += 1) {
      order.push({
        id: `${sourceIndex}-${pageIndex}`,
        sourceIndex,
        pageIndex,
      })
    }
  })
  return order
}
