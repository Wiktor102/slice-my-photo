import { useLayoutEffect, useRef, useState } from 'react'
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from 'react-konva'
import type { DesignVariant, SourceImage } from '../types'
import { frameHex, matHex } from '../lib/frameColors'
import { panelGeometry, resolveFrame } from '../lib/geometry'
import { computeImagePlacement } from '../store/useStore'

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
  const wallScale = Math.max(0.05, Math.min((size.w - 28) / variant.wall.width, (size.h - 28) / variant.wall.height))
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
              shadowColor="#000000"
              shadowBlur={16 / wallScale}
              shadowOffset={{ x: 0, y: 5 / wallScale }}
              shadowOpacity={0.3}
            />
            {variant.panels.map((panel) => {
              const panelFrame = resolveFrame(panel, variant.frame, variant.perPanelFrame)
              const geom = panelGeometry(panel, panelFrame)
              const mat = panelFrame.passepartout
              const edge = panelFrame.edgeWidth
              const visibleX = geom.visible.x - geom.outer.x
              const visibleY = geom.visible.y - geom.outer.y
              const cropX = ((geom.visible.x - placement.panX) / placement.scale) * (imageEl ? imageEl.naturalWidth / sourceImage.nativeWidth : 1)
              const cropY = ((geom.visible.y - placement.panY) / placement.scale) * (imageEl ? imageEl.naturalHeight / sourceImage.nativeHeight : 1)
              const cropW = (geom.visible.w / placement.scale) * (imageEl ? imageEl.naturalWidth / sourceImage.nativeWidth : 1)
              const cropH = (geom.visible.h / placement.scale) * (imageEl ? imageEl.naturalHeight / sourceImage.nativeHeight : 1)
              return (
                <Group key={panel.id} x={geom.outer.x} y={geom.outer.y}>
                  <Rect
                    width={geom.outer.w}
                    height={geom.outer.h}
                    fill={frameHex(panelFrame.colorKey, panelFrame.customColor)}
                    shadowColor="#000000"
                    shadowBlur={panelFrame.shadow ? 8 / wallScale : 0}
                    shadowOffset={{ x: 0, y: panelFrame.shadow ? 3 / wallScale : 0 }}
                    shadowOpacity={panelFrame.shadow ? 0.34 : 0}
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
                  {imageEl && (
                    <KonvaImage
                      image={imageEl}
                      x={visibleX}
                      y={visibleY}
                      width={geom.visible.w}
                      height={geom.visible.h}
                      crop={{ x: cropX, y: cropY, width: cropW, height: cropH }}
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
