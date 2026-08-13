import { useCallback, useState } from 'react'
import Dropzone from '../components/Dropzone'
import PageFilmstrip from '../components/PageFilmstrip'
import { downloadPdf, loadPdfjs, readPdfBytes, withPdfName } from '../lib/pdf/load'
import { defaultMergeOrder, mergePdfs, type MergePageRef } from '../lib/pdf/merge'
import { renderThumbnail } from '../lib/pdf/render'

type Source = {
  name: string
  bytes: Uint8Array
  pageCount: number
}

type Thumb = MergePageRef & { src: string; label: string }

export default function MergePdf() {
  const [sources, setSources] = useState<Source[]>([])
  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const [order, setOrder] = useState<MergePageRef[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFiles = useCallback(async (files: File[]) => {
    setError(null)
    const nextSources: Source[] = []
    for (const file of files) {
      const bytes = await readPdfBytes(file)
      const doc = await loadPdfjs(bytes)
      nextSources.push({ name: file.name, bytes, pageCount: doc.numPages })
    }
    setSources(nextSources)
    const nextOrder = defaultMergeOrder(nextSources)
    setOrder(nextOrder)
    const nextThumbs: Thumb[] = []
    for (const [sourceIndex, source] of nextSources.entries()) {
      const doc = await loadPdfjs(source.bytes)
      for (let pageIndex = 0; pageIndex < source.pageCount; pageIndex += 1) {
        nextThumbs.push({
          id: `${sourceIndex}-${pageIndex}`,
          sourceIndex,
          pageIndex,
          src: await renderThumbnail(doc, pageIndex + 1),
          label: `${source.name.replace(/\.pdf$/i, '')} · ${pageIndex + 1}`,
        })
      }
    }
    setThumbs(nextThumbs)
  }, [])

  function move(id: string, dir: -1 | 1) {
    setOrder((prev) => {
      const index = prev.findIndex((item) => item.id === id)
      if (index < 0) return prev
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      const [item] = next.splice(index, 1)
      if (item) next.splice(target, 0, item)
      return next
    })
  }

  async function onMerge() {
    setBusy(true)
    setError(null)
    try {
      const bytes = await mergePdfs(
        sources.map((source) => source.bytes),
        order,
      )
      downloadPdf(bytes, withPdfName(sources[0]?.name ?? 'merged', 'merged'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge PDFs')
    } finally {
      setBusy(false)
    }
  }

  const visibleThumbs = order
    .map((ref) => thumbs.find((thumb) => thumb.id === ref.id))
    .filter((item): item is Thumb => Boolean(item))

  return (
    <div>
      <h1 className="text-3xl font-semibold text-slate-900">Merge PDF</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Combine files, then remove or reorder pages before download.
      </p>
      {sources.length === 0 && (
        <div className="mt-6">
          <Dropzone
            onFiles={onFiles}
            multiple
            title="Drop PDFs to merge"
            hint="Select more than one PDF. Processing stays on this device."
          />
        </div>
      )}
      {sources.length > 0 && (
        <div className="mt-6 space-y-4">
          <PageFilmstrip items={visibleThumbs} />
          <div className="space-y-2">
            {order.map((ref, index) => {
              const thumb = thumbs.find((item) => item.id === ref.id)
              return (
                <div
                  key={ref.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <span className="w-6 text-slate-400">{index + 1}</span>
                  <span className="flex-1 truncate">{thumb?.label ?? ref.id}</span>
                  <button type="button" className="text-slate-500" onClick={() => move(ref.id, -1)}>
                    Up
                  </button>
                  <button type="button" className="text-slate-500" onClick={() => move(ref.id, 1)}>
                    Down
                  </button>
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => setOrder((prev) => prev.filter((item) => item.id !== ref.id))}
                  >
                    Remove
                  </button>
                </div>
              )
            })}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || order.length === 0}
              onClick={() => void onMerge()}
              className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Merging…' : 'Download merged PDF'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSources([])
                setOrder([])
                setThumbs([])
              }}
              className="rounded-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              New files
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
