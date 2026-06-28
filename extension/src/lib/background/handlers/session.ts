/**
 * Session Handlers — page session hierarchy in chrome.storage.local.
 */

import { storageGet, storageSet, STORAGE_KEYS } from '../storage'

interface ChatMessageItem {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: string
  timestamp?: number
}

interface PageSessionData {
  pageId: string
  pageUrl: string
  pageTitle: string
  createdAt: number
  archived: boolean
  pageContext?: any
  children: SubSession[]
  activeChildIndex: number
}

interface SubSession {
  key: SessionKey
  messages: ChatMessageItem[]
}

interface SessionKey {
  type: 'page-chat' | 'field'
  fieldName?: string
}

const MAX_PAGES = 20

export async function handleListPages(): Promise<PageSessionData[]> {
  return (await storageGet<PageSessionData[]>(STORAGE_KEYS.SESSIONS)) ?? []
}

export async function handleInitPage(args: { pageUrl: string; pageTitle: string; fields: any[] }): Promise<PageSessionData> {
  const sessions = (await storageGet<PageSessionData[]>(STORAGE_KEYS.SESSIONS)) ?? []
  let page = sessions.find(s => s.pageUrl === args.pageUrl && !s.archived)
  if (!page) {
    page = {
      pageId: 'page-' + Date.now(),
      pageUrl: args.pageUrl,
      pageTitle: args.pageTitle,
      createdAt: Date.now(),
      archived: false,
      children: [{ key: { type: 'page-chat' }, messages: [] }],
      activeChildIndex: 0,
    }
    for (const field of args.fields || []) {
      const fieldName = field.label || field.name || field.id || ''
      if (fieldName && !page.children.find(c => c.key.type === 'field' && c.key.fieldName === fieldName)) {
        page.children.push({ key: { type: 'field', fieldName }, messages: [] })
      }
    }
    sessions.unshift(page)
    if (sessions.length > MAX_PAGES) sessions.splice(MAX_PAGES)
    await storageSet(STORAGE_KEYS.SESSIONS, sessions)
  }
  return page
}

export async function handleActivateField(args: { pageUrl: string; fieldName: string }): Promise<void> {
  const sessions = (await storageGet<PageSessionData[]>(STORAGE_KEYS.SESSIONS)) ?? []
  const page = sessions.find(s => s.pageUrl === args.pageUrl && !s.archived)
  if (!page) return
  const childIdx = page.children.findIndex(c => c.key.type === 'field' && c.key.fieldName === args.fieldName)
  if (childIdx >= 0) {
    page.activeChildIndex = childIdx
  } else {
    page.children.push({ key: { type: 'field', fieldName: args.fieldName }, messages: [] })
    page.activeChildIndex = page.children.length - 1
  }
  await storageSet(STORAGE_KEYS.SESSIONS, sessions)
}

export async function handleSendMessage(args: { pageUrl: string; message: ChatMessageItem }): Promise<void> {
  const sessions = (await storageGet<PageSessionData[]>(STORAGE_KEYS.SESSIONS)) ?? []
  const page = sessions.find(s => s.pageUrl === args.pageUrl && !s.archived)
  if (!page) return
  page.children[page.activeChildIndex]?.messages.push(args.message)
  await storageSet(STORAGE_KEYS.SESSIONS, sessions)
}

export async function handleGetMessages(args: { pageUrl: string }): Promise<ChatMessageItem[]> {
  const sessions = (await storageGet<PageSessionData[]>(STORAGE_KEYS.SESSIONS)) ?? []
  const page = sessions.find(s => s.pageUrl === args.pageUrl && !s.archived)
  if (!page) return []
  return page.children[page.activeChildIndex]?.messages ?? []
}

export async function handleArchivePage(args: { pageUrl: string }): Promise<void> {
  const sessions = (await storageGet<PageSessionData[]>(STORAGE_KEYS.SESSIONS)) ?? []
  const page = sessions.find(s => s.pageUrl === args.pageUrl && !s.archived)
  if (page) { page.archived = true; await storageSet(STORAGE_KEYS.SESSIONS, sessions) }
}

export async function handleSetSidebarView(_args: { pageUrl: string; view: string }): Promise<void> {
  // View is managed in Vue component state
}
