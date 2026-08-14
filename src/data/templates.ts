import { TemplateDefinition, TemplateId, ThemeDefinition, ThemeId } from '../types'

const productSource = `标题：XXX平台产品架构

L1: 应用层
L2: 应用入口1
L3: 应用说明
L2: 应用入口2
L3: 应用说明

L1: 业务域
L2: 业务域1
L3: 功能模块1
L4: 功能点1
L4: 功能点2
L3: 功能模块2
L4: 功能点1
L4: 功能点2
L2: 业务域2
L3: 功能模块1
L4: 功能点1
L4: 功能点2

L1: 外部平台协同
L2: 外部平台1
L3: 协同能力1
L3: 协同能力2

L1: 平台能力
L2: 公共能力1
L2: 公共能力2
L2: 公共能力3`

const layeredSource = `标题：XXX系统总体架构

L1: 用户层
L2: 用户类型1
L2: 用户类型2
L2: 用户类型3

L1: 应用层
L2: 应用1
L2: 应用2
L2: 应用3

L1: 业务能力层
L2: 能力组1
L3: 能力1
L3: 能力2
L3: 能力3
L2: 能力组2
L3: 能力1
L3: 能力2

L1: 数据层
L2: 数据类型1
L2: 数据类型2

L1: 基础支撑层
L2: 权限管理
L2: 消息中心
L2: 接口中心
L2: 日志审计`

const matrixSource = `标题：XXX平台业务架构

L1: 业务域
L2: 业务域1
L3: 模块1
L4: 功能1
L4: 功能2
L3: 模块2
L4: 功能1
L4: 功能2
L2: 业务域2
L3: 模块1
L4: 功能1
L4: 功能2
L3: 模块2
L4: 功能1
L2: 业务域3
L3: 模块1
L4: 功能1
L4: 功能2

L1: 公共支撑
L2: 权限管理
L2: 消息中心
L2: 接口中心
L2: 数据服务`

const createAiPrompt = (templateName: string) => `请将下面的架构内容整理为“${templateName}”可直接生成的结构化文本。

要求：
1. 第一行使用“标题：...”表示架构图标题。
2. 后续每个节点单独一行，必须使用 L1:、L2:、L3: 或 L4: 表示层级。
3. L1 是左侧层级标签，L2～L4 是层级内的独立小卡片；不要使用项目符号或缩进代替层级。
4. 只输出整理后的文本，不要输出解释、Markdown 代码块或额外标题。

待整理内容：`

export const templates: Record<TemplateId, TemplateDefinition> = {
  product: {
    id: 'product',
    name: '多层产品架构图',
    description: '适用于产品功能架构、平台总体架构和项目系统架构。',
    maxLevel: 4,
    sourceTemplate: productSource,
    exampleSource: productSource.replace(/XXX平台/g, '建筑产业工人平台').replace(/应用入口/g, '应用端'),
    layoutHint: '左侧层级标签 + 全量小卡片',
    aiPrompt: createAiPrompt('多层产品架构图'),
  },
  layered: {
    id: 'layered',
    name: '标准分层架构图',
    description: '强调用户、应用、业务、数据和基础支撑等纵向分层。',
    maxLevel: 3,
    sourceTemplate: layeredSource,
    exampleSource: layeredSource.replace(/XXX系统/g, '企业数字化系统'),
    layoutHint: '左侧层级标签 + 层内独立卡片',
    aiPrompt: createAiPrompt('标准分层架构图'),
  },
  matrix: {
    id: 'matrix',
    name: '业务域能力矩阵',
    description: '适用于大型管理平台、多业务板块和企业业务能力架构。',
    maxLevel: 4,
    sourceTemplate: matrixSource,
    exampleSource: matrixSource.replace(/XXX平台/g, '智慧社区平台'),
    layoutHint: '左侧层级标签 + 业务域独立卡片',
    aiPrompt: createAiPrompt('业务域能力矩阵'),
  },
}

export const themes: Record<ThemeId, ThemeDefinition> = {
  colorful: {
    id: 'colorful',
    name: '多彩架构',
    editorAccent: '#2563eb',
    canvas: '#f8fafc',
    ink: '#17324d',
    mutedInk: '#66809b',
    layerBackground: '#eef6ff',
    layerBorder: '#80b9e8',
    layerLabelPalette: ['#2867da', '#2867da', '#f39a2d', '#7b7f86'],
    levelCardStyles: {
      2: { background: '#dcecff', border: '#77a7df', text: '#1858b7' },
      3: { background: '#eff7ff', border: '#b7d3ee', text: '#24618b' },
      4: { background: '#ffffff', border: '#d8e5ef', text: '#4e6a7f' },
    },
    groupPalette: ['#dff5e9', '#fff0cc', '#e5efff', '#e8e2ff', '#ffe1e1', '#dff6f3'],
    cardBackground: '#ffffff',
    cardBorder: '#bed2e5',
    divider: '#d8e5f0',
  },
  business: {
    id: 'business',
    name: '商务蓝',
    editorAccent: '#1d4ed8',
    canvas: '#f6f8fc',
    ink: '#172554',
    mutedInk: '#64748b',
    layerBackground: '#edf4ff',
    layerBorder: '#8bb5ee',
    layerLabelPalette: ['#1f5fc9', '#275fac', '#3374bd', '#6b7280'],
    levelCardStyles: {
      2: { background: '#dce9ff', border: '#7ea8e6', text: '#1d4eaa' },
      3: { background: '#eef5ff', border: '#bdd1ec', text: '#315d87' },
      4: { background: '#ffffff', border: '#d8e2ef', text: '#536b80' },
    },
    groupPalette: ['#e4edff', '#e8f1ff', '#eef5ff', '#e2f0f4', '#f1edff', '#e8eef7'],
    cardBackground: '#ffffff',
    cardBorder: '#b9c9df',
    divider: '#d2dceb',
  },
  minimal: {
    id: 'minimal',
    name: '极简灰蓝',
    editorAccent: '#475569',
    canvas: '#f8fafc',
    ink: '#1e293b',
    mutedInk: '#64748b',
    layerBackground: '#f1f5f9',
    layerBorder: '#94a3b8',
    layerLabelPalette: ['#526d86', '#5c7187', '#687786', '#76808b'],
    levelCardStyles: {
      2: { background: '#e4ebf2', border: '#9eafbe', text: '#3e586e' },
      3: { background: '#f0f4f7', border: '#c4d0da', text: '#536a7d' },
      4: { background: '#ffffff', border: '#d9e1e8', text: '#647789' },
    },
    groupPalette: ['#e9eef5', '#eef2f7', '#e4ebf2', '#f0f2f4', '#e7edf2', '#f2f4f6'],
    cardBackground: '#ffffff',
    cardBorder: '#cbd5e1',
    divider: '#d8e0e8',
  },
}
