import { ArchitectureDocument, ArchitectureGroup, Card, Layer, TextStyle } from '../types'

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character] ?? character))
}

function textLines(text: string, maxCharacters: number) {
  const chars = [...text]
  const lines: string[] = []
  for (let index = 0; index < chars.length; index += maxCharacters) lines.push(chars.slice(index, index + maxCharacters).join(''))
  return lines.length ? lines : ['']
}

function svgText(text: string, x: number, y: number, style: TextStyle, maxCharacters = 22) {
  const lines = textLines(text, maxCharacters)
  const anchor = style.align === 'center' ? 'middle' : style.align === 'right' ? 'end' : 'start'
  const offsetX = style.align === 'center' ? x : style.align === 'right' ? x : x
  return lines.map((line, index) => `<text x="${offsetX}" y="${y + index * (style.fontSize + 7)}" fill="${escapeXml(style.color)}" font-family="${escapeXml(style.fontFamily)}" font-size="${style.fontSize}" font-weight="${style.bold ? 700 : 400}" text-anchor="${anchor}">${escapeXml(line)}</text>`).join('')
}

function svgBox(element: Layer | ArchitectureGroup | Card) {
  return `<rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="${element.style.radius}" fill="${element.style.background}" fill-opacity="${element.style.opacity}" stroke="${element.style.border}" stroke-width="${element.style.borderWidth}"/>`
}

function layerSvg(layer: Layer, leftLabel: boolean) {
  const textY = leftLabel ? layer.y + layer.height / 2 + layer.textStyle.fontSize / 3 : layer.y + 38
  return `${svgBox(layer)}${svgText(layer.name, layer.x + layer.width / 2, textY, { ...layer.textStyle, align: 'center' }, leftLabel ? 8 : 40)}`
}

function groupSvg(group: ArchitectureGroup) {
  let content = `${svgBox(group)}${svgText(group.name, group.x + 16, group.y + 31, group.textStyle, 30)}`
  group.summaryItems.forEach((item, index) => {
    content += svgText(`• ${item}`, group.x + 18, group.y + 62 + index * 24, { ...group.textStyle, fontSize: 13, bold: false }, 30)
  })
  return content
}

function cardSvg(card: Card) {
  let content = `${svgBox(card)}${svgText(card.title, card.x + card.width / 2, card.y + 28, { ...card.textStyle, align: 'center' }, 24)}`
  card.items.forEach((item, index) => {
    content += svgText(`• ${item}`, card.x + 14, card.y + 53 + index * 22, { ...card.textStyle, fontSize: Math.max(12, card.textStyle.fontSize - 2), bold: false }, 26)
  })
  return content
}

export function documentToSvg(document: ArchitectureDocument) {
  const content = [
    `<rect width="${document.canvas.width}" height="${document.canvas.height}" fill="${document.canvas.background}"/>`,
    `<text x="${document.canvas.width / 2}" y="48" fill="#17324d" font-family="Microsoft YaHei, Arial, sans-serif" font-size="26" font-weight="700" text-anchor="middle">${escapeXml(document.title)}</text>`,
    ...document.layers.map((layer) => layerSvg(layer, true)),
    ...document.groups.map(groupSvg),
    ...document.cards.map(cardSvg),
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.canvas.width}" height="${document.canvas.height}" viewBox="0 0 ${document.canvas.width} ${document.canvas.height}">${content}</svg>`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function downloadText(content: string, filename: string, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([content], { type }), filename)
}

export function downloadJson(documentData: ArchitectureDocument) {
  downloadText(JSON.stringify(documentData, null, 2), `${documentData.name || 'architecture'}.json`, 'application/json;charset=utf-8')
}

export function downloadSvg(documentData: ArchitectureDocument) {
  downloadText(documentToSvg(documentData), `${documentData.name || 'architecture'}.svg`, 'image/svg+xml;charset=utf-8')
}

export function downloadHtml(documentData: ArchitectureDocument) {
  const svg = documentToSvg(documentData)
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(documentData.title)}</title><style>html,body{margin:0;background:#e2e8f0}body{padding:24px;display:flex;justify-content:center;align-items:flex-start}svg{max-width:100%;height:auto;background:#fff;box-shadow:0 12px 30px rgba(15,23,42,.12)}</style></head><body>${svg}</body></html>`
  downloadText(html, `${documentData.name || 'architecture'}.html`, 'text/html;charset=utf-8')
}

export async function downloadPng(documentData: ArchitectureDocument, scale: 2 | 4) {
  const width = documentData.canvas.width * scale
  const height = documentData.canvas.height * scale
  if (width > 16000 || height > 16000 || width * height > 160000000) {
    throw new Error('当前画布过大，浏览器可能无法稳定完成 PNG 导出，请先缩小画布或选择 SVG。')
  }
  const svgBlob = new Blob([documentToSvg(documentData)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('SVG 转 PNG 失败，请重试。'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器不支持 Canvas 导出。')
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('PNG 文件生成失败。')
    downloadBlob(blob, `${documentData.name || 'architecture'}-${scale}x.png`)
  } finally {
    URL.revokeObjectURL(url)
  }
}
