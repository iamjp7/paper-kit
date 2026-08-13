import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PageViewport, PDFDocumentProxy } from 'pdfjs-dist'
import Dropzone from '../components/Dropzone'
import PageFilmstrip from '../components/PageFilmstrip'
import {
  applyEdits,
  type AddedImage,
  type AddedText,
  type WhiteoutRect,
} from '../lib/pdf/applyTextEdits'
import {
  downloadPdf,
  loadPdfjs,
  previewPdfUrl,
  readPdfBytes,
  toArrayBuffer,
  withPdfName,
} from '../lib/pdf/load'
import {
  overlayFromTextTransform,
  renderPageToCanvas,
  renderThumbnail,
  sampleTextBackdrop,
  textOverlayBoxFromPdf,
  viewportBox,
  type TextBackdrop,
} from '../lib/pdf/render'
import { cssFontFamily, FONT_FAMILIES, type FontFamily, type TextLook } from '../lib/pdf/fonts'
import { extractPageTextRuns, type PdfTextRun } from '../lib/pdf/textItems'

type PlacedImage = AddedImage & { previewUrl: string }

type Tool = 'select' | 'text' | 'whiteout' | 'image'

type MoveKind = 'run' | 'added' | 'image' | 'whiteout'

type MoveDrag = {
  kind: MoveKind
  id: string
  startClientX: number
  startClientY: number
  origX: number
  origY: number
  dragging: boolean
}

const tools: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Edit / move' },
  { id: 'text', label: 'Add text' },
  { id: 'whiteout', label: 'Whiteout' },
  { id: 'image', label: 'Image' },
]

function DeleteChip({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      className="absolute -right-2 -top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-sm leading-none text-white shadow"
      title="Remove"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onRemove()
      }}
    >
      ×
    </button>
  )
}

function Grip() {
  return (
    <div
      data-grip="true"
      className="absolute -left-5 top-0 flex h-full w-5 cursor-grab items-center justify-center rounded-l bg-teal-700 text-[10px] text-white"
      title="Drag to move"
    >
      ⋮⋮
    </div>
  )
}

export default function EditPdf() {
  const [fileName, setFileName] = useState('')
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [scale, setScale] = useState(1.15)
  const [thumbs, setThumbs] = useState<{ id: string; src: string; label: string }[]>([])
  const [runs, setRuns] = useState<PdfTextRun[]>([])
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [runPos, setRunPos] = useState<Record<string, { x: number; y: number }>>({})
  const [runLooks, setRunLooks] = useState<Record<string, TextLook>>({})
  const [backdrops, setBackdrops] = useState<Record<string, TextBackdrop>>({})
  const [addedTexts, setAddedTexts] = useState<AddedText[]>([])
  const [whiteouts, setWhiteouts] = useState<WhiteoutRect[]>([])
  const [images, setImages] = useState<PlacedImage[]>([])
  const [tool, setTool] = useState<Tool>('select')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<PageViewport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [whiteoutStart, setWhiteoutStart] = useState<{ x: number; y: number } | null>(null)
  const [pendingImage, setPendingImage] = useState<{
    bytes: Uint8Array
    mime: 'image/png' | 'image/jpeg'
    ratio: number
  } | null>(null)
  const [preview, setPreview] = useState<{ url: string; bytes: Uint8Array } | null>(null)
  const [touchedRuns, setTouchedRuns] = useState<Set<string>>(() => new Set())
  const [deletedRuns, setDeletedRuns] = useState<Set<string>>(() => new Set())

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const activeInputRef = useRef<HTMLInputElement>(null)
  const toolRef = useRef(tool)
  const moveRef = useRef<MoveDrag | null>(null)
  const viewportRef = useRef(viewport)
  toolRef.current = tool
  viewportRef.current = viewport

  const onFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setError(null)
    const data = await readPdfBytes(file)
    const pdf = await loadPdfjs(data)
    setFileName(file.name)
    setBytes(data)
    setDoc(pdf)
    setPageIndex(0)
    setEdits({})
    setRunPos({})
    setRunLooks({})
    setTouchedRuns(new Set())
    setDeletedRuns(new Set())
    setBackdrops({})
    setAddedTexts([])
    setWhiteouts([])
    setImages([])
    setActiveId(null)
    setEditingId(null)
    const nextThumbs = []
    for (let i = 1; i <= pdf.numPages; i += 1) {
      nextThumbs.push({
        id: String(i - 1),
        src: await renderThumbnail(pdf, i),
        label: `Page ${i}`,
      })
    }
    setThumbs(nextThumbs)
  }, [])

  useEffect(() => {
    if (!doc) return
    let cancelled = false
    void extractPageTextRuns(doc, pageIndex)
      .then((items) => {
        if (!cancelled) setRuns(items)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read PDF text')
      })
    return () => {
      cancelled = true
    }
  }, [doc, pageIndex])

  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelled = false
    void (async () => {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled || !canvasRef.current) return
      const result = await renderPageToCanvas(page, canvasRef.current, scale)
      if (!cancelled) setViewport(result.viewport)
    })()
    return () => {
      cancelled = true
    }
  }, [doc, pageIndex, scale])

  useEffect(() => {
    if (!viewport || !canvasRef.current || runs.length === 0) return
    const canvas = canvasRef.current
    const next: Record<string, TextBackdrop> = {}
    for (const run of runs) {
      const box = overlayFromTextTransform(viewport, run.transform, run.advanceWidth)
      next[run.id] = sampleTextBackdrop(canvas, box)
    }
    setBackdrops(next)
  }, [viewport, runs])

  useEffect(() => {
    if (!editingId) return
    const el = activeInputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editingId])

  const applyMove = useCallback((drag: MoveDrag, clientX: number, clientY: number) => {
    const vp = viewportRef.current
    const overlay = overlayRef.current
    if (!vp || !overlay) return
    const box = overlay.getBoundingClientRect()
    const startCssX = drag.startClientX - box.left
    const startCssY = drag.startClientY - box.top
    const nowCssX = clientX - box.left
    const nowCssY = clientY - box.top
    const [p0x, p0y] = vp.convertToPdfPoint(startCssX, startCssY)
    const [p1x, p1y] = vp.convertToPdfPoint(nowCssX, nowCssY)
    const x = drag.origX + (p1x - p0x)
    const y = drag.origY + (p1y - p0y)
    if (drag.kind === 'run') {
      setRunPos((prev) => ({ ...prev, [drag.id]: { x, y } }))
      return
    }
    if (drag.kind === 'added') {
      setAddedTexts((prev) => prev.map((row) => (row.id === drag.id ? { ...row, x, y } : row)))
      return
    }
    if (drag.kind === 'image') {
      setImages((prev) => prev.map((row) => (row.id === drag.id ? { ...row, x, y } : row)))
      return
    }
    setWhiteouts((prev) => prev.map((row) => (row.id === drag.id ? { ...row, x, y } : row)))
  }, [])

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = moveRef.current
      if (!drag) return
      const dist = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY)
      if (!drag.dragging && dist < 6) return
      drag.dragging = true
      applyMove(drag, event.clientX, event.clientY)
    }
    function onUp() {
      const drag = moveRef.current
      if (drag?.dragging && drag.kind === 'run') {
        setTouchedRuns((prev) => new Set(prev).add(drag.id))
      }
      moveRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [applyMove])

  function markRunTouched(id: string) {
    setTouchedRuns((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }

  function removePdfTextRun(run: PdfTextRun) {
    setEdits((prev) => ({ ...prev, [run.id]: '' }))
    setDeletedRuns((prev) => new Set(prev).add(run.id))
    markRunTouched(run.id)
    setActiveId(null)
    setEditingId(null)
  }

  const removeActive = useCallback(() => {
    if (!activeId) return
    const pdfRun = runs.find((run) => run.id === activeId)
    if (pdfRun) {
      removePdfTextRun(pdfRun)
      return
    }
    setAddedTexts((prev) => prev.filter((item) => item.id !== activeId))
    setWhiteouts((prev) => prev.filter((item) => item.id !== activeId))
    setImages((prev) => {
      const doomed = prev.find((item) => item.id === activeId)
      if (doomed) URL.revokeObjectURL(doomed.previewUrl)
      return prev.filter((item) => item.id !== activeId)
    })
    setActiveId(null)
    setEditingId(null)
  }, [activeId, runs])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!activeId) return
      const target = event.target
      const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      if (event.key === 'Escape') {
        setEditingId(null)
        setActiveId(null)
        return
      }
      const removable =
        runs.some((run) => run.id === activeId) ||
        activeId.startsWith('text-') ||
        activeId.startsWith('img-') ||
        activeId.startsWith('w-')
      if (!removable) return
      if (event.key === 'Delete' || (event.key === 'Backspace' && !inField)) {
        event.preventDefault()
        removeActive()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeId, removeActive, runs])

  function overlayPoint(clientX: number, clientY: number) {
    const box = overlayRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    return { x: clientX - box.left, y: clientY - box.top }
  }

  function beginMove(kind: MoveKind, id: string, origX: number, origY: number, event: ReactPointerEvent) {
    event.stopPropagation()
    setActiveId(id)
    moveRef.current = {
      kind,
      id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origX,
      origY,
      dragging: false,
    }
  }

  function onOverlayPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!viewport || event.target !== overlayRef.current) return
    const point = overlayPoint(event.clientX, event.clientY)
    if (tool === 'whiteout') {
      setWhiteoutStart(point)
      setActiveId(null)
      setEditingId(null)
      return
    }
    if (tool === 'text') {
      const [x, y] = viewport.convertToPdfPoint(point.x, point.y)
      const id = `text-${crypto.randomUUID()}`
      setAddedTexts((prev) => [...prev, { id, pageIndex, x, y, fontSize: 16, text: 'Text', family: 'noto-sans', bold: false }])
      setActiveId(id)
      setEditingId(id)
      setTool('select')
      return
    }
    if (tool === 'image' && pendingImage) {
      const [x, y] = viewport.convertToPdfPoint(point.x, point.y)
      const width = 160
      const height = width / pendingImage.ratio
      const id = `img-${crypto.randomUUID()}`
      setImages((prev) => [
        ...prev,
        {
          id,
          pageIndex,
          x,
          y: y - height,
          width,
          height,
          bytes: pendingImage.bytes,
          mime: pendingImage.mime,
          previewUrl: URL.createObjectURL(
            new Blob([toArrayBuffer(pendingImage.bytes)], { type: pendingImage.mime }),
          ),
        },
      ])
      setPendingImage(null)
      setActiveId(id)
      setTool('select')
      return
    }
    setActiveId(null)
    setEditingId(null)
  }

  function onOverlayPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!whiteoutStart || !viewport || toolRef.current !== 'whiteout') return
    const point = overlayPoint(event.clientX, event.clientY)
    const [x1, y1] = viewport.convertToPdfPoint(whiteoutStart.x, whiteoutStart.y)
    const [x2, y2] = viewport.convertToPdfPoint(point.x, point.y)
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    const width = Math.abs(x2 - x1)
    const height = Math.abs(y2 - y1)
    if (width > 4 && height > 4) {
      const id = `w-${crypto.randomUUID()}`
      setWhiteouts((prev) => [...prev, { id, pageIndex, x, y, width, height }])
      setActiveId(id)
    }
    setWhiteoutStart(null)
  }

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  function closePreview() {
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
  }

  function countPendingEdits() {
    return runs.filter((run) => {
      if (!touchedRuns.has(run.id)) return false
      const text = edits[run.id] ?? run.str
      const pos = runPos[run.id]
      const moved = Boolean(
        pos && (Math.abs(pos.x - run.x) > 0.5 || Math.abs(pos.y - run.y) > 0.5),
      )
      return moved || text !== run.str
    }).length
  }

  async function buildEditedPdf() {
    if (!bytes || !doc) throw new Error('No PDF loaded')
    const replacements = runs
      .filter((run) => touchedRuns.has(run.id))
      .filter((run) => {
        const text = edits[run.id] ?? run.str
        const pos = runPos[run.id]
        const moved = Boolean(
          pos && (Math.abs(pos.x - run.x) > 0.5 || Math.abs(pos.y - run.y) > 0.5),
        )
        const textChanged = text !== run.str
        return moved || textChanged
      })
      .map((run) => {
        const look = runLooks[run.id]
        return {
          run,
          newText: edits[run.id] ?? run.str,
          drawX: runPos[run.id]?.x ?? run.x,
          drawY: runPos[run.id]?.y ?? run.y,
          family: look?.family ?? run.family,
          bold: look?.bold ?? run.bold,
          fontSize: look?.fontSize ?? run.fontSize,
          backdrop: backdrops[run.id],
        }
      })
    return applyEdits(
      bytes,
      {
        replacements,
        addedTexts: addedTexts.filter((item) => item.text.trim().length > 0),
        whiteouts,
        images: images.map((image) => ({
          id: image.id,
          pageIndex: image.pageIndex,
          x: image.x,
          y: image.y,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          mime: image.mime,
        })),
      },
      doc,
    )
  }

  async function onPreview() {
    if (!bytes) return
    setBusy(true)
    setError(null)
    try {
      const out = await buildEditedPdf()
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return { url: previewPdfUrl(out), bytes: out }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not render PDF preview')
    } finally {
      setBusy(false)
    }
  }

  function onDownloadFromPreview() {
    if (!preview) return
    downloadPdf(preview.bytes, withPdfName(fileName, 'edited'))
  }

  const selectedAdded = addedTexts.find((item) => item.id === activeId)
  const selectedRun = runs.find((run) => run.id === activeId && !deletedRuns.has(run.id))

  function lookFor(run: PdfTextRun): TextLook {
    return (
      runLooks[run.id] ?? {
        family: run.family,
        bold: run.bold,
        fontSize: run.fontSize,
      }
    )
  }

  function setRunLook(run: PdfTextRun, patch: Partial<TextLook>) {
    setRunLooks((prev) => ({
      ...prev,
      [run.id]: { ...lookFor(run), ...patch },
    }))
  }

  function setRunText(run: PdfTextRun, text: string) {
    if (text !== run.str) markRunTouched(run.id)
    setEdits((prev) => ({ ...prev, [run.id]: text }))
  }

  const pendingEditCount = countPendingEdits()

  return (
    <div>
      <h1 className="text-3xl font-semibold text-slate-900">Edit PDF</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Click existing PDF text to rename it and change font in the panel. Drag the teal handle to
        move. Scanned text cannot be selected — use Add text on top of it.
      </p>

      {!doc && (
        <div className="mt-6">
          <Dropzone onFiles={onFiles} title="Drop a PDF to edit" />
        </div>
      )}

      {doc && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tools.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTool(item.id)
                  if (item.id === 'image') imageInputRef.current?.click()
                }}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  tool === item.id
                    ? 'bg-teal-700 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                const data = new Uint8Array(await file.arrayBuffer())
                const url = URL.createObjectURL(file)
                const img = new Image()
                img.onload = () => {
                  URL.revokeObjectURL(url)
                  setPendingImage({
                    bytes: data,
                    mime: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                    ratio: img.width / img.height || 1,
                  })
                  setTool('image')
                }
                img.src = url
              }}
            />
            <div className="ml-auto flex items-center gap-2">
              <label className="text-sm text-slate-600">
                Zoom
                <input
                  type="range"
                  min={0.7}
                  max={1.8}
                  step={0.05}
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  className="ml-2 align-middle"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  setDoc(null)
                  setBytes(null)
                }}
                className="rounded-full px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
              >
                New file
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onPreview()}
                className="rounded-full bg-teal-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? 'Rendering…' : pendingEditCount > 0 ? `Preview PDF (${pendingEditCount} edit${pendingEditCount === 1 ? '' : 's'})` : 'Preview PDF'}
              </button>
              {selectedRun && (
                <button
                  type="button"
                  onClick={() => removePdfTextRun(selectedRun)}
                  className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white"
                >
                  Remove PDF text
                </button>
              )}
              {selectedAdded && (
                <button
                  type="button"
                  onClick={() => {
                    setAddedTexts((prev) => prev.filter((row) => row.id !== selectedAdded.id))
                    setActiveId(null)
                    setEditingId(null)
                  }}
                  className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium text-white"
                >
                  Remove text box
                </button>
              )}
            </div>
          </div>
          {tool === 'text' && (
            <p className="text-sm text-teal-800">Click the page to place a text box, then drag the handle to move it.</p>
          )}
          {tool === 'select' && (
            <p className="text-sm text-slate-500">
              {runs.length} selectable text pieces on this page. Click to rename, drag to move, or
              press Delete to remove existing PDF text.
            </p>
          )}
          {pendingImage && <p className="text-sm text-teal-800">Click the page to place the image.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {(selectedRun || selectedAdded) && (
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-slate-700">
                  {selectedRun ? 'Rename PDF text' : 'Rename text box'}
                </span>
                <input
                  value={selectedRun ? (edits[selectedRun.id] ?? selectedRun.str) : selectedAdded?.text}
                  onChange={(event) => {
                    if (selectedRun) setRunText(selectedRun, event.target.value)
                    else if (selectedAdded) {
                      const text = event.target.value
                      setAddedTexts((prev) =>
                        prev.map((row) => (row.id === selectedAdded.id ? { ...row, text } : row)),
                      )
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Font</span>
                <select
                  value={selectedRun ? lookFor(selectedRun).family : selectedAdded?.family}
                  onChange={(event) => {
                    const family = event.target.value as FontFamily
                    if (selectedRun) setRunLook(selectedRun, { family })
                    else if (selectedAdded) {
                      setAddedTexts((prev) =>
                        prev.map((row) => (row.id === selectedAdded.id ? { ...row, family } : row)),
                      )
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {FONT_FAMILIES.map((font) => (
                    <option key={font.id} value={font.id}>
                      {font.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-3">
                <label className="block flex-1 text-sm">
                  <span className="font-medium text-slate-700">Size</span>
                  <input
                    type="number"
                    min={6}
                    max={96}
                    value={selectedRun ? lookFor(selectedRun).fontSize : selectedAdded?.fontSize}
                    onChange={(event) => {
                      const fontSize = Number(event.target.value) || 12
                      if (selectedRun) setRunLook(selectedRun, { fontSize })
                      else if (selectedAdded) {
                        setAddedTexts((prev) =>
                          prev.map((row) => (row.id === selectedAdded.id ? { ...row, fontSize } : row)),
                        )
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedRun ? lookFor(selectedRun).bold : Boolean(selectedAdded?.bold)}
                    onChange={(event) => {
                      const bold = event.target.checked
                      if (selectedRun) setRunLook(selectedRun, { bold })
                      else if (selectedAdded) {
                        setAddedTexts((prev) =>
                          prev.map((row) => (row.id === selectedAdded.id ? { ...row, bold } : row)),
                        )
                      }
                    }}
                  />
                  Bold
                </label>
              </div>
              {selectedRun && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <button
                    type="button"
                    onClick={() => removePdfTextRun(selectedRun)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    Remove this PDF text
                  </button>
                </div>
              )}
            </div>
          )}
          <PageFilmstrip
            items={thumbs}
            activeId={String(pageIndex)}
            onSelect={(id) => setPageIndex(Number(id))}
          />
          <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-200/60 p-4">
            <div className="relative inline-block bg-white shadow">
              <canvas ref={canvasRef} className="block" />
              <div
                ref={overlayRef}
                className="absolute inset-0 overflow-visible"
                onPointerDown={onOverlayPointerDown}
                onPointerUp={onOverlayPointerUp}
                style={{
                  cursor:
                    tool === 'whiteout'
                      ? 'crosshair'
                      : tool === 'text' || tool === 'image'
                        ? 'copy'
                        : 'default',
                }}
              >
                {viewport &&
                  runs
                    .filter((run) => deletedRuns.has(run.id))
                    .map((run) => {
                      const fill = backdrops[run.id]
                      const fillCss = fill
                        ? `rgb(${Math.round(fill.r * 255)} ${Math.round(fill.g * 255)} ${Math.round(fill.b * 255)})`
                        : '#fff'
                      return (
                        <div
                          key={`${run.id}-removed`}
                          className="pointer-events-none absolute z-[6]"
                          style={{
                            ...overlayFromTextTransform(viewport, run.transform, run.advanceWidth),
                            backgroundColor: fillCss,
                          }}
                        />
                      )
                    })}
                {viewport &&
                  runs
                    .filter((run) => !deletedRuns.has(run.id))
                    .map((run) => {
                    const pos = runPos[run.id]
                    const moved = Boolean(pos && (Math.abs(pos.x - run.x) > 0.4 || Math.abs(pos.y - run.y) > 0.4))
                    const drawX = pos?.x ?? run.x
                    const drawY = pos?.y ?? run.y
                    const look = lookFor(run)
                    const box = textOverlayBoxFromPdf(
                      viewport,
                      drawX,
                      drawY,
                      look.fontSize,
                      run.advanceWidth,
                    )
                    const styleChanged =
                      look.family !== run.family || look.bold !== run.bold || look.fontSize !== run.fontSize
                    const dirty =
                      moved ||
                      (edits[run.id] !== undefined && edits[run.id] !== run.str) ||
                      Boolean(runLooks[run.id] && styleChanged)
                    const value = edits[run.id] ?? run.str
                    const active = activeId === run.id
                    const editing = editingId === run.id
                    const faceCss = cssFontFamily(look.family)
                    const weight = look.bold ? 700 : 400
                    const fill = backdrops[run.id]
                    const fillCss = fill
                      ? `rgb(${Math.round(fill.r * 255)} ${Math.round(fill.g * 255)} ${Math.round(fill.b * 255)})`
                      : '#fff'
                    const shadowCss = fill?.shadow
                      ? `${fill.shadow.dx * viewport.scale}px ${-fill.shadow.dy * viewport.scale}px ${1.2 * viewport.scale}px rgb(${Math.round(fill.shadow.r * 255)} ${Math.round(fill.shadow.g * 255)} ${Math.round(fill.shadow.b * 255)})`
                      : undefined
                    return (
                      <div key={run.id}>
                        {moved && (
                          <div
                            className="pointer-events-none absolute z-[5]"
                            style={{
                              ...overlayFromTextTransform(viewport, run.transform, run.advanceWidth),
                              backgroundColor: fillCss,
                            }}
                          />
                        )}
                      <div
                        className={`absolute z-10 overflow-visible ${active ? 'z-20' : ''}`}
                        style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                        onPointerDown={(event) => {
                          event.stopPropagation()
                          setActiveId(run.id)
                          if (editingId === run.id) return
                          beginMove('run', run.id, drawX, drawY, event)
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation()
                          setActiveId(run.id)
                          setEditingId(run.id)
                          setTool('select')
                        }}
                      >
                        {dirty && (
                          <div
                            className="pointer-events-none absolute"
                            style={{ left: 0, top: 0, width: '100%', height: '100%', backgroundColor: fillCss }}
                          />
                        )}
                        {active && <Grip />}
                        {active && (
                          <DeleteChip onRemove={() => removePdfTextRun(run)} />
                        )}
                        {editing ? (
                          <input
                            ref={activeInputRef}
                            value={value}
                            title={run.str}
                            onChange={(event) => setRunText(run, event.target.value)}
                            className="relative block h-full w-full appearance-none border border-teal-600 px-0.5 py-0 text-black outline-none"
                            style={{
                              fontSize: box.fontSize,
                              lineHeight: 1,
                              paddingBlock: 0,
                              margin: 0,
                              fontFamily: faceCss,
                              fontWeight: weight,
                              backgroundColor: fillCss,
                              textShadow: shadowCss,
                            }}
                          />
                        ) : (
                          <span
                            className={`relative block h-full w-full overflow-visible whitespace-pre px-0.5 ${
                              active
                                ? 'box-border border border-teal-600 bg-transparent'
                                : 'border border-transparent bg-transparent'
                            } ${dirty ? 'text-black' : 'text-transparent'}`}
                            style={{
                              fontSize: box.fontSize,
                              lineHeight: 1,
                              fontFamily: faceCss,
                              fontWeight: weight,
                              backgroundColor: 'transparent',
                              textShadow: dirty ? shadowCss : undefined,
                            }}
                          >
                            {dirty ? value : ''}
                          </span>
                        )}
                      </div>
                      </div>
                    )
                  })}
                {viewport &&
                  addedTexts
                    .filter((item) => item.pageIndex === pageIndex)
                    .map((item) => {
                      const box = textOverlayBoxFromPdf(
                        viewport,
                        item.x,
                        item.y,
                        item.fontSize,
                        Math.max(item.text.length * item.fontSize * 0.52, item.fontSize * 0.45),
                      )
                      const active = activeId === item.id
                      const editing = editingId === item.id
                      const width = Math.max(box.width, 48)
                      return (
                        <div
                          key={item.id}
                          className="absolute z-20 overflow-visible"
                          style={{
                            left: box.left,
                            top: box.top,
                            width,
                            height: box.height,
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation()
                            setActiveId(item.id)
                            if (editingId === item.id) return
                            beginMove('added', item.id, item.x, item.y, event)
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation()
                            setEditingId(item.id)
                          }}
                        >
                          {active && <Grip />}
                          {active && (
                            <DeleteChip
                              onRemove={() => {
                                setAddedTexts((prev) => prev.filter((row) => row.id !== item.id))
                                setActiveId(null)
                                setEditingId(null)
                              }}
                            />
                          )}
                          <input
                            ref={editing ? activeInputRef : undefined}
                            value={item.text}
                            readOnly={!editing}
                            onChange={(event) =>
                              setAddedTexts((prev) =>
                                prev.map((row) =>
                                  row.id === item.id ? { ...row, text: event.target.value } : row,
                                ),
                              )
                            }
                            className={`block h-full w-full appearance-none px-1 py-0 outline-none ${
                              editing ? '' : 'pointer-events-none '
                            }${
                              active || editing
                                ? 'border border-teal-600 bg-white text-black'
                                : 'border-0 bg-transparent text-black'
                            }`}
                            style={{
                              fontSize: box.fontSize,
                              lineHeight: 1,
                              paddingBlock: 0,
                              margin: 0,
                              overflow: 'visible',
                              boxSizing: 'border-box',
                              backgroundColor: active || editing ? '#fff' : 'transparent',
                              fontFamily: cssFontFamily(item.family),
                              fontWeight: item.bold ? 700 : 400,
                            }}
                          />
                        </div>
                      )
                    })}
                {viewport &&
                  whiteouts
                    .filter((item) => item.pageIndex === pageIndex)
                    .map((item) => {
                      const box = viewportBox(viewport, item.x, item.y, item.width, item.height)
                      const active = activeId === item.id
                      return (
                        <div
                          key={item.id}
                          className={`absolute z-10 bg-white ${active ? 'ring-2 ring-teal-600' : 'ring-1 ring-slate-300'}`}
                          style={box}
                          onPointerDown={(event) => {
                            beginMove('whiteout', item.id, item.x, item.y, event)
                          }}
                        >
                          {active && (
                            <DeleteChip
                              onRemove={() => {
                                setWhiteouts((prev) => prev.filter((row) => row.id !== item.id))
                                setActiveId(null)
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                {viewport &&
                  images
                    .filter((item) => item.pageIndex === pageIndex)
                    .map((item) => {
                      const box = viewportBox(viewport, item.x, item.y, item.width, item.height)
                      const active = activeId === item.id
                      return (
                        <div
                          key={item.id}
                          className={`absolute z-10 cursor-grab ${active ? 'ring-2 ring-teal-600' : ''}`}
                          style={box}
                          onPointerDown={(event) => {
                            beginMove('image', item.id, item.x, item.y, event)
                          }}
                        >
                          {active && (
                            <DeleteChip
                              onRemove={() => {
                                URL.revokeObjectURL(item.previewUrl)
                                setImages((prev) => prev.filter((row) => row.id !== item.id))
                                setActiveId(null)
                              }}
                            />
                          )}
                          <img src={item.previewUrl} alt="" className="pointer-events-none h-full w-full object-contain" />
                        </div>
                      )
                    })}
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">PDF preview</h2>
                <p className="text-sm text-slate-600">
                  Check rupee symbols and layout here before downloading.
                  {pendingEditCount > 0
                    ? ` Only ${pendingEditCount} text field${pendingEditCount === 1 ? ' was' : 's were'} changed.`
                    : ' No text fields were changed.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-full px-4 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Back to edit
                </button>
                <button
                  type="button"
                  onClick={onDownloadFromPreview}
                  className="rounded-full bg-teal-700 px-4 py-1.5 text-sm font-medium text-white"
                >
                  Download PDF
                </button>
              </div>
            </div>
            <iframe
              title="PDF preview"
              src={preview.url}
              className="min-h-[70vh] w-full flex-1 bg-slate-100"
            />
          </div>
        </div>
      )}
    </div>
  )
}
