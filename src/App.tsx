import { useEffect } from 'react'
import { useStore } from './store/useStore'
import { idbGetImage } from './lib/idb'
import { UploadScreen } from './components/UploadScreen'
import { Editor } from './components/Editor'

export default function App() {
  const screen = useStore((s) => s.screen)
  const restoreImage = useStore((s) => s.restoreImage)
  const sourceImage = useStore((s) => s.sourceImage)

  useEffect(() => {
    if (sourceImage) return
    let cancelled = false
    idbGetImage().then((img) => {
      if (!cancelled && img) restoreImage(img as never)
    })
    return () => {
      cancelled = true
    }
  }, [restoreImage, sourceImage])

  return screen === 'editor' && sourceImage ? <Editor /> : <UploadScreen />
}
