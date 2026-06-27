<script setup lang="ts">
/**
 * ChatHeader — Home button + breadcrumb navigation.
 *
 * Page Chat mode:  "🏠 Page Name"
 * Field mode:      "🏠 Page › ✨ Field Name"
 *
 * 🏠 → goes to Home view.  Page name is clickable → goes to Overview.
 */
import type { SubSession, PageSessionData } from '@ai-tip/sdk'

const props = defineProps<{
  pageSession: PageSessionData | null
  activeSub: SubSession | null
}>()

const emit = defineEmits<{
  back: []
  navigateToPage: []
}>()

function isFieldMode(): boolean {
  return props.activeSub?.key?.type === 'field'
}

function fieldLabel(): string {
  if (!props.activeSub?.fieldMeta) return ''
  const fm = props.activeSub.fieldMeta as any
  return fm.label || fm.placeholder || fm.name || 'this field'
}

function pageTitle(): string {
  return props.pageSession?.pageTitle || ''
}
</script>

<template>
  <div class="chat-header">
    <!-- Home button -->
    <button class="home-btn" title="Home" @click="emit('back')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    </button>

    <span class="nav-sep">/</span>

    <!-- Page Chat breadcrumb -->
    <template v-if="!isFieldMode()">
      <span class="breadcrumb-current">{{ pageTitle() }}</span>
    </template>

    <!-- Field breadcrumb -->
    <template v-else>
      <button class="breadcrumb-link" @click="emit('navigateToPage')">
        {{ pageTitle() }}
      </button>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">✨ {{ fieldLabel() }}</span>
    </template>
  </div>
</template>

<style scoped>
.chat-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light);
  background: var(--app-white, #fff);
  flex-shrink: 0;
  min-height: 38px;
}

.home-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.home-btn:hover {
  background: var(--accent-bg);
  color: var(--accent-color);
}

.nav-sep {
  color: var(--color-text-muted);
  font-size: 12px;
  opacity: 0.35;
  flex-shrink: 0;
  user-select: none;
}

.breadcrumb-current {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumb-link {
  font-size: 13px;
  font-weight: 500;
  color: var(--accent-color);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 140px;
}
.breadcrumb-link:hover {
  text-decoration: underline;
}

.breadcrumb-sep {
  color: var(--color-text-muted);
  font-size: 14px;
  font-weight: 300;
  flex-shrink: 0;
  user-select: none;
}
</style>
