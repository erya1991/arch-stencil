import { ParseResult, ParsedNode } from '../types'

function stripBullet(value: string) {
  return value.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()
}

function leadingIndent(value: string) {
  const match = value.match(/^[ \t]*/)?.[0] ?? ''
  return [...match].reduce((total, char) => total + (char === '\t' ? 2 : 1), 0)
}

export function parseArchitectureText(input: string): ParseResult {
  const errors: ParseResult['errors'] = []
  const roots: ParsedNode[] = []
  const stack: Array<{ indent: number; node: ParsedNode }> = []
  const explicitStack: ParsedNode[] = []
  let title = '未命名架构图'
  let nodeCount = 0

  const lines = input.replace(/\r\n/g, '\n').split('\n')
  const contentLines = lines
    .map((raw, index) => ({ raw, line: index + 1 }))
    .filter(({ raw }) => raw.trim())

  const format = contentLines.some(({ raw }) => {
    const content = stripBullet(raw)
    return !/^标题\s*[:：]\s*/.test(content) && /^L[1-4]\s*[:：]\s*.+$/i.test(content)
  }) ? 'explicit-level' : 'indentation'

  const positiveIndents = contentLines
    .map(({ raw }) => leadingIndent(raw))
    .filter((indent) => indent > 0)
  const indentUnit = Math.max(1, Math.min(...positiveIndents, 2))

  for (const { raw, line } of contentLines) {
    const content = stripBullet(raw)
    if (!content) continue

    const titleMatch = content.match(/^标题\s*[:：]\s*(.+)$/)
    if (titleMatch) {
      title = titleMatch[1].trim() || title
      continue
    }

    let level: number
    if (format === 'explicit-level') {
      const explicitMatch = content.match(/^L([1-4])\s*[:：]\s*(.+)$/i)
      if (!explicitMatch) {
        errors.push({ line, message: '推荐使用 L1～L4 格式，例如：L2: 应用入口1。' })
        continue
      }
      level = Number(explicitMatch[1])
      while (explicitStack.length >= level) explicitStack.pop()
      if (level > 1 && !explicitStack[level - 2]) {
        errors.push({ line, message: `当前层级跳跃，请先补充 L${level - 1} 上级节点。` })
        continue
      }
      const node: ParsedNode = {
        id: `source-${line}-${nodeCount + 1}`,
        text: explicitMatch[2].trim(),
        level,
        line,
        children: [],
      }
      nodeCount += 1
      if (level > 1) explicitStack[level - 2].children.push(node)
      else roots.push(node)
      explicitStack[level - 1] = node
      explicitStack.length = level
      continue
    }

    const indent = leadingIndent(raw)
    if (indent > 0 && indent % indentUnit !== 0) {
      errors.push({ line, message: '缩进未按统一间距书写，已按最近层级处理。' })
    }

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop()
    level = stack.length + 1
    if (level > 4) {
      errors.push({ line, message: '当前内容超过 4 级，无法按 MVP 规则生成。' })
      continue
    }

    const node: ParsedNode = {
      id: `source-${line}-${nodeCount + 1}`,
      text: content,
      level,
      line,
      children: [],
    }
    nodeCount += 1

    if (stack.length) stack[stack.length - 1].node.children.push(node)
    else roots.push(node)
    stack.push({ indent, node })
  }

  if (!roots.length) errors.push({ line: 1, message: '没有可生成的架构内容，请先输入层级文字。' })
  if (!title.trim()) title = '未命名架构图'

  return { title, roots, errors, nodeCount, format }
}

export function countParsedNodes(nodes: ParsedNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countParsedNodes(node.children), 0)
}
