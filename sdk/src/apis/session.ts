/**
 * Session API — page session hierarchy management.
 *
 * Usage:
 *   const pages = await bridge.session.listPages()
 *   const page = await bridge.session.initPage(url, title, fields)
 *   await bridge.session.activateField({ label: 'Name', type: 'text', ... })
 */

import type { Transport, SessionAPI, PageSessionData, SimpleField, SessionFieldMeta, SubSession, PageContext, ChatMessageItem, SessionKey, SidebarView } from '../types'

export function createSessionAPI(transport: Transport): SessionAPI {
  return {
    async listPages(): Promise<PageSessionData[]> {
      return transport.invoke('session:listPages', []) as Promise<PageSessionData[]>
    },

    async initPage(url: string, title: string, fields: SimpleField[]): Promise<PageSessionData> {
      return transport.invoke('session:initPage', [url, title, fields]) as Promise<PageSessionData>
    },

    async activateField(fieldMeta: SessionFieldMeta): Promise<SubSession> {
      return transport.invoke('session:activateField', [fieldMeta]) as Promise<SubSession>
    },

    async updatePageContext(pageId: string, ctx: PageContext): Promise<void> {
      return transport.invoke('session:updatePageContext', [pageId, ctx]) as Promise<void>
    },

    async updatePageTitle(pageId: string, title: string): Promise<void> {
      return transport.invoke('session:updatePageTitle', [pageId, title]) as Promise<void>
    },

    async sendMessage(pageId: string, message: ChatMessageItem): Promise<ChatMessageItem> {
      return transport.invoke('session:sendMessage', [pageId, message]) as Promise<ChatMessageItem>
    },

    async getMessages(pageId: string, sessionKey: SessionKey): Promise<ChatMessageItem[]> {
      return transport.invoke('session:getMessages', [pageId, sessionKey]) as Promise<ChatMessageItem[]>
    },

    async archivePage(pageId: string): Promise<void> {
      return transport.invoke('session:archivePage', [pageId]) as Promise<void>
    },

    async setSidebarView(view: SidebarView): Promise<void> {
      return transport.invoke('session:setSidebarView', [view]) as Promise<void>
    },

    async getSidebarView(): Promise<SidebarView> {
      return transport.invoke('session:getSidebarView', []) as Promise<SidebarView>
    },
  }
}
