import type { SourceImage } from '../types'

export const PROXY_MAX = 2048
export const MAX_FULL_DATA_URL_MB = 8

/** Check whether a full-res data URL fits the persistence budget for IndexedDB. */
export function isPersistable(dataUrl: string): boolean {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return (base64.length * 3) / 4 <= MAX_FULL_DATA_URL_MB * 1024 * 1024
}

export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

export function megapixels(w: number, h: number): number {
  return (w * h) / 1_000_000
}

/**
 * Generate a downscaled proxy image as a data URL and a full-res data URL.
 * Data URLs are used so they can be persisted to IndexedDB across sessions.
 */
export async function buildImageBlobs(
  file: File,
  proxyMax = PROXY_MAX,
): Promise<{ proxyUrl: string; fullUrl: string; nativeWidth: number; nativeHeight: number }> {
  const fullUrl = await readAsDataURL(file)
  const dims = await readImageDimensions(file)
  const proxyUrl = await makeProxy(fullUrl, dims.width, dims.height, proxyMax)
  return { proxyUrl, fullUrl, nativeWidth: dims.width, nativeHeight: dims.height }
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function makeProxy(fullUrl: string, w: number, h: number, proxyMax: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const longest = Math.max(w, h)
      if (longest <= proxyMax) {
        resolve(fullUrl)
        return
      }
      const scale = proxyMax / longest
      const pw = Math.round(w * scale)
      const ph = Math.round(h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = pw
      canvas.height = ph
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(fullUrl)
        return
      }
      ctx.drawImage(img, 0, 0, pw, ph)
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.9))
      } catch {
        resolve(fullUrl)
      }
    }
    img.onerror = () => reject(new Error('Could not generate proxy'))
    img.src = fullUrl
  })
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = src
  })
}

export function buildSourceImage(
  file: File,
  nativeWidth: number,
  nativeHeight: number,
  proxyUrl: string,
  fullUrl: string,
): SourceImage {
  return {
    name: file.name,
    nativeWidth,
    nativeHeight,
    proxyUrl,
    fullUrl,
    proxyMax: PROXY_MAX,
  }
}
