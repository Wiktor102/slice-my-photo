import type { Rect, SourceImage } from '../types'

/**
 * The image may be smaller than a visible panel opening in fit mode, or
 * shifted partly outside it in manual mode. Return only the source portion
 * that actually covers the opening so the caller can leave the rest of its
 * white backing visible.
 */
export interface ImageCropPlacement {
  x: number
  y: number
  width: number
  height: number
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
}

export function imageCropPlacement(
  visible: Rect,
  panX: number,
  panY: number,
  scale: number,
  sourceImage: Pick<SourceImage, 'nativeWidth' | 'nativeHeight'>,
  renderedWidth: number,
  renderedHeight: number,
): ImageCropPlacement | null {
  if (!(scale > 0) || !(sourceImage.nativeWidth > 0) || !(sourceImage.nativeHeight > 0)) return null
  if (!(renderedWidth > 0) || !(renderedHeight > 0)) return null

  const imageRight = panX + sourceImage.nativeWidth * scale
  const imageBottom = panY + sourceImage.nativeHeight * scale
  const visibleRight = visible.x + visible.w
  const visibleBottom = visible.y + visible.h
  const x = Math.max(visible.x, panX)
  const y = Math.max(visible.y, panY)
  const right = Math.min(visibleRight, imageRight)
  const bottom = Math.min(visibleBottom, imageBottom)
  if (right <= x || bottom <= y) return null

  const width = right - x
  const height = bottom - y
  const sourceScaleX = renderedWidth / sourceImage.nativeWidth
  const sourceScaleY = renderedHeight / sourceImage.nativeHeight

  return {
    x,
    y,
    width,
    height,
    cropX: ((x - panX) / scale) * sourceScaleX,
    cropY: ((y - panY) / scale) * sourceScaleY,
    cropWidth: (width / scale) * sourceScaleX,
    cropHeight: (height / scale) * sourceScaleY,
  }
}
