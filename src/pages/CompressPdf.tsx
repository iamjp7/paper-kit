import { useCallback, useState } from 'react'
import Dropzone from '../components/Dropzone'
import { compressPdf } from '../lib/pdf/compress'
import { downloadPdf, formatBytes, readPdfBytes, withPdfName } from '../lib/pdf/load'

export default function CompressPdf() {
  const [fileName, setFileName] = useState('')
  const [bytes, setBytes] = useState<Uint8Array | null>(null)
  const [quality, setQuality] = useState(0.65)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFiles = useCallback(async (files: File[]) => {
    const file = files[0]
    if (!file) return
    setError(null)
    setMessage(null)
    setFileName(file.name)
    setBytes(await readPdfBytes(file))
  }, [])

  async function onCompress() {
    if (!bytes) return
    setBusy(true)
    setError(null)
    try {
      const result = await compressPdf(bytes, quality)
      if (result.imagesTouched === 0) {
        setMessage('No compressible raster images were found. The file may already be small or mostly vector text.')
      } else {
        setMessage(
          `Recompressed ${result.imagesTouched} image${result.imagesTouched === 1 ? '' : 's'}: ${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}.`,
        )
      }
      downloadPdf(result.bytes, withPdfName(fileName, 'compressed'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compress PDF')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold text-slate-900">Compress PDF</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Recompress JPEG and RGB images inside the file. Vector text stays as text.
      </p>
      {!bytes && (
        <div className="mt-6">
          <Dropzone onFiles={onFiles} title="Drop a PDF to compress" />
        </div>
      )}
      {bytes && (
        <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-700">
            {fileName} · {formatBytes(bytes.byteLength)}
          </p>
          <label className="block text-sm text-slate-600">
            Image quality ({Math.round(quality * 100)}%)
            <input
              type="range"
              min={0.4}
              max={0.9}
              step={0.05}
              value={quality}
              onChange={(event) => setQuality(Number(event.target.value))}
              className="mt-2 block w-full max-w-md"
            />
          </label>
          {message && <p className="text-sm text-slate-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCompress()}
              className="rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Compressing…' : 'Download compressed PDF'}
            </button>
            <button
              type="button"
              onClick={() => {
                setBytes(null)
                setMessage(null)
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
