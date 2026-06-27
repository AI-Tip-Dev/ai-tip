<script setup lang="ts">
/**
 * HomeView — Home page showing current Page card + recent page history.
 *
 * Layout:
 *   Brand header → Current Page Card (Overview + Session Fields + Show all)
 *   → Recent Pages list
 */
import { computed } from 'vue'
import type {
  PageSessionData,
  SubSession,
  SessionKey,
} from '@ai-tip/sdk'
import { useI18n } from '../../composables/useI18n'

const props = defineProps<{
  currentPage: PageSessionData | null
  pageSessions: PageSessionData[]
  recentUrls: string[]
}>()

const emit = defineEmits<{
  selectOverview: []
  selectField: [key: SessionKey]
  selectPage: [pageId: string]
  selectRecentUrl: [url: string]
  openFile: []
  openSettings: []
}>()

const { t } = useI18n()

// ── Current page data ──
const overviewSession = computed<SubSession | null>(() => {
  return props.currentPage?.children.find(c => c.key.type === 'page-chat') ?? null
})

const sessionFields = computed<SubSession[]>(() => {
  if (!props.currentPage) return []
  return props.currentPage.children.filter(
    c => c.key.type === 'field' && c.messages.length > 0
  )
})

/** Archived (recent) pages from current session (in-memory) */
const archivedPages = computed<PageSessionData[]>(() => {
  return props.pageSessions.filter(p => p.isArchived)
})

/** Recent URLs from localStorage (persisted across app restarts).
 *  Excludes: current page URL, and any URL already shown in archivedPages. */
const recentUrlEntries = computed<Array<{ url: string; host: string; isCurrent: boolean }>>(() => {
  const currentUrl = props.currentPage?.pageUrl
  const archivedUrls = new Set(archivedPages.value.map(p => p.pageUrl))
  return props.recentUrls
    .filter(url => url !== currentUrl && !archivedUrls.has(url))
    .slice(0, 10)
    .map(url => ({ url, host: hostFromUrl(url), isCurrent: url === currentUrl }))
})

// ── Helpers ──
function fieldLabel(sub: SubSession): string {
  const fm = sub.fieldMeta as any
  return fm?.label || fm?.placeholder || fm?.name || sub.key.fieldName || ''
}

function fieldType(sub: SubSession): string {
  const fm = sub.fieldMeta as any
  return fm?.type || 'text'
}

function msgCount(sub: SubSession): number {
  return sub.messages.length
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return 'yesterday'
}

function hostFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname
    return host.replace('www.', '')
  } catch {
    return url
  }
}
</script>

<template>
  <div class="home-view">
    <!-- Brand header -->
    <div class="home-brand">
      <span class="brand-icon">🤖</span>
      <span class="brand-title">{{ t('app.title') }}</span>
      <div class="brand-actions">
        <button
          class="brand-btn"
          title="Open local file (Ctrl+O)"
          @click="emit('openFile')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
            <polyline points="13 2 13 9 20 9"/>
          </svg>
        </button>
        <button
          class="brand-btn"
          title="Settings (Ctrl+,)"
          @click="emit('openSettings')"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- Current Page -->
    <div class="home-section">
      <div class="section-header">📍 Current Page</div>

      <div v-if="currentPage" class="page-card">
        <!-- Card header -->
        <div class="card-header">
          <span class="card-icon">🌐</span>
          <div class="card-title-wrap">
            <span class="card-title">{{ currentPage.pageTitle }}</span>
            <span class="card-url">{{ hostFromUrl(currentPage.pageUrl) }}</span>
          </div>
          <span class="card-dot" />
        </div>

        <!-- Overview (always first) -->
        <button
          class="card-row card-overview"
          @click="emit('selectOverview')"
        >
          <span class="row-icon">💬</span>
          <span class="row-label">Overview</span>
          <span v-if="overviewSession && msgCount(overviewSession) > 0" class="row-badge">
            {{ msgCount(overviewSession) }}
          </span>
        </button>

        <!-- Session Fields -->
        <button
          v-for="sub in sessionFields"
          :key="sub.key.fieldName"
          class="card-row card-field"
          @click="emit('selectField', sub.key)"
        >
          <span class="row-icon">✨</span>
          <span class="row-label">{{ fieldLabel(sub) }}</span>
          <span class="row-type">{{ fieldType(sub) }}</span>
          <span v-if="msgCount(sub) > 0" class="row-badge">{{ msgCount(sub) }}</span>
        </button>

        <!-- No session fields hint -->
        <div v-if="sessionFields.length === 0" class="card-empty">
          No field sessions yet — click ✨ on any input
        </div>
      </div>

      <!-- No current page -->
      <div v-else class="page-card page-card-empty">
        <div class="card-empty-state">
          <span class="empty-icon">🔍</span>
          <p class="empty-text">Open a page to start</p>
        </div>
      </div>
    </div>

    <!-- Recent Pages (from current session) -->
    <div v-if="archivedPages.length > 0" class="home-section">
      <div class="section-header">🕐 Recent Pages</div>

      <button
        v-for="ps in archivedPages"
        :key="ps.pageId"
        class="recent-row"
        @click="emit('selectPage', ps.pageId)"
      >
        <span class="recent-icon">🌐</span>
        <div class="recent-info">
          <span class="recent-title">{{ ps.pageTitle || hostFromUrl(ps.pageUrl) }}</span>
          <span class="recent-url">{{ hostFromUrl(ps.pageUrl) }}</span>
        </div>
        <span class="recent-time">{{ formatTime(ps.lastActiveAt) }}</span>
      </button>
    </div>

    <!-- Recent URLs (from history, persists across restarts) -->
    <div v-if="recentUrlEntries.length > 0" class="home-section">
      <div class="section-header">
        {{ archivedPages.length > 0 ? '📋 More History' : '🕐 Recent Pages' }}
      </div>

      <button
        v-for="entry in recentUrlEntries"
        :key="entry.url"
        class="recent-row"
        @click="emit('selectRecentUrl', entry.url)"
      >
        <span class="recent-icon">
          <span v-if="entry.url.startsWith('file:///')">📄</span>
          <span v-else>🌐</span>
        </span>
        <div class="recent-info">
          <span class="recent-title">{{ entry.host }}</span>
          <span class="recent-url">{{ entry.url }}</span>
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.home-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

/* ── Brand ── */
.home-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.brand-icon {
  font-size: 20px;
}

.brand-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  flex: 1;
}

/* ── Brand actions ── */
.brand-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.brand-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.brand-btn:hover {
  background: var(--btn-hover-bg);
  color: var(--color-text);
}
.brand-btn:active {
  background: var(--btn-active-bg);
}

/* ── Sections ── */
.home-section {
  padding: 14px 16px 8px;
}

.section-header {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-left: 2px;
}

/* ── Page Card (current session — prominent) ── */
.page-card {
  border: 1px solid var(--accent-color, var(--border-light));
  border-radius: 10px;
  background: var(--app-white);
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.page-card-empty {
  padding: 28px 24px;
  text-align: center;
  border-color: var(--border-light);
  box-shadow: none;
}

.card-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-text-muted);
}

.empty-icon {
  font-size: 32px;
}

.empty-text {
  font-size: 13px;
  font-weight: 500;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-light);
  background: var(--app-gray-50);
}

.card-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.card-title-wrap {
  flex: 1;
  min-width: 0;
}

.card-title {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

.card-url {
  display: block;
  font-size: 11px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.card-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--app-green);
  flex-shrink: 0;
}

/* ── Card Rows ── */
.card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 14px;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.card-row:last-child {
  border-bottom: none;
}
.card-row:hover {
  background: var(--app-gray-50);
}

.card-overview {
  font-weight: 600;
}

.card-field {
  font-weight: 400;
}

.row-icon {
  flex-shrink: 0;
  font-size: 13px;
}

.row-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-type {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--app-gray-100);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.row-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--accent-bg);
  color: var(--accent-color);
  flex-shrink: 0;
  min-width: 18px;
  text-align: center;
  line-height: 16px;
}

.card-empty {
  padding: 12px 14px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-style: italic;
  border-bottom: 1px solid var(--border-light);
}

/* ── Recent Pages (two-line layout) ── */
.recent-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}
.recent-row:hover {
  background: var(--app-gray-50);
}

.recent-icon {
  font-size: 13px;
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.7;
}

.recent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.recent-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

.recent-url {
  font-size: 10px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.55;
}

.recent-time {
  font-size: 10px;
  color: var(--color-text-muted);
  flex-shrink: 0;
  margin-top: 2px;
  opacity: 0.5;
}
</style>
