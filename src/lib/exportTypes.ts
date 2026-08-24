export interface PanelCropSpec {
  index: number
  name: string
  relX: number
  relY: number
  relW: number
  relH: number
  outW: number
  outH: number
  mime: 'image/jpeg' | 'image/png'
  quality: number
}

export interface VisPanel {
  outerX: number; outerY: number; outerW: number; outerH: number
  innerX: number; innerY: number; innerW: number; innerH: number
  visX: number; visY: number; visW: number; visH: number
  frameColor: string
  matColor: string | null
  shadow: boolean
  number: number
}

export interface VisSpec {
  wallW: number
  wallH: number
  wallColor: string
  pxPerUnit: number
  imgNativeW: number
  imgNativeH: number
  panX: number
  panY: number
  scale: number
  panels: VisPanel[]
}

export interface ExportWorkerRequest {
  imageUrl: string
  panels: PanelCropSpec[]
  visualization: VisSpec | null
}
