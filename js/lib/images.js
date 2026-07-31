/**
 * Phone ki camera se aayi tasveer 3-5 MB ki hoti hai.
 *
 * Hum tasveer ko Firestore ke document me hi (base64 data URL ke tor par)
 * rakhte hain, kyunki Firebase Storage naye projects me credit card maangta
 * hai. Firestore ke ek document ki hadd 1 MB hai — isliye tasveer ko chhota
 * kar ke ~60 KB tak laate hain, jo is hadd se bohat neeche hai.
 */
const MAX_DIMENSION = 640
const TARGET_BYTES = 70 * 1024
const QUALITY_STEPS = [0.7, 0.55, 0.4, 0.3]

export async function compressImage(file, maxDimension = MAX_DIMENSION) {
  const bitmap = await loadBitmap(file)
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context nahi mila')
  ctx.drawImage(bitmap, 0, 0, width, height)
  if (bitmap.close) bitmap.close()

  const type = supportsWebp() ? 'image/webp' : 'image/jpeg'

  // Quality ghatate jao jab tak size hadd me na aa jaye.
  let dataUrl = ''
  for (const quality of QUALITY_STEPS) {
    dataUrl = canvas.toDataURL(type, quality)
    if (dataUrlBytes(dataUrl) <= TARGET_BYTES) break
  }
  return dataUrl
}

/** Base64 string ka asal size (data URL ka header nikaal kar). */
export function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Math.ceil((base64.length * 3) / 4)
}

async function loadBitmap(file) {
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
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image load nahi hui'))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function fitWithin(w, h, max) {
  if (w <= max && h <= max) return { width: w, height: h }
  const scale = max / Math.max(w, h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

let webpSupport = null
function supportsWebp() {
  if (webpSupport !== null) return webpSupport
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  webpSupport = canvas.toDataURL('image/webp').startsWith('data:image/webp')
  return webpSupport
}
