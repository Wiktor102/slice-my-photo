import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Layer, Line, Rect, Stage, Text, Image as KonvaImage, Group } from 'react-konva'
import type Konva from 'konva'
import { useStore, useImagePlacement } from '../store/useStore'
import { loadImage } from '../lib/imageUtils'
import { panelGeometry, resolveFrame } from '../lib/geometry'
import { PanelNode } from './PanelNode'
import type { SnapLines } from '../types'

const PAD = 48
const RULER = 22

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

export function WallCanvas({ forPreview = false }: { forPreview?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 600 })
  const [imageEl, setImageEl] = useState<HTMLImageElement | undefined>(undefined)
  const [snapLines, setSnapLines] = useState<SnapLines | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const [mouse, setMouse] = useState({ x: 0, y: 0 })

  const wall = useStore((s) => s.wall)
  const panels = useStore((s) => s.panels)
  const frame = useStore((s) => s.frame)
  const perPanelFrame = useStore((s) => s.perPanelFrame)
  const selectedId = useStore((s) => s.selectedId)
  const viewport = useStore((s) => s.viewport)
  const showGrid = useStore((s) => s.showGrid)
  const preview = useStore((s) => s.preview)
  const sourceImage = useStore((s) => s.sourceImage)
  const zoomToFitToken = useStore((s) => s.zoomToFitToken)

  const setViewport = useStore((s) => s.setViewport)
  const setImagePan = useStore((s) => s.setImagePan)
  const selectPanel = useStore((s) => s.selectPanel)

  const placement = useImagePlacement()
  const spaceRef = useRef(false)
  const dragStartRef = useRef<{ panX: number; panY: number; vx: number; vy: number }>({ panX: 0, panY: 0, vx: 0, vy: 0 })
  const didInitialFit = useRef(false)

  const isPreview = forPreview || preview

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
    const scale = Math.min((cw - 2 * PAD) / wall.width, (ch - 2 * PAD) / wall.height)
    const s = Math.max(0.2, scale)
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

  // space-to-pan viewport
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false }
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
    x: -viewport.x * viewport.scale,
    y: -viewport.y * viewport.scale,
    scaleX: viewport.scale,
    scaleY: viewport.scale,
  }

  const geoms = panels.map((p) => panelGeometry(p, resolveFrame(p, frame, perPanelFrame)))

  // ghost image
  const ghostW = sourceImage ? sourceImage.nativeWidth * placement.scale : 0
  const ghostH = sourceImage ? sourceImage.nativeHeight * placement.scale : 0

  // rulers
  const step = niceStep(70 / viewport.scale)
  const xTicks: number[] = []
  for (let v = 0; v <= wall.width + 0.001; v += step) xTicks.push(Math.round(v * 100) / 100)
  const yTicks: number[] = []
  for (let v = 0; v <= wall.height + 0.001; v += step) yTicks.push(Math.round(v * 100) / 100)

  const gridStep = niceStep(50 / viewport.scale)

  const handleBgDragStart = () => {
    const st = useStore.getState()
    dragStartRef.current = { panX: st.image.panX, panY: st.image.panY, vx: st.viewport.x, vy: st.viewport.y }
  }
  const handleBgDragMove = (e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target as Konva.Rect
    const dx = node.x()
    const dy = node.y()
    node.x(0)
    node.y(0)
    if (spaceRef.current) {
      const { vx, vy } = dragStartRef.current
      setViewport({ x: vx - dx, y: vy - dy })
    } else {
      const { panX, panY } = dragStartRef.current
      setImagePan(panX + dx, panY + dy)
    }
  }
  const handleBgClick = () => {
    if (!spaceRef.current) selectPanel(null)
  }

  return (
    <div
      ref={containerRef}
      className="main-area"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      style={{ cursor: spaceRef.current ? 'grab' : 'default' }}
    >
      <Stage width={size.w} height={size.h}>
        <Layer>
          {/* rulers (screen-ish space but drawn in world coords via the world group) */}
          {!isPreview && (
            <Group {...worldTransform} listening={false}>
              {/* horizontal ruler above wall */}
              <Rect x={-RULER} y={-RULER} width={wall.width + RULER} height={RULER} fill="#1d1d23" />
              <Rect x={-RULER} y={-RULER} width={RULER} height={wall.height + RULER} fill="#1d1d23" />
              {xTicks.map((v, i) => (
                <Group key={`xt${i}`}>
                  <Line points={[v, -RULER, v, 0]} stroke="#5a5a66" strokeWidth={1 / viewport.scale} />
                  <Text
                    x={v + 2 / viewport.scale}
                    y={-RULER + 4 / viewport.scale}
                    text={`${v}`}
                    fontSize={9 / viewport.scale}
                    fill="#9a9aa8"
                  />
                </Group>
              ))}
              {yTicks.map((v, i) => (
                <Group key={`yt${i}`}>
                  <Line points={[-RULER, v, 0, v]} stroke="#5a5a66" strokeWidth={1 / viewport.scale} />
                  <Text
                    x={-RULER + 3 / viewport.scale}
                    y={v + 2 / viewport.scale}
                    text={`${v}`}
                    fontSize={9 / viewport.scale}
                    fill="#9a9aa8"
                  />
                </Group>
              ))}
              <Line points={[0, 0, wall.width, 0]} stroke="#3a3a44" strokeWidth={1 / viewport.scale} />
              <Line points={[0, 0, 0, wall.height]} stroke="#3a3a44" strokeWidth={1 / viewport.scale} />
            </Group>
          )}

          <Group {...worldTransform} clipX={0} clipY={0} clipWidth={wall.width} clipHeight={wall.height}>
            {/* wall background (also the pan catcher) */}
            <Rect
              x={0}
              y={0}
              width={wall.width}
              height={wall.height}
              fill={wall.color}
              draggable={!isPreview}
              onDragStart={handleBgDragStart}
              onDragMove={handleBgDragMove}
              onClick={handleBgClick}
              onTap={handleBgClick}
            />
            {/* grid */}
            {showGrid && !isPreview && (
              <Group listening={false}>
                {Array.from({ length: Math.floor(wall.width / gridStep) + 1 }, (_, i) => i * gridStep).map((v, i) => (
                  <Line key={`gx${i}`} points={[v, 0, v, wall.height]} stroke="rgba(0,0,0,0.06)" strokeWidth={1 / viewport.scale} />
                ))}
                {Array.from({ length: Math.floor(wall.height / gridStep) + 1 }, (_, i) => i * gridStep).map((v, i) => (
                  <Line key={`gy${i}`} points={[0, v, wall.width, v]} stroke="rgba(0,0,0,0.06)" strokeWidth={1 / viewport.scale} />
                ))}
              </Group>
            )}
            {/* ghost image (20% outside panels) */}
            {imageEl && !isPreview && (
              <KonvaImage
                image={imageEl}
                x={placement.panX}
                y={placement.panY}
                width={ghostW}
                height={ghostH}
                opacity={0.2}
                listening={false}
              />
            )}
          </Group>

          {/* panels (above wall; within wall area) */}
          <Group {...worldTransform}>
            {panels.map((p, i) => (
              <PanelNode
                key={p.id}
                panel={p}
                frame={resolveFrame(p, frame, perPanelFrame)}
                selected={!isPreview && selectedId === p.id}
                image={imageEl}
                scale={placement.scale}
                panX={placement.panX}
                panY={placement.panY}
                others={panels.filter((q) => q.id !== p.id).map((q) => ({ panel: q, frame: resolveFrame(q, frame, perPanelFrame) }))}
                viewportScale={viewport.scale}
                index={i}
                showLabel={isPreview}
                setSnapLines={setSnapLines}
                setTip={setTip}
              />
            ))}
          </Group>

          {/* snap guides */}
          {!isPreview && snapLines && (
            <Group {...worldTransform} listening={false}>
              {snapLines.vertical.map((x, i) => (
                <Line key={`sv${i}`} points={[x, 0, x, wall.height]} stroke="#e070ff" strokeWidth={1 / viewport.scale} dash={[4 / viewport.scale, 4 / viewport.scale]} />
              ))}
              {snapLines.horizontal.map((y, i) => (
                <Line key={`sh${i}`} points={[0, y, wall.width, y]} stroke="#e070ff" strokeWidth={1 / viewport.scale} dash={[4 / viewport.scale, 4 / viewport.scale]} />
              ))}
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
