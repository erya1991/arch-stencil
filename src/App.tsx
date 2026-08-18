import { ChangeEvent, CSSProperties, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { templates, themes } from './data/templates'
import {
  applyTheme,
  buildDocument,
  moveElement,
  resizeElement,
  tidyDocument,
} from './lib/layout'
import { parseArchitectureText } from './lib/parser'
import {
  downloadHtml,
  downloadJson,
  downloadPng,
  downloadSvg,
} from './lib/exporters'
import {
  ArchitectureDocument,
  ArchitectureGroup,
  BoxStyle,
  Card,
  ElementKind,
  Layer,
  ParseResult,
  Selection,
  TemplateId,
  TextStyle,
  ThemeId,
} from './types'

type ElementRecord = Layer | ArchitectureGroup | Card
type EditingState = { kind: ElementKind; id: string } | null
type DragState = {
  type: 'move' | 'resize'
  selections: Selection[]
  direction?: string
  pointerX: number
  pointerY: number
  base: ArchitectureDocument
  current: ArchitectureDocument
}
type MarqueeState = {
  startX: number
  startY: number
  currentX: number
  currentY: number
  append: boolean
}

const DRAFT_STORAGE_KEY = 'arch-stencil:active-draft'
type DraftSnapshot = {
  documentData: ArchitectureDocument
  sourceText: string
  activeTemplateId: TemplateId
  savedAt: string
}

function isTemplateId(value: unknown): value is TemplateId {
  return value === 'product' || value === 'layered' || value === 'matrix'
}

function readDraftSnapshot(): DraftSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return null
    const snapshot = JSON.parse(raw) as Partial<DraftSnapshot>
    const documentData = snapshot.documentData
    if (!documentData || documentData.schemaVersion !== 1 || !Array.isArray(documentData.layers) || !Array.isArray(documentData.cards) || !Array.isArray(documentData.groups) || !isTemplateId(snapshot.activeTemplateId) || typeof snapshot.sourceText !== 'string' || typeof snapshot.savedAt !== 'string') return null
    return { documentData, sourceText: snapshot.sourceText, activeTemplateId: snapshot.activeTemplateId, savedAt: snapshot.savedAt }
  } catch {
    return null
  }
}

function formatDraftTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return '刚刚'
  }
}

async function copyTextToClipboard(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // 普通 HTTP、浏览器权限策略或内嵌页面可能禁用 Clipboard API，继续尝试兼容方案。
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, value.length)
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }
  document.body.removeChild(textarea)
  return copied
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function createDocument(templateId: TemplateId, themeId: ThemeId): ArchitectureDocument {
  const template = templates[templateId]
  const parsed = parseArchitectureText(template.exampleSource)
  return buildDocument(parsed.roots, templateId, themes[themeId], template.exampleSource, parsed.title, template.multiPaletteLayerIndexes)
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  return element?.tagName === 'INPUT' || element?.tagName === 'TEXTAREA' || element?.isContentEditable
}

function elementLabel(kind: ElementKind) {
  return kind === 'layer' ? '架构区域' : kind === 'group' ? '业务域' : '内容卡片'
}

function getElement(documentData: ArchitectureDocument, selection: Selection | null): ElementRecord | null {
  if (!selection) return null
  if (selection.kind === 'layer') return documentData.layers.find((item) => item.id === selection.id) ?? null
  if (selection.kind === 'group') return documentData.groups.find((item) => item.id === selection.id) ?? null
  return documentData.cards.find((item) => item.id === selection.id) ?? null
}

function elementName(element: ElementRecord) {
  return 'name' in element ? element.name : element.title
}

function colorPickerValue(value: string) {
  const hex = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1]
    return raw.length === 3 ? `#${raw.split('').map((char) => `${char}${char}`).join('')}` : `#${raw}`
  }
  const rgb = value.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i)
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
  return '#ffffff'
}

function ColorCodeField({ label, value, onChange, placeholder = '#RRGGBB / rgb(...)' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="color-code-field">
    <label className="field-label">{label}</label>
    <div className="color-code-control">
      <input className="color-input" type="color" value={colorPickerValue(value)} onChange={(event) => onChange(event.target.value)} aria-label={`${label}颜色选择器`} />
      <input className="color-code-input" type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={`${label}颜色代码`} />
    </div>
  </div>
}

function updateElementInDocument(documentData: ArchitectureDocument, selection: Selection, patch: Record<string, unknown>) {
  const next = structuredClone(documentData)
  if (selection.kind === 'layer') next.layers = next.layers.map((item) => item.id === selection.id ? { ...item, ...patch } as Layer : item)
  if (selection.kind === 'group') next.groups = next.groups.map((item) => item.id === selection.id ? { ...item, ...patch } as ArchitectureGroup : item)
  if (selection.kind === 'card') next.cards = next.cards.map((item) => item.id === selection.id ? { ...item, ...patch } as Card : item)
  next.updatedAt = new Date().toISOString()
  return next
}

function updateStyleInDocument(documentData: ArchitectureDocument, selection: Selection, patch: Partial<BoxStyle>) {
  const element = getElement(documentData, selection)
  if (!element) return documentData
  return updateElementInDocument(documentData, selection, { style: { ...element.style, ...patch } })
}

function updateTextStyleInDocument(documentData: ArchitectureDocument, selection: Selection, patch: Partial<TextStyle>) {
  const element = getElement(documentData, selection)
  if (!element) return documentData
  return updateElementInDocument(documentData, selection, { textStyle: { ...element.textStyle, ...patch } })
}

function updateElementsInDocument(documentData: ArchitectureDocument, selections: Selection[], patch: Record<string, unknown>) {
  const next = structuredClone(documentData)
  const selectionIds = {
    layers: new Set(selections.filter((selection) => selection.kind === 'layer').map((selection) => selection.id)),
    groups: new Set(selections.filter((selection) => selection.kind === 'group').map((selection) => selection.id)),
    cards: new Set(selections.filter((selection) => selection.kind === 'card').map((selection) => selection.id)),
  }
  next.layers = next.layers.map((item) => selectionIds.layers.has(item.id) ? { ...item, ...patch } as Layer : item)
  next.groups = next.groups.map((item) => selectionIds.groups.has(item.id) ? { ...item, ...patch } as ArchitectureGroup : item)
  next.cards = next.cards.map((item) => selectionIds.cards.has(item.id) ? { ...item, ...patch } as Card : item)
  next.updatedAt = new Date().toISOString()
  return next
}

function updateStylesInDocument(documentData: ArchitectureDocument, selections: Selection[], patch: Partial<BoxStyle>) {
  const next = structuredClone(documentData)
  const selectionIds = new Set(selections.map((selection) => `${selection.kind}:${selection.id}`))
  next.layers = next.layers.map((item) => selectionIds.has(`layer:${item.id}`) ? { ...item, style: { ...item.style, ...patch } } : item)
  next.groups = next.groups.map((item) => selectionIds.has(`group:${item.id}`) ? { ...item, style: { ...item.style, ...patch } } : item)
  next.cards = next.cards.map((item) => selectionIds.has(`card:${item.id}`) ? { ...item, style: { ...item.style, ...patch } } : item)
  next.updatedAt = new Date().toISOString()
  return next
}

function updateTextStylesInDocument(documentData: ArchitectureDocument, selections: Selection[], patch: Partial<TextStyle>) {
  const next = structuredClone(documentData)
  const selectionIds = new Set(selections.map((selection) => `${selection.kind}:${selection.id}`))
  next.layers = next.layers.map((item) => selectionIds.has(`layer:${item.id}`) ? { ...item, textStyle: { ...item.textStyle, ...patch } } : item)
  next.groups = next.groups.map((item) => selectionIds.has(`group:${item.id}`) ? { ...item, textStyle: { ...item.textStyle, ...patch } } : item)
  next.cards = next.cards.map((item) => selectionIds.has(`card:${item.id}`) ? { ...item, textStyle: { ...item.textStyle, ...patch } } : item)
  next.updatedAt = new Date().toISOString()
  return next
}

function deleteSelectionFromDocument(documentData: ArchitectureDocument, selection: Selection) {
  const next = structuredClone(documentData)
  if (selection.kind === 'layer') {
    const childGroupIds = next.groups.filter((item) => item.parentLayerId === selection.id).map((item) => item.id)
    next.layers = next.layers.filter((item) => item.id !== selection.id)
    next.groups = next.groups.filter((item) => item.parentLayerId !== selection.id)
    next.cards = next.cards.filter((item) => item.parentLayerId !== selection.id && !(item.parentGroupId && childGroupIds.includes(item.parentGroupId)))
  } else if (selection.kind === 'group') {
    next.groups = next.groups.filter((item) => item.id !== selection.id)
    next.cards = next.cards.filter((item) => item.parentGroupId !== selection.id)
  } else {
    next.cards = next.cards.filter((item) => item.id !== selection.id)
  }
  next.updatedAt = new Date().toISOString()
  return next
}

function deleteSelectionsFromDocument(documentData: ArchitectureDocument, selections: Selection[]) {
  const next = selections.reduce((current, selection) => deleteSelectionFromDocument(current, selection), documentData)
  return { ...next, updatedAt: new Date().toISOString() }
}

function moveSelections(documentData: ArchitectureDocument, selections: Selection[], dx: number, dy: number) {
  if (selections.length === 1) return moveElement(documentData, selections[0].kind, selections[0].id, dx, dy)
  const next = structuredClone(documentData)
  selections.filter((selection) => selection.kind === 'card').forEach((selection) => {
    const card = next.cards.find((item) => item.id === selection.id)
    if (card) {
      card.x += dx
      card.y += dy
    }
  })
  next.updatedAt = new Date().toISOString()
  return next
}

function sameSelection(left: Selection, right: Selection) {
  return left.kind === right.kind && left.id === right.id
}

function commonValue<T>(values: T[]) {
  if (!values.length || !values.every((value) => value === values[0])) return undefined
  return values[0]
}

function App() {
  const initialDocument = useMemo(() => createDocument('product', 'colorful'), [])
  const [documentData, setDocumentData] = useState<ArchitectureDocument>(initialDocument)
  const [sourceText, setSourceText] = useState(initialDocument.sourceText)
  const [activeTemplateId, setActiveTemplateId] = useState<TemplateId>('product')
  const [selected, setSelected] = useState<Selection[]>([])
  const [editing, setEditing] = useState<EditingState>(null)
  const [editingValue, setEditingValue] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [zoom, setZoom] = useState(0.72)
  const [pan, setPan] = useState({ x: 42, y: 38 })
  const [toast, setToast] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState<DraftSnapshot | null>(() => readDraftSnapshot())
  const [draftSavedAt, setDraftSavedAt] = useState('')
  const [historyTick, setHistoryTick] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const spaceDownRef = useRef(false)
  const panRef = useRef<{ pointerX: number; pointerY: number; panX: number; panY: number } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const [marquee, setMarquee] = useState<MarqueeState | null>(null)
  const historyRef = useRef({ entries: [initialDocument], index: 0 })
  const initialStateRef = useRef({ documentData: initialDocument, sourceText: initialDocument.sourceText, activeTemplateId: 'product' as TemplateId })

  const theme = themes[documentData.themeId]
  const template = templates[activeTemplateId]
  const primarySelection = selected[0] ?? null
  const selectedElement = getElement(documentData, primarySelection)
  const selectedCards = selected
    .filter((selection) => selection.kind === 'card')
    .map((selection) => documentData.cards.find((card) => card.id === selection.id))
    .filter((card): card is Card => Boolean(card))
  const isMultiCardSelection = selectedCards.length > 1 && selectedCards.length === selected.length
  const canUndo = historyRef.current.index > 0
  const canRedo = historyRef.current.index < historyRef.current.entries.length - 1

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }, [])

  useEffect(() => {
    const initialState = initialStateRef.current
    if (draftPrompt || (documentData === initialState.documentData && sourceText === initialState.sourceText && activeTemplateId === initialState.activeTemplateId)) return
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString()
      const snapshot: DraftSnapshot = { documentData, sourceText, activeTemplateId, savedAt }
      try {
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot))
        setDraftSavedAt(savedAt)
      } catch {
        // 浏览器禁用本地存储时仍保持当前编辑会话可用。
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [activeTemplateId, documentData, draftPrompt, sourceText])

  const commit = useCallback((next: ArchitectureDocument) => {
    const current = historyRef.current
    const entries = current.entries.slice(0, current.index + 1)
    entries.push(next)
    historyRef.current = { entries: entries.slice(-50), index: Math.min(entries.length - 1, 49) }
    setDocumentData(next)
    setHistoryTick((value) => value + 1)
  }, [])

  const undo = useCallback(() => {
    const history = historyRef.current
    if (history.index === 0) return
    history.index -= 1
    setDocumentData(history.entries[history.index])
    setSelected([])
    setHistoryTick((value) => value + 1)
  }, [])

  const redo = useCallback(() => {
    const history = historyRef.current
    if (history.index >= history.entries.length - 1) return
    history.index += 1
    setDocumentData(history.entries[history.index])
    setSelected([])
    setHistoryTick((value) => value + 1)
  }, [])

  const generate = useCallback((message = '架构图已重新生成') => {
    const parsed = parseArchitectureText(sourceText)
    setParseResult(parsed)
    const fatal = parsed.errors.some((error) => error.message.includes('超过 4 级') || error.message.includes('没有可生成'))
    if (fatal) {
      notify('请先修正文本格式问题')
      return
    }
    const next = buildDocument(parsed.roots, activeTemplateId, themes[documentData.themeId], sourceText, parsed.title, template.multiPaletteLayerIndexes)
    commit(next)
    setSelected([])
    notify(message)
  }, [activeTemplateId, commit, documentData.themeId, notify, sourceText])

  const chooseTemplate = (id: TemplateId) => {
    setActiveTemplateId(id)
    setSourceText(templates[id].sourceTemplate)
    setParseResult(null)
    setSelected([])
  }

  const copyTemplate = async () => {
    if (await copyTextToClipboard(template.sourceTemplate)) {
      notify('文字模板已复制')
    } else {
      notify('复制失败，请检查浏览器剪贴板权限')
    }
  }

  const copyAiPrompt = async () => {
    if (await copyTextToClipboard(template.aiPrompt)) {
      notify('AI 提示词已复制')
    } else {
      notify('复制失败，请检查浏览器剪贴板权限')
    }
  }

  const loadExample = () => {
    setSourceText(template.exampleSource)
    setParseResult(null)
    notify('已加载示例内容')
  }

  const newDocument = () => {
    if (!window.confirm('新建将清空当前画布，是否继续？')) return
    const next = createDocument(activeTemplateId, documentData.themeId)
    commit(next)
    setSourceText(next.sourceText)
    setSelected([])
    notify('已新建架构图')
  }

  const openDocument = () => fileInputRef.current?.click()

  const restoreDraft = () => {
    if (!draftPrompt) return
    setDocumentData(draftPrompt.documentData)
    setSourceText(draftPrompt.sourceText)
    setActiveTemplateId(draftPrompt.activeTemplateId)
    historyRef.current = { entries: [draftPrompt.documentData], index: 0 }
    setHistoryTick((value) => value + 1)
    setDraftSavedAt(draftPrompt.savedAt)
    setDraftPrompt(null)
    setParseResult(null)
    setSelected([])
    notify('已恢复上次未完成草稿')
  }

  const discardDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY)
    } catch {
      // 浏览器禁用本地存储时无需额外处理。
    }
    setDraftPrompt(null)
    notify('已放弃上次草稿')
  }

  const handleOpenFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text()) as ArchitectureDocument
      if (parsed.schemaVersion !== 1 || !parsed.canvas || !Array.isArray(parsed.layers) || !Array.isArray(parsed.cards)) {
        throw new Error('JSON 结构不兼容')
      }
      commit(parsed)
      setActiveTemplateId(parsed.templateId)
      setSourceText(parsed.sourceText ?? '')
      setSelected([])
      setDraftPrompt(null)
      setDraftSavedAt('')
      notify('JSON 源文件已打开')
    } catch (error) {
      notify(error instanceof Error ? `打开失败：${error.message}` : '打开失败，请检查文件')
    }
  }

  const updateCanvas = (patch: Partial<ArchitectureDocument['canvas']>) => {
    commit({ ...documentData, canvas: { ...documentData.canvas, ...patch }, updatedAt: new Date().toISOString() })
  }

  const changeTheme = (themeId: ThemeId) => {
    commit(applyTheme(documentData, themes[themeId], template.multiPaletteLayerIndexes))
    notify(`已切换主题：${themes[themeId].name}`)
  }

  const autoLayout = () => {
    if (!window.confirm('自动布局将重新整理卡片位置，是否继续？')) return
    generate('已按模板重新布局')
  }

  const tidy = () => {
    commit(tidyDocument(documentData))
    notify('已整理并修复卡片重叠')
  }

  const updateSelected = (patch: Record<string, unknown>) => {
    if (selected.length !== 1) return
    commit(updateElementInDocument(documentData, selected[0], patch))
  }

  const updateSelectedStyle = (patch: Partial<BoxStyle>) => {
    if (!selected.length) return
    commit(selected.length === 1 ? updateStyleInDocument(documentData, selected[0], patch) : updateStylesInDocument(documentData, selected, patch))
  }

  const updateSelectedTextStyle = (patch: Partial<TextStyle>) => {
    if (!selected.length) return
    commit(selected.length === 1 ? updateTextStyleInDocument(documentData, selected[0], patch) : updateTextStylesInDocument(documentData, selected, patch))
  }

  const startEditing = (kind: ElementKind, id: string) => {
    const element = getElement(documentData, { kind, id })
    if (!element) return
    setSelected([{ kind, id }])
    setEditing({ kind, id })
    setEditingValue(elementName(element))
  }

  const finishEditing = (cancel = false) => {
    if (!editing) return
    if (!cancel && editingValue.trim()) {
      commit(updateElementInDocument(documentData, editing, editing.kind === 'card' ? { title: editingValue.trim() } : { name: editingValue.trim() }))
    }
    setEditing(null)
  }

  const startMove = (event: ReactPointerEvent, kind: ElementKind, id: string) => {
    if (event.button !== 0 || spaceDownRef.current) return
    event.stopPropagation()
    const selection = { kind, id }
    const isModifierSelection = kind === 'card' && (event.ctrlKey || event.metaKey)
    if (isModifierSelection) {
      if (selected.some((item) => item.kind !== 'card')) {
        setSelected([selection])
        return
      }
      const exists = selected.some((item) => sameSelection(item, selection))
      if (exists) {
        setSelected(selected.filter((item) => !sameSelection(item, selection)))
        return
      }
      const anchor = selected[0]
      const anchorCard = anchor?.kind === 'card' ? documentData.cards.find((card) => card.id === anchor.id) : null
      const card = documentData.cards.find((item) => item.id === id)
      if (anchorCard && card && (anchorCard.parentLayerId !== card.parentLayerId || anchorCard.level !== card.level)) {
        notify('只能选择同一层级区域、同一层级的卡片')
        return
      }
      setSelected([...selected, selection])
      return
    }
    const nextSelections = selected.some((item) => sameSelection(item, selection)) ? selected : [selection]
    setSelected(nextSelections)
    dragRef.current = { type: 'move', selections: nextSelections, pointerX: event.clientX, pointerY: event.clientY, base: documentData, current: documentData }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const startResize = (event: ReactPointerEvent, kind: ElementKind, id: string, direction: string) => {
    event.stopPropagation()
    const selection = { kind, id }
    setSelected([selection])
    dragRef.current = { type: 'resize', selections: [selection], direction, pointerX: event.clientX, pointerY: event.clientY, base: documentData, current: documentData }
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  const handleCanvasPointerMove = (event: ReactPointerEvent) => {
    const marqueeStart = marqueeRef.current
    if (marqueeStart) {
      const viewport = viewportRef.current
      if (!viewport) return
      const rect = viewport.getBoundingClientRect()
      const next = { ...marqueeStart, currentX: event.clientX - rect.left, currentY: event.clientY - rect.top }
      marqueeRef.current = next
      setMarquee(next)
      return
    }
    const drag = dragRef.current
    if (!drag) {
      const panStart = panRef.current
      if (panStart) setPan({ x: panStart.panX + event.clientX - panStart.pointerX, y: panStart.panY + event.clientY - panStart.pointerY })
      return
    }
    const dx = (event.clientX - drag.pointerX) / zoom
    const dy = (event.clientY - drag.pointerY) / zoom
    const next = drag.type === 'move'
      ? moveSelections(drag.base, drag.selections, dx, dy)
      : resizeElement(drag.base, drag.selections[0].kind, drag.selections[0].id, drag.direction ?? 'se', dx, dy)
    drag.current = next
    setDocumentData(next)
  }

  const handleCanvasPointerUp = () => {
    if (dragRef.current) {
      commit(dragRef.current.current)
      dragRef.current = null
    }
    const marqueeStart = marqueeRef.current
    if (marqueeStart) {
      const viewport = viewportRef.current
      marqueeRef.current = null
      setMarquee(null)
      if (viewport) {
        const left = Math.min(marqueeStart.startX, marqueeStart.currentX)
        const right = Math.max(marqueeStart.startX, marqueeStart.currentX)
        const top = Math.min(marqueeStart.startY, marqueeStart.currentY)
        const bottom = Math.max(marqueeStart.startY, marqueeStart.currentY)
        if (right - left > 5 && bottom - top > 5) {
          const candidates = documentData.cards.filter((card) => {
            const cardLeft = pan.x + card.x * zoom
            const cardTop = pan.y + card.y * zoom
            const cardRight = cardLeft + card.width * zoom
            const cardBottom = cardTop + card.height * zoom
            return cardLeft < right && cardRight > left && cardTop < bottom && cardBottom > top
          })
          const first = candidates[0]
          const compatible = first ? candidates.filter((card) => card.parentLayerId === first.parentLayerId && card.level === first.level) : []
          const marqueeSelections = compatible.map((card) => ({ kind: 'card' as const, id: card.id }))
          const canAppend = marqueeStart.append && selected.length > 0 && selected.every((selection) => selection.kind === 'card')
          const nextSelections = canAppend
            ? [...selected, ...marqueeSelections.filter((candidate) => !selected.some((item) => sameSelection(item, candidate)))]
            : marqueeSelections
          setSelected(nextSelections)
        } else if (!marqueeStart.append) {
          setSelected([])
        }
      }
    }
    panRef.current = null
  }

  const startPan = (event: ReactPointerEvent) => {
    if (event.button === 1 || spaceDownRef.current) {
      panRef.current = { pointerX: event.clientX, pointerY: event.clientY, panX: pan.x, panY: pan.y }
      event.preventDefault()
      return
    }
    if (event.button !== 0) return
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const pointX = event.clientX - rect.left
    const pointY = event.clientY - rect.top
    const next = { startX: pointX, startY: pointY, currentX: pointX, currentY: pointY, append: event.ctrlKey || event.metaKey }
    marqueeRef.current = next
    setMarquee(next)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const fitCanvas = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    const availableWidth = Math.max(320, viewport.clientWidth - 70)
    const availableHeight = Math.max(240, viewport.clientHeight - 70)
    setZoom(clamp(Math.min(availableWidth / documentData.canvas.width, availableHeight / documentData.canvas.height), 0.25, 1))
    setPan({ x: 35, y: 35 })
  }

  const removeSelected = useCallback(() => {
    if (!selected.length) return
    commit(selected.length === 1 ? deleteSelectionFromDocument(documentData, selected[0]) : deleteSelectionsFromDocument(documentData, selected))
    setSelected([])
    notify(selected.length > 1 ? `已删除 ${selected.length} 个选中元素` : '已删除选中元素')
  }, [commit, documentData, notify, selected])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        spaceDownRef.current = true
        event.preventDefault()
      }
      if (isTypingTarget(event.target)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        downloadJson(documentData)
        notify('JSON 源文件已保存')
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        removeSelected()
      } else if (event.key === 'Escape') {
        setExportOpen(false)
        if (editing) finishEditing(true)
      }
    }
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceDownRef.current = false
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    return () => {
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
    }
  })

  const elementBoxStyle = (element: ElementRecord, localX = element.x, localY = element.y): CSSProperties => ({
    left: localX,
    top: localY,
    width: element.width,
    height: element.height,
    background: element.style.background,
    border: `${element.style.borderWidth}px solid ${element.style.border}`,
    borderRadius: element.style.radius,
    opacity: element.style.opacity,
  })

  const renderResizeHandles = (kind: ElementKind, id: string) => {
    if (selected.length !== 1 || selected[0].kind !== kind || selected[0].id !== id) return null
    return <>
      {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((direction) => <span key={direction} className={`resize-handle handle-${direction}`} onPointerDown={(event) => startResize(event, kind, id, direction)} />)}
    </>
  }

  const editingInput = (kind: ElementKind, id: string, className: string) => editing?.kind === kind && editing.id === id ? (
    <input
      autoFocus
      className={`inline-edit ${className}`}
      value={editingValue}
      onChange={(event) => setEditingValue(event.target.value)}
      onBlur={() => finishEditing()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finishEditing()
        if (event.key === 'Escape') finishEditing(true)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  ) : null

  const renderCard = (card: Card, parent: Layer | ArchitectureGroup) => {
    const localX = card.x - parent.x
    const localY = card.y - parent.y
    const isSelected = selected.some((selection) => selection.kind === 'card' && selection.id === card.id)
    return <div
      key={card.id}
      className={`canvas-element canvas-card card-level-${card.level ?? 3} ${isSelected ? 'is-selected' : ''}`}
      style={elementBoxStyle(card, localX, localY)}
      onPointerDown={(event) => startMove(event, 'card', card.id)}
      onDoubleClick={() => startEditing('card', card.id)}
    >
      <div className="card-title" style={{ color: card.textStyle.color, fontFamily: card.textStyle.fontFamily, fontSize: card.textStyle.fontSize, fontWeight: card.textStyle.bold ? 700 : 500 }}>{editingInput('card', card.id, 'card-title-edit') ?? card.title}</div>
      {card.items.length > 0 && <div className="card-items">{card.items.map((item) => <div key={item} className="card-item">{item}</div>)}</div>}
      {renderResizeHandles('card', card.id)}
    </div>
  }

  const renderGroup = (group: ArchitectureGroup, layer: Layer) => {
    const localX = group.x - layer.x
    const localY = group.y - layer.y
    const isSelected = selected.length === 1 && selected[0].kind === 'group' && selected[0].id === group.id
    return <div
      key={group.id}
      className={`canvas-element canvas-group ${isSelected ? 'is-selected' : ''}`}
      style={elementBoxStyle(group, localX, localY)}
      onPointerDown={(event) => startMove(event, 'group', group.id)}
      onDoubleClick={() => startEditing('group', group.id)}
    >
      <div className="group-title" style={{ color: group.textStyle.color, fontFamily: group.textStyle.fontFamily, fontSize: group.textStyle.fontSize, fontWeight: group.textStyle.bold ? 700 : 600 }}>{editingInput('group', group.id, 'group-title-edit') ?? group.name}</div>
      {group.summaryItems.length > 0 && <div className="group-summary">{group.summaryItems.map((item) => <div key={item}>• {item}</div>)}</div>}
      {documentData.cards.filter((card) => card.parentGroupId === group.id).map((card) => renderCard(card, group))}
      {renderResizeHandles('group', group.id)}
    </div>
  }

  const renderLayer = (layer: Layer) => {
    const isSelected = selected.length === 1 && selected[0].kind === 'layer' && selected[0].id === layer.id
    const leftLabelLayer = ['product', 'layered', 'matrix'].includes(documentData.templateId)
    return <div
      key={layer.id}
      className={`canvas-element canvas-layer ${leftLabelLayer ? 'left-label-layer' : ''} ${isSelected ? 'is-selected' : ''}`}
      style={elementBoxStyle(layer)}
      onPointerDown={(event) => startMove(event, 'layer', layer.id)}
      onDoubleClick={() => startEditing('layer', layer.id)}
    >
      <div className="layer-title" style={{ color: layer.textStyle.color, fontFamily: layer.textStyle.fontFamily, fontSize: layer.textStyle.fontSize, fontWeight: layer.textStyle.bold ? 700 : 600 }}>{editingInput('layer', layer.id, 'layer-title-edit') ?? layer.name}</div>
      {documentData.groups.filter((group) => group.parentLayerId === layer.id).map((group) => renderGroup(group, layer))}
      {documentData.cards.filter((card) => card.parentLayerId === layer.id && !card.parentGroupId).map((card) => renderCard(card, layer))}
      {renderResizeHandles('layer', layer.id)}
    </div>
  }

  const selectedKind = selectedElement ? elementLabel(primarySelection?.kind ?? 'card') : isMultiCardSelection ? '多选卡片' : '未选择元素'
  const commonFontFamily = commonValue(selectedCards.map((card) => card.textStyle.fontFamily))
  const commonFontSize = commonValue(selectedCards.map((card) => card.textStyle.fontSize))
  const commonTextColor = commonValue(selectedCards.map((card) => card.textStyle.color))
  const commonBackground = commonValue(selectedCards.map((card) => card.style.background))
  const commonBorder = commonValue(selectedCards.map((card) => card.style.border))
  const commonBorderWidth = commonValue(selectedCards.map((card) => card.style.borderWidth))
  const commonRadius = commonValue(selectedCards.map((card) => card.style.radius))
  const allSelectedCardsBold = selectedCards.length > 0 && selectedCards.every((card) => card.textStyle.bold)
  void historyTick

  return <div className="app-shell" style={{ '--accent': theme.editorAccent } as CSSProperties}>
    {draftPrompt && <div className="draft-dialog-backdrop">
      <div className="draft-dialog" role="dialog" aria-modal="true" aria-labelledby="draft-dialog-title">
        <span className="eyebrow">AUTOSAVE</span>
        <h3 id="draft-dialog-title">检测到未完成草稿</h3>
        <p>浏览器在 {formatDraftTime(draftPrompt.savedAt)} 保存了一份本地草稿，是否继续编辑？</p>
        <div className="draft-dialog-actions">
          <button className="secondary-button" onClick={discardDraft}>放弃草稿</button>
          <button className="primary-button" onClick={restoreDraft}>恢复草稿</button>
        </div>
      </div>
    </div>}
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark">A</div>
        <div>
          <div className="brand-title">ArchStencil</div>
          <div className="brand-subtitle">架构图工坊 · 结构化文字成图</div>
        </div>
      </div>
      <div className="toolbar-group">
        <button className="tool-button" onClick={newDocument}><span>＋</span>新建</button>
        <button className="tool-button" title="打开 JSON 源文件" onClick={openDocument}><span>↥</span>打开 JSON</button>
        <button className="tool-button" onClick={() => { downloadJson(documentData); notify('JSON 源文件已保存') }}><span>↓</span>保存</button>
        <input ref={fileInputRef} type="file" accept=".json,application/json" hidden onChange={handleOpenFile} />
      </div>
      <div className="toolbar-divider" />
      <div className="toolbar-group">
        <button className="icon-button" title="撤销" disabled={!canUndo} onClick={undo}>↶</button>
        <button className="icon-button" title="重做" disabled={!canRedo} onClick={redo}>↷</button>
        <button className="tool-button" onClick={autoLayout}>自动布局</button>
        <button className="tool-button" onClick={tidy}>整理对齐</button>
      </div>
      <div className="toolbar-spacer" />
      <div className="toolbar-group compact-group">
        <select className="toolbar-select" value={documentData.themeId} onChange={(event) => changeTheme(event.target.value as ThemeId)} aria-label="主题">
          {Object.values(themes).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button className="icon-button" title="缩小" onClick={() => setZoom((value) => clamp(value - 0.1, 0.25, 3))}>−</button>
        <button className="zoom-label" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
        <button className="icon-button" title="放大" onClick={() => setZoom((value) => clamp(value + 0.1, 0.25, 3))}>＋</button>
        <button className="tool-button" onClick={fitCanvas}>适应屏幕</button>
        <div className="export-wrap">
          <button className="primary-button" onClick={() => setExportOpen((value) => !value)}>导出⌄</button>
          {exportOpen && <div className="export-menu">
            <button onClick={async () => { try { await downloadPng(documentData, 2); notify('PNG 2x 已导出') } catch (error) { notify(error instanceof Error ? error.message : '导出失败') } setExportOpen(false) }}>PNG 2x</button>
            <button onClick={async () => { try { await downloadPng(documentData, 4); notify('PNG 4x 已导出') } catch (error) { notify(error instanceof Error ? error.message : '导出失败') } setExportOpen(false) }}>PNG 4x</button>
            <button onClick={() => { downloadSvg(documentData); notify('SVG 已导出'); setExportOpen(false) }}>SVG</button>
            <button onClick={() => { downloadHtml(documentData); notify('独立 HTML 已导出'); setExportOpen(false) }}>独立 HTML</button>
          </div>}
        </div>
      </div>
    </header>

    <main className="workspace">
      <aside className="left-panel panel">
        <div className="panel-heading">
          <div><span className="eyebrow">TEMPLATE</span><h2>架构模板</h2></div>
          <span className="template-count">3 个内置</span>
        </div>
        <div className="template-list">
          {Object.values(templates).map((item) => <button key={item.id} className={`template-option ${activeTemplateId === item.id ? 'active' : ''}`} onClick={() => chooseTemplate(item.id)}>
            <span className="radio-dot" />
            <span><strong>{item.name}</strong><small>{item.layoutHint}</small></span>
          </button>)}
        </div>
        <div className="template-description">{template.description}</div>
        <div className="source-heading"><span><span className="eyebrow">SOURCE</span><strong>架构文字</strong></span><span className="source-hint">推荐 L1～L4</span></div>
        <div className="format-guide">
          <div className="format-guide-head"><strong>推荐输入格式</strong><code>L1 / L2 / L3 / L4</code><button onClick={copyAiPrompt}>复制 AI 提示词</button></div>
          <p>L1 是左侧层级标签，L2～L4 是独立卡片；也兼容旧版缩进格式。</p>
        </div>
        <textarea className="source-editor" value={sourceText} onChange={(event) => setSourceText(event.target.value)} spellCheck={false} />
        <div className="source-actions">
          <button className="secondary-button" onClick={copyTemplate}>复制文字模板</button>
          <button className="secondary-button" onClick={loadExample}>加载示例</button>
        </div>
        {parseResult && <div className={`parse-status ${parseResult.errors.length ? 'has-errors' : 'success'}`}>
          <div className="status-title">{parseResult.errors.length ? `发现 ${parseResult.errors.length} 个提示` : `已识别 ${parseResult.nodeCount} 个节点 · ${parseResult.format === 'explicit-level' ? 'L1～L4 格式' : '缩进格式'}`}</div>
          {parseResult.errors.map((error) => <div key={`${error.line}-${error.message}`} className="parse-error">第 {error.line} 行：{error.message}</div>)}
        </div>}
        <button className="generate-button" onClick={() => generate()}><span>✦</span>生成架构图</button>
        <div className="left-footer"><span className="status-dot" />本地模式 · 修改后自动保存草稿</div>
      </aside>

      <section className="canvas-panel">
        <div className="canvas-toolbar-note"><span>画布</span><span className="canvas-note-divider">/</span><span>{documentData.title}</span><span className="canvas-tip">Space + 拖动移动画布 · 双击文字编辑</span></div>
        <div
          ref={viewportRef}
          className="canvas-viewport"
          onPointerDown={startPan}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault()
              setZoom((value) => clamp(value + (event.deltaY > 0 ? -0.08 : 0.08), 0.25, 3))
            }
          }}
        >
          <div className="canvas-surface" style={{ width: documentData.canvas.width, height: documentData.canvas.height, background: documentData.canvas.background, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="canvas-heading">{documentData.title}</div>
            {documentData.layers.map(renderLayer)}
          </div>
          {marquee && <div className="selection-marquee" style={{ left: Math.min(marquee.startX, marquee.currentX), top: Math.min(marquee.startY, marquee.currentY), width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY) }} />}
        </div>
        <div className="canvas-statusbar">
          <span>画布 {documentData.canvas.width} × {documentData.canvas.height}</span>
          <span>元素 {documentData.layers.length + documentData.groups.length + documentData.cards.length}</span>
          <span>{draftSavedAt ? `草稿已保存 · ${formatDraftTime(draftSavedAt)}` : '修改后自动保存草稿'}</span>
        </div>
      </section>

      <aside className="right-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">INSPECTOR</span><h2>{selected.length ? selectedKind : '画布设置'}</h2></div>{selected.length > 0 && <button className="text-button danger" onClick={removeSelected}>{selected.length > 1 ? `删除 ${selected.length} 个` : '删除'}</button>}</div>
        {isMultiCardSelection ? <div className="inspector-content">
          <div className="multi-selection-note"><strong>已选择 {selectedCards.length} 个同层级卡片</strong><p>下面的文字和卡片样式会同时应用到全部选中项。</p></div>
          <div className="inspector-section"><div className="section-title">批量文字设置</div>
            <label className="field-label">字体</label>
            <select className="field-input" value={commonFontFamily ?? ''} onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}>
              <option value="" disabled>多种字体</option><option>Microsoft YaHei, Arial, sans-serif</option><option>SimHei, sans-serif</option><option>SimSun, serif</option><option>Arial, sans-serif</option>
            </select>
            <div className="field-row"><div><label className="field-label">字号</label><input className="field-input" type="number" min="10" max="48" value={commonFontSize ?? ''} placeholder="多种字号" onChange={(event) => { if (event.target.value) updateSelectedTextStyle({ fontSize: clamp(Number(event.target.value), 10, 48) }) }} /></div><ColorCodeField label="文字色" value={commonTextColor ?? ''} placeholder="多种颜色，输入后统一设置" onChange={(value) => updateSelectedTextStyle({ color: value })} /></div>
            <button className={`toggle-button ${allSelectedCardsBold ? 'active' : ''}`} onClick={() => updateSelectedTextStyle({ bold: !allSelectedCardsBold })}><strong>B</strong> {allSelectedCardsBold ? '取消加粗' : '加粗'}</button>
          </div>
          <div className="inspector-section"><div className="section-title">批量卡片设置</div>
            <div className="field-row"><ColorCodeField label="背景色" value={commonBackground ?? ''} placeholder="多种颜色，输入后统一设置" onChange={(value) => updateSelectedStyle({ background: value })} /><ColorCodeField label="边框色" value={commonBorder ?? ''} placeholder="多种颜色，输入后统一设置" onChange={(value) => updateSelectedStyle({ border: value })} /></div>
            <div className="field-row"><div><label className="field-label">边框粗细</label><select className="field-input" value={commonBorderWidth ?? ''} onChange={(event) => updateSelectedStyle({ borderWidth: Number(event.target.value) })}><option value="" disabled>多种粗细</option><option value="0">0 px</option><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option><option value="4">4 px</option></select></div><div><label className="field-label">圆角</label><select className="field-input" value={commonRadius ?? ''} onChange={(event) => updateSelectedStyle({ radius: Number(event.target.value) })}><option value="" disabled>多种圆角</option><option value="0">0 px</option><option value="4">4 px</option><option value="8">8 px</option><option value="12">12 px</option><option value="16">16 px</option><option value="20">20 px</option></select></div></div>
          </div>
        </div> : selectedElement && primarySelection ? <div className="inspector-content">
          <label className="field-label">名称</label>
          <input className="field-input" value={elementName(selectedElement)} onChange={(event) => updateSelected(primarySelection.kind === 'card' ? { title: event.target.value } : { name: event.target.value })} />
          <div className="inspector-section"><div className="section-title">文字设置</div>
            <label className="field-label">字体</label>
            <select className="field-input" value={selectedElement.textStyle.fontFamily} onChange={(event) => updateSelectedTextStyle({ fontFamily: event.target.value })}>
              <option>Microsoft YaHei, Arial, sans-serif</option><option>SimHei, sans-serif</option><option>SimSun, serif</option><option>Arial, sans-serif</option>
            </select>
            <div className="field-row"><div><label className="field-label">字号</label><input className="field-input" type="number" min="10" max="48" value={selectedElement.textStyle.fontSize} onChange={(event) => updateSelectedTextStyle({ fontSize: clamp(Number(event.target.value) || 14, 10, 48) })} /></div><ColorCodeField label="文字色" value={selectedElement.textStyle.color} onChange={(value) => updateSelectedTextStyle({ color: value })} /></div>
            <button className={`toggle-button ${selectedElement.textStyle.bold ? 'active' : ''}`} onClick={() => updateSelectedTextStyle({ bold: !selectedElement.textStyle.bold })}><strong>B</strong> 加粗</button>
          </div>
          <div className="inspector-section"><div className="section-title">卡片设置</div>
            <div className="field-row"><ColorCodeField label="背景色" value={selectedElement.style.background} onChange={(value) => updateSelectedStyle({ background: value })} /><ColorCodeField label="边框色" value={selectedElement.style.border} onChange={(value) => updateSelectedStyle({ border: value })} /></div>
            <div className="field-row"><div><label className="field-label">边框粗细</label><select className="field-input" value={selectedElement.style.borderWidth} onChange={(event) => updateSelectedStyle({ borderWidth: Number(event.target.value) })}><option value="0">0 px</option><option value="1">1 px</option><option value="2">2 px</option><option value="3">3 px</option><option value="4">4 px</option></select></div><div><label className="field-label">圆角</label><select className="field-input" value={selectedElement.style.radius} onChange={(event) => updateSelectedStyle({ radius: Number(event.target.value) })}><option value="0">0 px</option><option value="4">4 px</option><option value="8">8 px</option><option value="12">12 px</option><option value="16">16 px</option><option value="20">20 px</option></select></div></div>
          </div>
          <div className="geometry-card"><div><span>位置</span><strong>{Math.round(selectedElement.x)}, {Math.round(selectedElement.y)}</strong></div><div><span>尺寸</span><strong>{Math.round(selectedElement.width)} × {Math.round(selectedElement.height)}</strong></div></div>
        </div> : <div className="inspector-content">
          <div className="canvas-settings-card"><div className="section-title">画布尺寸</div><div className="field-row"><div><label className="field-label">宽度</label><input className="field-input" type="number" min="800" max="12000" value={documentData.canvas.width} onChange={(event) => updateCanvas({ width: clamp(Number(event.target.value) || 1920, 800, 12000) })} /></div><div><label className="field-label">高度</label><input className="field-input" type="number" min="600" max="12000" value={documentData.canvas.height} onChange={(event) => updateCanvas({ height: clamp(Number(event.target.value) || 1080, 600, 12000) })} /></div></div><ColorCodeField label="画布背景" value={documentData.canvas.background} onChange={(value) => updateCanvas({ background: value })} /></div>
          <div className="canvas-presets"><div className="section-title">尺寸预设</div><div className="preset-grid"><button onClick={() => updateCanvas({ width: 1920, height: 1080 })}>1920 × 1080</button><button onClick={() => updateCanvas({ width: 2560, height: 1440 })}>2560 × 1440</button><button onClick={() => updateCanvas({ width: 2970, height: 2100 })}>A4 横向</button><button onClick={() => updateCanvas({ width: 3840, height: 2160 })}>4K 16:9</button></div></div>
          <div className="guide-card"><span className="guide-icon">✦</span><div><strong>编辑提示</strong><p>选中元素后可在右侧调整样式；拖动空白区域或按住 Space 可移动画布。</p></div></div>
        </div>}
      </aside>
    </main>
    {toast && <div className="toast"><span>✓</span>{toast}</div>}
  </div>
}

export default App
