/**
 * Phone ki camera se aayi tasveer 3-5 MB ki hoti hai. Usay IndexedDB me waise
 * rakhna storage quota jaldi khatam kar deta hai, isliye har image ko resize
 * kar ke JPEG/WebP me compress karte hain.
 */
const MAX_DIMENSION = 800
const QUALITY = 0.75

export interface CompressResult {
  blob: Blob
  width: number
  height: number
}

export async function compressImage(
  file: File | Blob,
  maxDimension = MAX_DIMENSION,
): Promise<CompressResult> {
  const bitmap = await loadBitmap(file)
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context nahi mila')
  ctx.drawImage(bitmap, 0, 0, width, height)
  if ('close' in bitmap) bitmap.close()

  const type = supportsWebp() ? 'image/webp' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, QUALITY),
  )
  if (!blob) throw new Error('Image compress nahi ho saki')
  return { blob, width, height }
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // EXIF rotation ka khayal — warna phone ki tasveer ulti aati hai.
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Neeche wale fallback par chale jao.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image load nahi hui'))
      img.src = url
    })
  } finally {
    // Image decode ho chuki hai, URL ab zaroori nahi.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function fitWithin(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h }
  const scale = max / Math.max(w, h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

let webpSupport: boolean | null = null
function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  return webpSupport
}

export function newImageId(): string {
  return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return await res.blob()
}
