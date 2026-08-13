import {
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  decodePDFRawStream,
} from 'pdf-lib'
import { toArrayBuffer } from './load'

export type CompressResult = {
  bytes: Uint8Array
  imagesTouched: number
  originalBytes: number
  compressedBytes: number
}

function filterNames(dict: PDFDict): string[] {
  const filter = dict.get(PDFName.of('Filter'))
  if (!filter) return []
  if (filter instanceof PDFName) return [filter.asString()]
  if (filter instanceof PDFArray) {
    const names: string[] = []
    for (let i = 0; i < filter.size(); i += 1) {
      const item = filter.get(i)
      if (item instanceof PDFName) names.push(item.asString())
    }
    return names
  }
  return []
}

function dictNumber(dict: PDFDict, key: string): number | undefined {
  const value = dict.get(PDFName.of(key))
  if (value instanceof PDFNumber) return value.asNumber()
  return undefined
}

async function jpegFromCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Could not encode JPEG'))
          return
        }
        void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)))
      },
      'image/jpeg',
      quality,
    )
  })
}

async function recompressJpeg(bytes: Uint8Array, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(
    new Blob([toArrayBuffer(bytes)], { type: 'image/jpeg' }),
  )
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Could not create canvas context')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return jpegFromCanvas(canvas, quality)
}

async function rgbToJpeg(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 1 | 3,
  quality: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')
  const imageData = ctx.createImageData(width, height)
  const out = imageData.data
  if (channels === 1) {
    for (let i = 0, j = 0; i < pixels.length && j < out.length; i += 1, j += 4) {
      const v = pixels[i] ?? 0
      out[j] = v
      out[j + 1] = v
      out[j + 2] = v
      out[j + 3] = 255
    }
  } else {
    for (let i = 0, j = 0; i + 2 < pixels.length && j < out.length; i += 3, j += 4) {
      out[j] = pixels[i] ?? 0
      out[j + 1] = pixels[i + 1] ?? 0
      out[j + 2] = pixels[i + 2] ?? 0
      out[j + 3] = 255
    }
  }
  ctx.putImageData(imageData, 0, 0)
  return jpegFromCanvas(canvas, quality)
}

export async function compressPdf(
  source: Uint8Array,
  quality: number,
): Promise<CompressResult> {
  const pdf = await PDFDocument.load(source)
  let imagesTouched = 0

  for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const { dict } = obj
    if (dict.get(PDFName.of('Subtype')) !== PDFName.of('Image')) continue
    if (dict.get(PDFName.of('ImageMask')) === PDFBool.True) continue

    const width = dictNumber(dict, 'Width')
    const height = dictNumber(dict, 'Height')
    const bpc = dictNumber(dict, 'BitsPerComponent') ?? 8
    if (!width || !height || bpc !== 8) continue

    const filters = filterNames(dict)
    const colorSpace = dict.get(PDFName.of('ColorSpace'))
    let jpeg: Uint8Array | null = null

    try {
      if (filters.includes('/DCTDecode') && filters.length === 1) {
        jpeg = await recompressJpeg(obj.getContents(), quality)
      } else if (
        (filters.length === 0 || filters.includes('/FlateDecode')) &&
        (colorSpace === PDFName.of('DeviceRGB') || colorSpace === PDFName.of('DeviceGray'))
      ) {
        const decoded = decodePDFRawStream(obj).decode()
        const channels = colorSpace === PDFName.of('DeviceGray') ? 1 : 3
        jpeg = await rgbToJpeg(decoded, width, height, channels, quality)
      }
    } catch {
      jpeg = null
    }

    if (!jpeg) continue

    dict.set(PDFName.of('Length'), PDFNumber.of(jpeg.length))
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
    dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
    dict.delete(PDFName.of('DecodeParms'))
    dict.delete(PDFName.of('DecodeParm'))
    pdf.context.assign(ref, PDFRawStream.of(dict, jpeg))
    imagesTouched += 1
  }

  const bytes = await pdf.save({ useObjectStreams: true })
  return {
    bytes,
    imagesTouched,
    originalBytes: source.byteLength,
    compressedBytes: bytes.byteLength,
  }
}
