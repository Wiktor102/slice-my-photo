import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Layer, Line, Rect, Stage, Text, Image as KonvaImage, Group } from 'react-konva'
import type Konva from 'konva'
import { useStore, useImagePlacement } from '../store/useStore'
import { loadImage } from '../lib/imageUtils'
import { resolveFrame } from '../lib/geometry'
import { PanelNode } from './PanelNode'
import type { SnapLines } from '../types'

const PAD = 48
const RULER = 22
const EDITOR_BG = '#111114'
const PREVIEW_BG = '#0e0e12'
const WALL_OUTLINE = '#3fb950'

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / pow
  let nice: number
  if (n < 1.5) nice = 1
  else if (n < 3) nice = 2
  else if (n < 7) nice = 5
  else nice = 10
  return nice * pow
}

function formatNum(v: number): string {
  return String(Math.round(v * 100) / 100)
}

function ticksInRange(min: number, max: number, step: number): number[] {
  const start = Math.floor(min / step) * step
  const arr: number[] = []
  for (let v = start; v <= max + 1e-6; v += step) {
    arr.push(Math.round(v * 100) / 100)
  }
  return arr
}

export function WallCanvas({ forPreview = false }: { forPreview?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [imageEl, setImageEl] = useState<HTMLImageElement | undefined>(undefined)
  const [snapLines, setSnapLines] = useState<SnapLines | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [imageHovered, setImageHovered] = useState(false)

  const wall = useStore((s) => s.wall)
  const panels = useStore((s) => s.panels)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const selectedId = useStore((s) => s.selectedId)
  const imageSelected = useStore((s) => s.imageSelected)
  const viewport = useStore((s) => s.viewport)
  const showGrid = useStore((s) => s.showGrid)
  const preview = useStore((s) => s.preview)
  const sourceImage = useStore((s) => s.sourceImage)
  const zoomToFitToken = useStore((s) => s.zoomToFitToken)
  const zoomToImageToken = useStore((s) => s.zoomToImageToken)
  const unit = useStore((s) => s.unit)

  const setViewport = useStore((s) => s.setViewport)
  const setImageTransform = useStore((s) => s.setImageTransform)
  const selectPanel = useStore((s) => s.selectPanel)
  const selectImage = useStore((s) => s.selectImage)
  const setCanvasSize = useStore((s) => s.setCanvasSize)
  const beginHistoryGroup = useStore((s) => s.beginHistoryGroup)
  const endHistoryGroup = useStore((s) => s.endHistoryGroup)

  const placement = useImagePlacement()
  const spaceRef = useRef(false)
  const dragStartRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 })
  const prevImageTokenRef = useRef(0)
  const imgResizeRef = useRef<{
    fx: number
    fy: number
    sx: number
    sy: number
    origW: number
    origH: number
    diagLen2: number
    startScale: number
    fitScale: number
  } | null>(null)
  const didInitialFit = useRef(false)

  const isPreview = forPreview || preview
  const scale = viewport.scale

  // measure container
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // keep canvas size available for bottom-bar fit-state highlighting
  useEffect(() => {
    setCanvasSize(size)
  }, [size, setCanvasSize])

  // load proxy image
  useEffect(() => {
    if (!sourceImage) return
    let cancelled = false
    loadImage(sourceImage.proxyUrl).then((img) => {
      if (!cancelled) setImageEl(img)
    })
    return () => { cancelled = true }
  }, [sourceImage])

  const fit = (cw: number, ch: number) => {
    const s = Math.max(0.2, Math.min((cw - 2 * PAD) / wall.width, (ch - 2 * PAD) / wall.height))
    const x = wall.width / 2 - cw / 2 / s
    const y = wall.height / 2 - ch / 2 / s
    setViewport({ x, y, scale: s })
  }

  // initial fit + zoom-to-fit token
  useEffect(() => {
    if (!didInitialFit.current && size.w > 0 && size.h > 0) {
      fit(size.w, size.h)
      didInitialFit.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h])

  useEffect(() => {
    if (zoomToFitToken > 0 && size.w > 0 && size.h > 0) fit(size.w, size.h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomToFitToken])

  const fitImage = (cw: number, ch: number) => {
    const src = sourceImage
    if (!src) return
    const imgW = src.nativeWidth * placement.scale
    const imgH = src.nativeHeight * placement.scale
    if (imgW <= 0 || imgH <= 0) return
    const s = Math.max(0.2, Math.min((cw - 2 * PAD) / imgW, (ch - 2 * PAD) / imgH))
    const x = placement.panX - (cw / 2 / s - imgW / 2)
    const y = placement.panY - (ch / 2 / s - imgH / 2)
    setViewport({ x, y, scale: s })
  }

  useEffect(() => {
    if (zoomToImageToken !== prevImageTokenRef.current && size.w > 0 && size.h > 0) {
      prevImageTokenRef.current = zoomToImageToken
      fitImage(size.w, size.h)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomToImageToken, size.w, size.h])

  // space-to-pan viewport
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceRef.current = true; setSpaceHeld(true) } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') { spaceRef.current = false; setSpaceHeld(false) } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // wheel zoom (non-passive)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const vp = useStore.getState().viewport
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const newScale = Math.max(0.2, Math.min(40, vp.scale * factor))
      const worldX = px / vp.scale + vp.x
      const worldY = py / vp.scale + vp.y
      setViewport({ scale: newScale, x: worldX - px / newScale, y: worldY - py / newScale })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setViewport])

  const worldTransform = {
    x: -viewport.x * scale,
    y: -viewport.y * scale,
    scaleX: scale,
    scaleY: scale,
  }

  // ghost image
  const ghostW = sourceImage ? sourceImage.nativeWidth * placement.scale : 0
  const ghostH = sourceImage ? sourceImage.nativeHeight * placement.scale : 0
  const fitScale = placement.fitScale

  // image is interactive only in the editor, when not space-panning, and when there are panels to map onto
  const imageInteractive = !isPreview && !spaceHeld && panels.length > 0

  // visible world range
  const visLeft = viewport.x
  const visTop = viewport.y
  const visRight = viewport.x + size.w / scale
  const visBottom = viewport.y + size.h / scale

  // ruler ticks (world units, ~70px apart on screen)
  const rStep = niceStep(70 / scale)
  const xTicks = ticksInRange(visLeft, visRight, rStep)
  const yTicks = ticksInRange(visTop, visBottom, rStep)
  const sx = (v: number) => (v - viewport.x) * scale
  const sy = (v: number) => (v - viewport.y) * scale

  const gridStep = niceStep(50 / scale)

  const handleBgDragStart = () => {
    const st = useStore.getState()
    dragStartRef.current = { vx: st.viewport.x, vy: st.viewport.y }
  }
  const handleBgDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target as Konva.Rect
    const dx = node.x()
    const dy = node.y()
    node.x(0)
    node.y(0)
    const { vx, vy } = dragStartRef.current
    setViewport({ x: vx - dx / scale, y: vy - dy / scale })
  }
  const handleBgClick = () => {
    if (!spaceRef.current) {
      selectPanel(null)
      selectImage(false)
    }
  }

  // --- image interaction -----------------------------------------------------
  const handleImageClick = () => {
    if (!imageInteractive) return
    selectImage(true)
  }
  const handleImageDragStart = () => {
    selectImage(true)
    beginHistoryGroup()
    // switch to custom mode using the currently displayed scale/pan so the
    // transition from fit/fill -> custom is seamless
    const zoom = fitScale > 0 ? placement.scale / fitScale : 1
    setImageTransform(zoom, placement.panX, placement.panY)
  }
  const handleImageDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target as Konva.Image
    const img = useStore.getState().image
    setImageTransform(img.zoom, node.x(), node.y())
  }
  const handleImageDragEnd = () => {
    setTip(null)
    endHistoryGroup()
  }

  // --- image corner-handle resize (writes to store every move -> live crops) ---
  const startCornerResize = (corner: 'tl' | 'tr' | 'bl' | 'br') => (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault()
    e.cancelBubble = true
    const src = sourceImage
    if (!src) return
    const x0 = placement.panX
    const y0 = placement.panY
    const w = src.nativeWidth * placement.scale
    const h = src.nativeHeight * placement.scale
    const corners: Record<typeof corner, { fx: number; fy: number; sx: number; sy: number }> = {
      tl: { fx: x0 + w, fy: y0 + h, sx: -1, sy: -1 },
      tr: { fx: x0, fy: y0 + h, sx: 1, sy: -1 },
      bl: { fx: x0 + w, fy: y0, sx: -1, sy: 1 },
      br: { fx: x0, fy: y0, sx: 1, sy: 1 },
    }
    const c = corners[corner]
    imgResizeRef.current = {
      ...c,
      origW: w,
      origH: h,
      diagLen2: w * w + h * h,
      startScale: placement.scale,
      fitScale,
    }
    selectImage(true)
    beginHistoryGroup()
    // switch to custom mode at current display values so fit/fill -> custom is seamless
    const zoom = fitScale > 0 ? placement.scale / fitScale : 1
    setImageTransform(zoom, placement.panX, placement.panY)

    const move = (ev: PointerEvent) => {
      const r = imgResizeRef.current
      const el = containerRef.current
      if (!r || !el) return
      const rect = el.getBoundingClientRect()
      const vp = useStore.getState().viewport
      const worldX = (ev.clientX - rect.left) / vp.scale + vp.x
      const worldY = (ev.clientY - rect.top) / vp.scale + vp.y
      const dx = worldX - r.fx
      const dy = worldY - r.fy
      // project the pointer displacement onto the original diagonal direction
      const t = (dx * r.sx * r.origW + dy * r.sy * r.origH) / r.diagLen2
      const rawScale = r.startScale * t
      const rawZoom = r.fitScale > 0 ? rawScale / r.fitScale : 1
      const newZoom = Math.max(1, Math.min(5, rawZoom))
      const effScale = r.fitScale > 0 ? r.fitScale * newZoom : rawScale
      const finalW = src.nativeWidth * effScale
      const finalH = src.nativeHeight * effScale
      const panX = r.sx > 0 ? r.fx : r.fx - finalW
      const panY = r.sy > 0 ? r.fy : r.fy - finalH
      setTip(`Zoom ${Math.round(newZoom * 100) / 100}\u00d7 fit`)
      setImageTransform(newZoom, panX, panY)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      imgResizeRef.current = null
      setTip(null)
      endHistoryGroup()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // emphasized ticks at wall origin / extent
  const emphX = [0, wall.width].filter((v) => v >= visLeft - rStep && v <= visRight + rStep)
  const emphY = [0, wall.height].filter((v) => v >= visTop - rStep && v <= visBottom + rStep)

  return (
    <div
      ref={containerRef}
      className="main-area"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      style={{ cursor: !spaceHeld && imageHovered ? 'move' : 'grab' }}
    >
      <Stage width={size.w} height={size.h}>
        <Layer>
          {/* infinite dark background + pan/drag catcher (screen space) */}
          <Rect
            x={0}
            y={0}
            width={size.w}
            height={size.h}
            fill={isPreview ? PREVIEW_BG : EDITOR_BG}
            draggable={!isPreview}
            onDragStart={handleBgDragStart}
            onDragMove={handleBgDragMove}
            onClick={handleBgClick}
            onTap={handleBgClick}
          />

          {/* world content */}
          <Group {...worldTransform}>
            {/* wall: green outline (editor) or filled (preview) */}
            {isPreview ? (
              <Rect x={0} y={0} width={wall.width} height={wall.height} fill={wall.color} listening={false} />
            ) : (
              <Rect
                x={0}
                y={0}
                width={wall.width}
                height={wall.height}
                fill="rgba(0,0,0,0)"
                stroke={WALL_OUTLINE}
                strokeWidth={2 / scale}
                dash={[8 / scale, 5 / scale]}
                listening={false}
              />
            )}

            {/* grid + ghost clipped to wall (editor only) */}
            {!isPreview && (
              <Group clipX={0} clipY={0} clipWidth={wall.width} clipHeight={wall.height}>
                {showGrid && (
                  <Group listening={false}>
                    {Array.from({ length: Math.floor(wall.width / gridStep) + 1 }, (_, i) => i * gridStep).map((v, i) => (
                      <Line key={`gx${i}`} points={[v, 0, v, wall.height]} stroke="rgba(255,255,255,0.05)" strokeWidth={1 / scale} />
                    ))}
                    {Array.from({ length: Math.floor(wall.height / gridStep) + 1 }, (_, i) => i * gridStep).map((v, i) => (
                      <Line key={`gy${i}`} points={[0, v, wall.width, v]} stroke="rgba(255,255,255,0.05)" strokeWidth={1 / scale} />
                    ))}
                  </Group>
                )}
                {imageEl && (
                  <KonvaImage
                    image={imageEl}
                    x={placement.panX}
                    y={placement.panY}
                    width={ghostW}
                    height={ghostH}
                    opacity={imageSelected ? 0.4 : 0.2}
                    listening={imageInteractive}
                    draggable={imageInteractive}
                    onMouseEnter={() => setImageHovered(true)}
                    onMouseLeave={() => setImageHovered(false)}
                    onClick={handleImageClick}
                    onTap={handleImageClick}
                    onDragStart={handleImageDragStart}
                    onDragMove={handleImageDragMove}
                    onDragEnd={handleImageDragEnd}
                  />
                )}
              </Group>
            )}

            {/* panels. Selected rendered last for z-order. */}
            {panels
              .slice()
              .sort((a, b) => (a.id === selectedId ? 1 : 0) - (b.id === selectedId ? 1 : 0))
              .map((p) => (
                <PanelNode
                  key={p.id}
                  panel={p}
                  frame={resolveFrame(p, frame, perPanelFrame)}
                  selected={!isPreview && selectedId === p.id}
                  image={imageEl}
                  sourceImage={sourceImage}
                  scale={placement.scale}
                  panX={placement.panX}
                  panY={placement.panY}
                  others={panels.filter((q) => q.id !== p.id).map((q) => ({ panel: q, frame: resolveFrame(q, frame, perPanelFrame) }))}
                  viewportScale={scale}
                  showLabel={isPreview}
                  setSnapLines={setSnapLines}
                  setTip={setTip}
                />
              ))}

            {/* selection border + corner handles for proportional scaling of the ghost image */}
            {imageSelected && !isPreview && panels.length > 0 && sourceImage && ghostW > 0 && (
              <>
                <Rect
                  x={placement.panX}
                  y={placement.panY}
                  width={ghostW}
                  height={ghostH}
                  stroke="#4a7dff"
                  strokeWidth={1.5 / scale}
                  dash={[6 / scale, 4 / scale]}
                  listening={false}
                />
                {(
                  [
                    { key: 'tl', cx: placement.panX, cy: placement.panY },
                    { key: 'tr', cx: placement.panX + ghostW, cy: placement.panY },
                    { key: 'bl', cx: placement.panX, cy: placement.panY + ghostH },
                    { key: 'br', cx: placement.panX + ghostW, cy: placement.panY + ghostH },
                  ] as const
                ).map((c) => {
                  const hs = 11 / scale
                  const cursor = (c.key === 'tl' || c.key === 'br') ? 'nwse-resize' : 'nesw-resize'
                  return (
                    <Rect
                      key={c.key}
                      x={c.cx - hs / 2}
                      y={c.cy - hs / 2}
                      width={hs}
                      height={hs}
                      fill="#ffffff"
                      stroke="#4a7dff"
                      strokeWidth={1.5 / scale}
                      cornerRadius={2 / scale}
                      onMouseEnter={() => { if (containerRef.current) containerRef.current.style.cursor = cursor }}
                      onMouseLeave={() => { if (containerRef.current) containerRef.current.style.cursor = '' }}
                      onPointerDown={startCornerResize(c.key)}
                    />
                  )
                })}
              </>
            )}
          </Group>

          {/* snap guides (span visible range) */}
          {!isPreview && snapLines && (
            <Group listening={false}>
              {snapLines.vertical.map((g, i) => (
                <Line key={`sv${i}`} points={[sx(g.pos), 0, sx(g.pos), size.h]} stroke={g.color} strokeWidth={1} dash={[4, 4]} />
              ))}
              {snapLines.horizontal.map((g, i) => (
                <Line key={`sh${i}`} points={[0, sy(g.pos), size.w, sy(g.pos)]} stroke={g.color} strokeWidth={1} dash={[4, 4]} />
              ))}
            </Group>
          )}

          {/* rulers pinned to top/left edges (screen space) */}
          {!isPreview && (
            <Group listening={false}>
              <Rect x={0} y={0} width={size.w} height={RULER} fill="#1d1d23" />
              <Rect x={0} y={0} width={RULER} height={size.h} fill="#1d1d23" />
              <Rect x={0} y={0} width={RULER} height={RULER} fill="#16161b" />
              {/* x ticks */}
              {xTicks.map((v, i) => {
                const x = sx(v)
                if (x < RULER) return null
                const emph = emphX.includes(v)
                return (
                  <Group key={`xt${i}`}>
                    <Line points={[x, RULER - (emph ? 10 : 6), x, RULER]} stroke={emph ? WALL_OUTLINE : '#5a5a66'} strokeWidth={emph ? 1.4 : 1} />
                    <Text x={x + 2} y={3} text={formatNum(v)} fontSize={9} fill={emph ? WALL_OUTLINE : '#9a9aa8'} />
                  </Group>
                )
              })}
              {/* y ticks */}
              {yTicks.map((v, i) => {
                const y = sy(v)
                if (y < RULER) return null
                const emph = emphY.includes(v)
                return (
                  <Group key={`yt${i}`}>
                    <Line points={[RULER - (emph ? 10 : 6), y, RULER, y]} stroke={emph ? WALL_OUTLINE : '#5a5a66'} strokeWidth={emph ? 1.4 : 1} />
                    <Text x={2} y={y + 2} text={formatNum(v)} fontSize={9} fill={emph ? WALL_OUTLINE : '#9a9aa8'} />
                  </Group>
                )
              })}
              <Line points={[0, RULER, size.w, RULER]} stroke="#3a3a44" strokeWidth={1} />
              <Line points={[RULER, 0, RULER, size.h]} stroke="#3a3a44" strokeWidth={1} />
              <Text x={4} y={RULER + 4} text={unit} fontSize={9} fill="#6a6a78" />
            </Group>
          )}
        </Layer>
      </Stage>

      {!isPreview && tip && (
        <div className="dimension-tip" style={{ left: mouse.x + 14, top: mouse.y + 14 }}>
          {tip}
        </div>
      )}

      {panels.length === 0 && !isPreview && (
        <div className="empty-hint" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div className="card" style={{ background: 'rgba(20,20,26,0.8)' }}>Add panels from the left sidebar or choose a preset.</div>
        </div>
      )}
    </div>
  )
}
