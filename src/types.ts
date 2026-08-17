export type TemplateId = 'product' | 'layered' | 'matrix'
export type ThemeId = 'colorful' | 'business' | 'minimal'
export type ElementKind = 'layer' | 'group' | 'card'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface BoxStyle {
  background: string
  border: string
  borderWidth: number
  radius: number
  opacity: number
}

export interface TextStyle {
  fontFamily: string
  fontSize: number
  color: string
  bold: boolean
  align: 'left' | 'center' | 'right'
}

export interface ParsedNode {
  id: string
  text: string
  level: number
  line: number
  children: ParsedNode[]
}

export interface ParseError {
  line: number
  message: string
}

export interface ParseResult {
  title: string
  roots: ParsedNode[]
  errors: ParseError[]
  nodeCount: number
  format: 'explicit-level' | 'indentation'
}

export interface Layer extends Rect {
  id: string
  sourceId: string
  name: string
  order: number
  style: BoxStyle
  textStyle: TextStyle
}

export interface ArchitectureGroup extends Rect {
  id: string
  sourceId: string
  parentLayerId: string
  name: string
  order: number
  summaryItems: string[]
  style: BoxStyle
  textStyle: TextStyle
}

export interface Card extends Rect {
  id: string
  sourceId: string
  level?: number
  paletteIndex?: number
  parentLayerId: string
  parentGroupId?: string
  title: string
  items: string[]
  order: number
  style: BoxStyle
  textStyle: TextStyle
}

export interface CanvasSettings {
  width: number
  height: number
  background: string
}

export interface ArchitectureDocument {
  schemaVersion: 1
  id: string
  name: string
  version: string
  templateId: TemplateId
  themeId: ThemeId
  sourceText: string
  title: string
  canvas: CanvasSettings
  layers: Layer[]
  groups: ArchitectureGroup[]
  cards: Card[]
  updatedAt: string
}

export interface TemplateDefinition {
  id: TemplateId
  name: string
  description: string
  maxLevel: number
  sourceTemplate: string
  exampleSource: string
  layoutHint: string
  aiPrompt: string
  multiPaletteLayerIndexes: number[]
}

export type CardStylePreset = { background: string; border: string; text: string }
export type CardPalette = Record<2 | 3 | 4, CardStylePreset>

export interface ThemeDefinition {
  id: ThemeId
  name: string
  editorAccent: string
  canvas: string
  ink: string
  mutedInk: string
  layerBackground: string
  layerBorder: string
  layerLabelPalette: string[]
  levelCardStyles: CardPalette
  cardPalette?: CardPalette[]
  groupPalette: string[]
  cardBackground: string
  cardBorder: string
  divider: string
}

export interface Selection {
  kind: ElementKind
  id: string
}
