import { useCallback, useState } from 'react'
import Dropzone from '../components/Dropzone'
import { deletePdfPages } from '../lib/pdf/deletePages'
import { downloadPdf, loadPdfjs, readPdfBytes, withPdfName } from '../lib/pdf/load'
import { renderThumbnail } from '../lib/pdf/render'

type Thumb = { id: string; src: string; label: string; pageIndex: number }

export default function DeletePages() {
  const [fileName, setFileName] = useState('')
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [thumbs, setThumbs] = useState<Thumb[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setError(null)
    const data = await readPdfBytes(file)
    const doc = await loadPdfjs(data)
    setFileName(file.name)
    setBytes(data)
    setSelected(new Set())
    const next: Thumb[] = []
    for (let i = 1; i <= doc.numPages; i += 1) {
      next.push({
        id: String(i - 1),
        pageIndex: i - 1,
        src: await renderThumbnail(doc, i),
        label: `Page ${i}`,
      })
    }
    setThumbs(next)
  }, [])

  function toggle(pageIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(pageIndex)) next.delete(pageIndex)
      else next.add(pageIndex)
      return next
    })
  }

  async function onDelete() {
    if (!bytes) return
    setBusy(true)
    setError(null)
    try {
      const out = await deletePdfPages(bytes, [...selected])
      downloadPdf(out, withPdfName(fileName, 'pages-removed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold text-slate-900">Delete pages</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Select pages to remove. The remaining pages are saved as a new PDF.
      </p>
      {!bytes && (
        <div className="mt-6">
          <Dropzone onFiles={onFiles} title="Drop a PDF to remove pages" />
        </div>
      )}
      {bytes && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-slate-600">
            {selected.size} page{selected.size === 1 ? '' : 's'} marked for deletion
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {thumbs.map((thumb) => {
              const marked = selected.has(thumb.pageIndex)
              return (
                <button
                  key={thumb.id}
                  type="button"
                  onClick={() => toggle(thumb.pageIndex)}
                  className={`rounded-xl border bg-white p-2 text-left shadow-sm ${
                    marked ? 'border-red-500 ring-2 ring-red-200' : 'border-slate-200'
                  }`}
                >
                  <img src={thumb.src} alt="" className="h-40 w-full rounded object-contain bg-slate-100" />
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span>{thumb.label}</span>
                    {marked && <span className="font-medium text-red-600">Remove</span>}
                  </div>
                </button>
              )
            })}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || selected.size === 0}
              onClick={() => void onDelete()}
              className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Saving…' : 'Download PDF'}
            </button>
            <button
              type="button"
              onClick={() => {
                setBytes(null)
                setThumbs([])
                setSelected(new Set())
              }}
              className="rounded-full px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              New file
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
