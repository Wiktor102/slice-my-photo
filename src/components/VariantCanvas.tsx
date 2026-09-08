import { useLayoutEffect, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import type { DesignVariant, SourceImage } from '../types'
import { frameHex, matHex } from '../lib/frameColors'
import { panelGeometry, resolveFrame } from '../lib/geometry'
import { computeImagePlacement } from '../store/useStore'
import { imageCropPlacement } from '../lib/imageCrop'
import { PANEL_SHADOW_BLUR_MM, PANEL_SHADOW_OFFSET_Y_MM } from '../lib/units'

interface Props {
  variant: DesignVariant
  sourceImage: SourceImage
  imageEl?: HTMLImageElement
}

const MIN_CANVAS = { w: 420, h: 250 }

/**
 * A read-only Konva renderer for saved variants. It deliberately receives all
 * state as props and never selects or writes the live editor store.
 */
export function VariantCanvas({ variant, sourceImage, imageEl }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(MIN_CANVAS)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const resize = () => {
      setSize({
        w: Math.max(1, host.clientWidth),
        h: Math.max(1, host.clientHeight),
      })
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()
    return () => observer.disconnect()
  }, [])

  const placement = computeImagePlacement(
    variant.panels,
    variant.frame,
    variant.perPanelFrame,
    variant.image,
    sourceImage,
  )
  const wallScale = Math.min(
    Math.max(1, size.w - 28) / variant.wall.width,
    Math.max(1, size.h - 28) / variant.wall.height,
  )
  const wallX = (size.w - variant.wall.width * wallScale) / 2
  const wallY = (size.h - variant.wall.height * wallScale) / 2

  return (
    <div ref={hostRef} className="variant-canvas">
      <Stage width={size.w} height={size.h}>
        <Layer>
          <Rect width={size.w} height={size.h} fill="#111114" />
          <Group x={wallX} y={wallY} scaleX={wallScale} scaleY={wallScale}>
            <Rect
              width={variant.wall.width}
              height={variant.wall.height}
              fill={variant.wall.color}
            />
            {variant.panels.map((panel) => {
              const panelFrame = resolveFrame(panel, variant.frame, variant.perPanelFrame)
              const geom = panelGeometry(panel, panelFrame)
              const mat = panelFrame.passepartout
              const edge = panelFrame.edgeWidth
              const visibleX = geom.visible.x - geom.outer.x
              const visibleY = geom.visible.y - geom.outer.y
              const imageCrop = imageEl
                ? imageCropPlacement(
                  geom.visible,
                  placement.panX,
                  placement.panY,
                  placement.scale,
                  sourceImage,
                  imageEl.naturalWidth,
                  imageEl.naturalHeight,
                )
                : null
              return (
                <Group key={panel.id} x={geom.outer.x} y={geom.outer.y}>
                  <Rect
                    width={geom.outer.w}
                    height={geom.outer.h}
                    fill={frameHex(panelFrame.colorKey, panelFrame.customColor)}
                    shadowColor="#000000"
                    shadowBlur={panelFrame.shadow ? PANEL_SHADOW_BLUR_MM : 0}
                    shadowOffset={{ x: 0, y: panelFrame.shadow ? PANEL_SHADOW_OFFSET_Y_MM : 0 }}
                    shadowOpacity={panelFrame.shadow ? 0.35 : 0}
                  />
                  {mat.enabled && (
                    <Rect
                      x={edge}
                      y={edge}
                      width={geom.inner.w}
                      height={geom.inner.h}
                      fill={matHex(mat.colorKey, mat.customColor)}
                    />
                  )}
                  <Rect
                    x={visibleX}
                    y={visibleY}
                    width={geom.visible.w}
                    height={geom.visible.h}
                    fill="#ffffff"
                  />
                  {imageEl && imageCrop && (
                    <KonvaImage
                      image={imageEl}
                      x={imageCrop.x - geom.outer.x}
                      y={imageCrop.y - geom.outer.y}
                      width={imageCrop.width}
                      height={imageCrop.height}
                      crop={{ x: imageCrop.cropX, y: imageCrop.cropY, width: imageCrop.cropWidth, height: imageCrop.cropHeight }}
                    />
                  )}
                </Group>
              )
            })}
            {!imageEl && (
              <Text
                x={variant.wall.width / 2 - 48}
                y={variant.wall.height / 2 - 8}
                text="Loading image…"
                fontSize={10 / wallScale}
                fill="rgba(0,0,0,0.55)"
              />
            )}
          </Group>
        </Layer>
      </Stage>
    </div>
  )
}
