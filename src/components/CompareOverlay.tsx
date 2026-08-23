import { useEffect, useState } from 'react'
import { ArrowLeftIcon, ImageIcon } from 'lucide-react'
import type { DesignVariant } from '../types'
import { loadImage } from '../lib/imageUtils'
import { useStore } from '../store/useStore'
import { VariantCanvas } from './VariantCanvas'

interface Props {
  variants: DesignVariant[]
  onBack: () => void
}

export function CompareOverlay({ variants, onBack }: Props) {
  const sourceImage = useStore((state) => state.sourceImage)
  const [imageEl, setImageEl] = useState<HTMLImageElement>()
  const [loadedUrl, setLoadedUrl] = useState<string>()
  const [errorUrl, setErrorUrl] = useState<string>()

  useEffect(() => {
    if (!sourceImage) return
    let cancelled = false
    loadImage(sourceImage.proxyUrl)
      .then((image) => {
        if (!cancelled) {
          setImageEl(image)
          setLoadedUrl(sourceImage.proxyUrl)
        }
      })
      .catch(() => {
        if (!cancelled) setErrorUrl(sourceImage.proxyUrl)
      })
    return () => { cancelled = true }
  }, [sourceImage])

  if (!sourceImage) return null
  const readyImage = loadedUrl === sourceImage.proxyUrl ? imageEl : undefined
  const imageError = errorUrl === sourceImage.proxyUrl

  return (
    <div className="compare-overlay" role="dialog" aria-modal="true" aria-labelledby="compare-title">
      <header className="compare-toolbar">
        <div className="compare-toolbar-title">
          <ImageIcon size={18} aria-hidden />
          <div>
            <h2 id="compare-title">Compare variants</h2>
            <span>{variants.length} designs · same source image</span>
          </div>
        </div>
        <button className="ghost" onClick={onBack}>
          <ArrowLeftIcon size={14} />Back to variants
        </button>
      </header>

      <main className={`compare-grid compare-grid-${variants.length}`}>
        {variants.map((variant, index) => (
          <article className="compare-cell" key={variant.id}>
            <div className="compare-cell-heading">
              <span className="compare-number">0{index + 1}</span>
              <div>
                <h3>{variant.name}</h3>
                <span>{variant.wall.width} × {variant.wall.height} {variant.unit} wall · {variant.panels.length} panels</span>
              </div>
            </div>
            <VariantCanvas variant={variant} sourceImage={sourceImage} imageEl={readyImage} />
            {imageError && <div className="compare-image-error">Couldn’t load the source image.</div>}
          </article>
        ))}
      </main>
    </div>
  )
}
