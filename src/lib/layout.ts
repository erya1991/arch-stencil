import {
  ArchitectureDocument,
  BoxStyle,
  Card,
  Layer,
  ParsedNode,
  TemplateId,
  TextStyle,
  ThemeDefinition,
} from '../types'
import { makeId } from './ids'

const baseText: TextStyle = {
  fontFamily: 'Microsoft YaHei, Arial, sans-serif',
  fontSize: 16,
  color: '#17324d',
  bold: false,
  align: 'left',
}

function boxStyle(background: string, border: string, radius = 12, borderWidth = 1): BoxStyle {
  return { background, border, borderWidth, radius, opacity: 1 }
}

function titleStyle(theme: ThemeDefinition, size: number, bold = true): TextStyle {
  return { ...baseText, fontSize: size, color: theme.ink, bold }
}

function cardPreset(theme: ThemeDefinition, level: number, paletteIndex = 0) {
  const levelKey = level as 2 | 3 | 4
  const palette = theme.cardPalette?.length ? theme.cardPalette[paletteIndex % theme.cardPalette.length] : undefined
  return palette?.[levelKey] ?? theme.levelCardStyles[levelKey] ?? theme.levelCardStyles[4]
}

function productCardStyle(theme: ThemeDefinition, level: number, paletteIndex = 0): BoxStyle {
  const preset = cardPreset(theme, level, paletteIndex)
  return boxStyle(preset.background, preset.border, level === 2 ? 10 : level === 3 ? 9 : 7, 1)
}

function productCardTextStyle(theme: ThemeDefinition, level: number, paletteIndex = 0): TextStyle {
  const preset = cardPreset(theme, level, paletteIndex)
  return { ...titleStyle(theme, level === 2 ? 15 : level === 3 ? 13 : 12, level < 4), color: preset.text }
}

function productLayerStyle(theme: ThemeDefinition, order: number): BoxStyle {
  return boxStyle(theme.layerLabelPalette[order % theme.layerLabelPalette.length], 'transparent', 12, 0)
}

function createBase(templateId: TemplateId, theme: ThemeDefinition, sourceText: string, title: string): ArchitectureDocument {
  return {
    schemaVersion: 1,
    id: makeId('document'),
    name: title,
    version: '0.1.0',
    templateId,
    themeId: theme.id,
    sourceText,
    title,
    canvas: { width: 1920, height: 1080, background: theme.canvas },
    layers: [],
    groups: [],
    cards: [],
    updatedAt: new Date().toISOString(),
  }
}

function addLeftLabelLayer(
  document: ArchitectureDocument,
  root: ParsedNode,
  theme: ThemeDefinition,
  order: number,
  y: number,
  splitPalette: boolean,
) {
  const layerId = makeId('layer')
  const cards: Card[] = []
  const layerX = 80
  const layerWidth = 150
  const contentX = 260
  const columnGap = 16
  const columnWidth = 196
  const domainCount = Math.max(1, root.children.length)
  const contentTop = y + 18
  let maxColumnHeight = 150

  root.children.forEach((domainNode, domainIndex) => {
    const columnX = contentX + domainIndex * (columnWidth + columnGap)
    const paletteIndex = splitPalette ? order + domainIndex : order
    let currentY = contentTop
    const domainCardHeight = 46
    cards.push({
      id: makeId('card'),
      sourceId: domainNode.id,
      level: 2,
      parentLayerId: layerId,
      title: domainNode.text,
      items: [],
      order: domainIndex,
      paletteIndex,
      x: columnX,
      y: currentY,
      width: columnWidth,
      height: domainCardHeight,
      style: productCardStyle(theme, 2, paletteIndex),
      textStyle: productCardTextStyle(theme, 2, paletteIndex),
    })
    currentY += domainCardHeight + 10

    domainNode.children.forEach((moduleNode, moduleIndex) => {
      const moduleCardHeight = 42
      cards.push({
        id: makeId('card'),
        sourceId: moduleNode.id,
        level: 3,
        parentLayerId: layerId,
        title: moduleNode.text,
        items: [],
        order: moduleIndex,
        paletteIndex,
        x: columnX,
        y: currentY,
        width: columnWidth,
        height: moduleCardHeight,
        style: productCardStyle(theme, 3, paletteIndex),
        textStyle: productCardTextStyle(theme, 3, paletteIndex),
      })
      currentY += moduleCardHeight + 8

      const itemCount = moduleNode.children.length
      if (!itemCount) return
      const itemGap = 8
      const itemColumns = itemCount > 1 ? 2 : 1
      const itemWidth = (columnWidth - itemGap * (itemColumns - 1)) / itemColumns
      const itemHeight = 34
      moduleNode.children.forEach((itemNode, itemIndex) => {
        const row = Math.floor(itemIndex / itemColumns)
        const column = itemIndex % itemColumns
        cards.push({
          id: makeId('card'),
          sourceId: itemNode.id,
          level: 4,
          parentLayerId: layerId,
          title: itemNode.text,
          items: [],
          order: itemIndex,
          paletteIndex,
          x: columnX + column * (itemWidth + itemGap),
          y: currentY + row * (itemHeight + itemGap),
          width: itemWidth,
          height: itemHeight,
          style: productCardStyle(theme, 4, paletteIndex),
          textStyle: productCardTextStyle(theme, 4, paletteIndex),
        })
      })
      currentY += Math.ceil(itemCount / itemColumns) * (itemHeight + itemGap) + 2
    })

    maxColumnHeight = Math.max(maxColumnHeight, currentY - contentTop)
  })

  const layerHeight = maxColumnHeight + 18
  document.layers.push({
    id: layerId,
    sourceId: root.id,
    name: root.text,
    order,
    x: layerX,
    y,
    width: layerWidth,
    height: layerHeight,
    style: productLayerStyle(theme, order),
    textStyle: { ...titleStyle(theme, 20, true), color: '#ffffff', align: 'center' },
  })
  document.cards.push(...cards)
  return y + layerHeight + 18
}

function layoutLeftLabelCards(roots: ParsedNode[], document: ArchitectureDocument, theme: ThemeDefinition, multiPaletteLayerIndexes: number[]) {
  const maxDomainCount = Math.max(...roots.map((root) => root.children.length), 1)
  document.canvas.width = Math.max(1440, 340 + maxDomainCount * 196 + Math.max(0, maxDomainCount - 1) * 16)
  let y = 86
  roots.forEach((root, index) => {
    y = addLeftLabelLayer(document, root, theme, index, y, multiPaletteLayerIndexes.includes(index))
  })
  document.canvas.height = Math.max(1080, y + 60)
}

function layoutProduct(roots: ParsedNode[], document: ArchitectureDocument, theme: ThemeDefinition, multiPaletteLayerIndexes: number[]) {
  layoutLeftLabelCards(roots, document, theme, multiPaletteLayerIndexes)
}

function layoutLayered(roots: ParsedNode[], document: ArchitectureDocument, theme: ThemeDefinition, multiPaletteLayerIndexes: number[]) {
  layoutLeftLabelCards(roots, document, theme, multiPaletteLayerIndexes)
}

function layoutMatrix(roots: ParsedNode[], document: ArchitectureDocument, theme: ThemeDefinition, multiPaletteLayerIndexes: number[]) {
  layoutLeftLabelCards(roots, document, theme, multiPaletteLayerIndexes)
}

export function buildDocument(
  roots: ParsedNode[],
  templateId: TemplateId,
  theme: ThemeDefinition,
  sourceText: string,
  title: string,
  multiPaletteLayerIndexes: number[] = [],
) {
  const document = createBase(templateId, theme, sourceText, title)
  if (templateId === 'layered') layoutLayered(roots, document, theme, multiPaletteLayerIndexes)
  else if (templateId === 'matrix') layoutMatrix(roots, document, theme, multiPaletteLayerIndexes)
  else layoutProduct(roots, document, theme, multiPaletteLayerIndexes)
  return document
}

export function applyTheme(document: ArchitectureDocument, theme: ThemeDefinition, multiPaletteLayerIndexes: number[] = []) {
  const next: ArchitectureDocument = structuredClone(document)
  next.themeId = theme.id
  next.canvas.background = theme.canvas
  next.layers = next.layers.map((layer) => ({
    ...layer,
    style: { ...layer.style, background: theme.layerLabelPalette[layer.order % theme.layerLabelPalette.length], border: 'transparent', borderWidth: 0 },
    textStyle: { ...layer.textStyle, color: '#ffffff' },
  }))
  next.groups = next.groups.map((group) => ({
    ...group,
    style: { ...group.style, background: theme.groupPalette[group.order % theme.groupPalette.length], border: theme.divider },
    textStyle: { ...group.textStyle, color: theme.ink },
  }))

  const paletteIndexForCard = (card: Card) => {
    if (typeof card.paletteIndex === 'number') return card.paletteIndex
    const layerOrder = next.layers.find((layer) => layer.id === card.parentLayerId)?.order ?? 0
    if (!multiPaletteLayerIndexes.includes(layerOrder)) return layerOrder
    const columns = next.cards
      .filter((item) => item.parentLayerId === card.parentLayerId && item.level === 2)
      .sort((left, right) => left.x - right.x)
    if (!columns.length) return 0
    return layerOrder + columns.reduce((nearest, current) => Math.abs(current.x - card.x) < Math.abs(nearest.x - card.x) ? current : nearest).order
  }

  next.cards = next.cards.map((card) => {
    const paletteIndex = paletteIndexForCard(card)
    const preset = cardPreset(theme, card.level ?? 4, paletteIndex)
    return {
      ...card,
      paletteIndex,
      style: { ...card.style, background: preset.background, border: preset.border },
      textStyle: { ...card.textStyle, color: preset.text },
    }
  })
  next.updatedAt = new Date().toISOString()
  return next
}

export function moveElement(document: ArchitectureDocument, kind: 'layer' | 'group' | 'card', id: string, dx: number, dy: number) {
  const next = structuredClone(document)
  if (kind === 'layer') {
    const layer = next.layers.find((item) => item.id === id)
    if (!layer) return document
    layer.x += dx
    layer.y += dy
    next.groups.filter((group) => group.parentLayerId === id).forEach((group) => { group.x += dx; group.y += dy })
    next.cards.filter((card) => card.parentLayerId === id).forEach((card) => { card.x += dx; card.y += dy })
  } else if (kind === 'group') {
    const group = next.groups.find((item) => item.id === id)
    if (!group) return document
    group.x += dx
    group.y += dy
    next.cards.filter((card) => card.parentGroupId === id).forEach((card) => { card.x += dx; card.y += dy })
  } else {
    const card = next.cards.find((item) => item.id === id)
    if (card) { card.x += dx; card.y += dy }
  }
  next.updatedAt = new Date().toISOString()
  return next
}

export function resizeElement(document: ArchitectureDocument, kind: 'layer' | 'group' | 'card', id: string, direction: string, dx: number, dy: number) {
  const next = structuredClone(document)
  const collection = kind === 'layer' ? next.layers : kind === 'group' ? next.groups : next.cards
  const item = collection.find((entry) => entry.id === id)
  if (!item) return document
  const minWidth = kind === 'layer' ? 520 : kind === 'group' ? 180 : 130
  const minHeight = kind === 'layer' ? 150 : kind === 'group' ? 100 : 58
  if (direction.includes('e')) item.width = Math.max(minWidth, item.width + dx)
  if (direction.includes('s')) item.height = Math.max(minHeight, item.height + dy)
  if (direction.includes('w')) {
    const nextWidth = Math.max(minWidth, item.width - dx)
    item.x += item.width - nextWidth
    item.width = nextWidth
  }
  if (direction.includes('n')) {
    const nextHeight = Math.max(minHeight, item.height - dy)
    item.y += item.height - nextHeight
    item.height = nextHeight
  }
  next.updatedAt = new Date().toISOString()
  return next
}

export function tidyDocument(document: ArchitectureDocument) {
  const next = structuredClone(document)
  next.groups.forEach((group) => {
    const cards = next.cards.filter((card) => card.parentGroupId === group.id).sort((a, b) => a.order - b.order)
    if (!cards.length) return
    const gap = 12
    const cardWidth = Math.max(130, (group.width - 32 - gap * (cards.length - 1)) / cards.length)
    cards.forEach((card, index) => {
      card.x = group.x + 16 + index * (cardWidth + gap)
      card.y = group.y + 58
      card.width = cardWidth
    })
  })
  next.updatedAt = new Date().toISOString()
  return next
}
