import { useEffect, useRef } from 'react'
import { Group, Rect, Transformer, Text, Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import type { Panel, PerPanelFrame, SourceImage } from '../types'
import { clampOuterPosition, panelGeometry, computeSnaps } from '../lib/geometry'
import { frameHex, matHex } from '../lib/frameColors'
import { useStore } from '../store/useStore'
import type { SnapLines } from '../types'
import { formatMeasurement, MIN_PANEL_SIZE_MM, PANEL_SHADOW_BLUR_MM, PANEL_SHADOW_OFFSET_Y_MM } from '../lib/units'

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
  panelNumber: number
  interactive: boolean
  setSnapLines: (s: SnapLines | null) => void
  setTip: (t: string | null) => void
}

export function PanelNode({
  panel, frame, selected, image, sourceImage, scale, panX, panY, others, viewportScale, showLabel, panelNumber, interactive, setSnapLines, setTip,
}: Props) {
  const groupRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const setPanelOuterPosition = useStore((s) => s.setPanelOuterPosition)
  const setPanelSize = useStore((s) => s.setPanelSize)
  const selectPanel = useStore((s) => s.selectPanel)
  const beginHistoryGroup = useStore((s) => s.beginHistoryGroup)
  const endHistoryGroup = useStore((s) => s.endHistoryGroup)

  const geom = panelGeometry(panel, frame)
  const outer = geom.outer
  const inner = geom.inner
  const visible = geom.visible
  const e = frame.edgeWidth
  const mat = frame.passepartout
  const frameColor = frameHex(frame.colorKey, frame.customColor)
  const matColor = matHex(mat.colorKey, mat.customColor)

  const handleSelect = () => {
    if (interactive) selectPanel(panel.id)
  }

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
    const st = useStore.getState()
    const res = computeSnaps({
      moving: movingPanel,
      movingFrame: frame,
      others,
      screenScale: viewportScale,
      wall: st.wall,
      gapSnapEnabled: st.gapSnapEnabled,
      fallbackGap: st.gap,
    })
    ox += res.offsetX
    oy += res.offsetY
    const wall = st.wall
    ox = clampOuterPosition(ox, outer.w, wall.width)
    oy = clampOuterPosition(oy, outer.h, wall.height)
    node.x(ox)
    node.y(oy)
    setSnapLines({ vertical: res.vertical, horizontal: res.horizontal })
    const unit = st.unit
    const parts: string[] = [`X ${formatMeasurement(ox, unit, 1)}, Y ${formatMeasurement(oy, unit, 1)}`]
    const fmtGap = (g: number) => formatMeasurement(g, unit, 1)
    if (res.kindX === 'gap' && res.gapX != null) parts.push(`gap ${fmtGap(res.gapX)} ${unit}`)
    else if (res.kindX === 'mid') parts.push('centered')
    if (res.kindY === 'gap' && res.gapY != null) parts.push(`gap ${fmtGap(res.gapY)} ${unit}`)
    else if (res.kindY === 'mid') parts.push('centered')
    setTip(parts.join(' · '))
    setPanelOuterPosition(panel.id, ox, oy)
  }

  const handleDragStart = () => {
    beginHistoryGroup()
  }

  const handleDragEnd = () => {
    setSnapLines(null)
    setTip(null)
    endHistoryGroup()
  }

  const handleTransformStart = () => {
    beginHistoryGroup()
  }

  const handleTransform = () => {
    const node = groupRef.current
    if (!node) return
    const sx = node.scaleX()
    const sy = node.scaleY()
    const newOuterW = outer.w * sx
    const newOuterH = outer.h * sy
    const newInnerW = Math.max(MIN_PANEL_SIZE_MM, newOuterW - 2 * e)
    const newInnerH = Math.max(MIN_PANEL_SIZE_MM, newOuterH - 2 * e)
    const displayUnit = panel.displayUnit ?? useStore.getState().unit
    setTip(`${formatMeasurement(newInnerW, displayUnit)} × ${formatMeasurement(newInnerH, displayUnit)} ${displayUnit}`)
  }

  const handleTransformEnd = () => {
    const node = groupRef.current
    if (!node) return
    const sx = node.scaleX()
    const sy = node.scaleY()
    const newOuterX = node.x()
    const newOuterY = node.y()
    const newOuterW = Math.max(MIN_PANEL_SIZE_MM + 2 * e, outer.w * sx)
    const newOuterH = Math.max(MIN_PANEL_SIZE_MM + 2 * e, outer.h * sy)
    const newInnerW = newOuterW - 2 * e
    const newInnerH = newOuterH - 2 * e
    node.scaleX(1)
    node.scaleY(1)
    setPanelSize(panel.id, newInnerW, newInnerH, 'custom')
    setPanelOuterPosition(panel.id, newOuterX, newOuterY)
    setTip(null)
    endHistoryGroup()
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
        draggable={interactive}
        onMouseDown={interactive ? handleSelect : undefined}
        onDragStart={interactive ? handleDragStart : undefined}
        onDragMove={interactive ? handleDragMove : undefined}
        onDragEnd={interactive ? handleDragEnd : undefined}
        onTransformStart={interactive ? handleTransformStart : undefined}
        onTransform={interactive ? handleTransform : undefined}
        onTransformEnd={interactive ? handleTransformEnd : undefined}
      >
        <Rect
          x={0}
          y={0}
          width={outer.w}
          height={outer.h}
          fill={frameColor}
          shadow={frame.shadow ? 'black' : undefined}
          shadowBlur={frame.shadow ? PANEL_SHADOW_BLUR_MM : 0}
          shadowOffset={{ x: 0, y: PANEL_SHADOW_OFFSET_Y_MM }}
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
          <Group listening={false}>
            <Rect
              x={outer.w / 2 - 12}
              y={outer.h / 2 - 12}
              width={24}
              height={24}
              fill="rgba(0,0,0,0.45)"
              cornerRadius={12}
            />
            <Text
              x={outer.w / 2 - 12}
              y={outer.h / 2 - 12}
              width={24}
              height={24}
              text={String(panelNumber)}
              align="center"
              verticalAlign="middle"
              fontSize={12}
              fontStyle="bold"
              fill="#ffffff"
            />
          </Group>
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
            const minOuterScreen = (MIN_PANEL_SIZE_MM + 2 * e) * viewportScale
            if (newBox.width < minOuterScreen || newBox.height < minOuterScreen) return oldBox
            return newBox
          }}
        />
      )}
    </>
  )
}
