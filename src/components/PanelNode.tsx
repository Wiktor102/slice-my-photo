import { useEffect, useRef } from 'react'
import { Group, Rect, Transformer, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import type { Panel, PerPanelFrame, SourceImage } from '../types'
import { panelGeometry } from '../lib/geometry'
import { computeSnaps } from '../lib/geometry'
import { frameHex, matHex } from '../lib/frameColors'
import { useStore } from '../store/useStore'
import type { SnapLines } from '../types'

interface Props {
  panel: Panel
  frame: PerPanelFrame
  selected: boolean
  image: HTMLImageElement | undefined
  sourceImage: SourceImage | null
  scale: number
  panX: number
  panY: number
  others: { panel: Panel; frame: PerPanelFrame }[]
  viewportScale: number
  showLabel: boolean
  setSnapLines: (s: SnapLines | null) => void
  setTip: (t: string | null) => void
}

export function PanelNode({
  panel, frame, selected, image, sourceImage, scale, panX, panY, others, viewportScale, showLabel, setSnapLines, setTip,
}: Props) {
  const groupRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const setPanelOuterPosition = useStore((s) => s.setPanelOuterPosition)
  const setPanelSize = useStore((s) => s.setPanelSize)
  const selectPanel = useStore((s) => s.selectPanel)

  const geom = panelGeometry(panel, frame)
  const outer = geom.outer
  const inner = geom.inner
  const visible = geom.visible
  const e = frame.edgeWidth
  const mat = frame.passepartout
  const frameColor = frameHex(frame.colorKey, frame.customColor)
  const matColor = matHex(mat.colorKey, mat.customColor)

  useEffect(() => {
    const tr = trRef.current
    const node = groupRef.current
    if (tr && node) {
      if (selected) {
        tr.nodes([node])
        tr.forceUpdate()
        tr.getLayer()?.batchDraw()
      } else {
        tr.nodes([])
      }
    }
  }, [selected, outer.x, outer.y, outer.w, outer.h])

  const handleDragMove = (ev: Konva.KonvaEventObject<DragEvent>) => {
    const node = ev.target as Konva.Group
    let ox = node.x()
    let oy = node.y()
    const movingPanel: Panel = { ...panel, x: ox + e, y: oy + e }
    const { snap, offsetX, offsetY } = computeSnaps(movingPanel, frame, others, viewportScale)
    ox += offsetX
    oy += offsetY
    const wall = useStore.getState().wall
    ox = Math.max(0, Math.min(ox, wall.width - outer.w))
    oy = Math.max(0, Math.min(oy, wall.height - outer.h))
    node.x(ox)
    node.y(oy)
    setSnapLines(snap)
    setTip(`X ${Math.round(ox * 10) / 10}, Y ${Math.round(oy * 10) / 10}`)
    setPanelOuterPosition(panel.id, ox, oy)
  }

  const handleDragEnd = () => {
    setSnapLines(null)
    setTip(null)
  }

  const handleTransform = () => {
    const node = groupRef.current
    if (!node) return
    const sx = node.scaleX()
    const sy = node.scaleY()
    const newOuterW = outer.w * sx
    const newOuterH = outer.h * sy
    const newInnerW = Math.max(10, newOuterW - 2 * e)
    const newInnerH = Math.max(10, newOuterH - 2 * e)
    setTip(`${Math.round(newInnerW * 10) / 10} × ${Math.round(newInnerH * 10) / 10}`)
  }

  const handleTransformEnd = () => {
    const node = groupRef.current
    if (!node) return
    const sx = node.scaleX()
    const sy = node.scaleY()
    const newOuterX = node.x()
    const newOuterY = node.y()
    const newOuterW = Math.max(10 + 2 * e, outer.w * sx)
    const newOuterH = Math.max(10 + 2 * e, outer.h * sy)
    const newInnerW = newOuterW - 2 * e
    const newInnerH = newOuterH - 2 * e
    node.scaleX(1)
    node.scaleY(1)
    const newInnerX = newOuterX + e
    const newInnerY = newOuterY + e
    setPanelSize(panel.id, newInnerW, newInnerH, 'custom')
    setPanelOuterPosition(panel.id, newOuterX, newOuterY)
    // correct inner position if clamping moved outer
    void newInnerX
    void newInnerY
    setTip(null)
  }

  // source-pixel crop for the visible region
  const previewScaleX = image && sourceImage ? image.naturalWidth / sourceImage.nativeWidth : 1
  const previewScaleY = image && sourceImage ? image.naturalHeight / sourceImage.nativeHeight : 1
  const cropX = ((visible.x - panX) / scale) * previewScaleX
  const cropY = ((visible.y - panY) / scale) * previewScaleY
  const cropW = (visible.w / scale) * previewScaleX
  const cropH = (visible.h / scale) * previewScaleY
  const visLocalX = visible.x - outer.x
  const visLocalY = visible.y - outer.y

  return (
    <>
      <Group
        ref={groupRef}
        x={outer.x}
        y={outer.y}
        draggable
        onMouseDown={() => selectPanel(panel.id)}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
      >
        <Rect
          x={0}
          y={0}
          width={outer.w}
          height={outer.h}
          fill={frameColor}
          shadow={frame.shadow ? 'black' : undefined}
          shadowBlur={frame.shadow ? 18 : 0}
          shadowOffset={{ x: 0, y: 6 }}
          shadowOpacity={frame.shadow ? 0.35 : 0}
          shadowForStrokeEnabled={false}
        />
        {mat.enabled && (
          <Rect x={e} y={e} width={inner.w} height={inner.h} fill={matColor} />
        )}
        <Rect x={visLocalX} y={visLocalY} width={visible.w} height={visible.h} fill="#ffffff" listening={false} />
        {image && (
          <KonvaImage
            image={image}
            x={visLocalX}
            y={visLocalY}
            width={visible.w}
            height={visible.h}
            crop={{ x: cropX, y: cropY, width: cropW, height: cropH }}
            listening={false}
          />
        )}
        {showLabel && (
          <Rect
            x={outer.w / 2 - 12}
            y={outer.h / 2 - 12}
            width={24}
            height={24}
            fill="rgba(0,0,0,0.45)"
            cornerRadius={12}
            listening={false}
          />
        )}
      </Group>
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio={!!panel.lockAspect}
          borderStroke="#4a7dff"
          borderStrokeWidth={1.5}
          anchorStroke="#4a7dff"
          anchorFill="#ffffff"
          anchorSize={9}
          anchorCornerRadius={2}
          flipEnabled={false}
          boundBoxFunc={(oldBox, newBox) => {
            const minOuterScreen = (10 + 2 * e) * viewportScale
            if (newBox.width < minOuterScreen || newBox.height < minOuterScreen) return oldBox
            return newBox
          }}
        />
      )}
    </>
  )
}
