<script setup lang="ts">
import { computed, ref } from 'vue'
import log from 'electron-log/renderer'
import { useI18n } from '../../../composables/useI18n'
import { useTraceDetail } from '../../../composables/useTraceDetail'
import ContextChip from './ContextChip.vue'
import TraceDetailDialog from './TraceDetailDialog.vue'

const props = defineProps<{
  content: string
  isStreaming: boolean
  /** Label of the field being tipped (for Fill button text) */
  fillFieldLabel?: string
  /** Type of the field being tipped (textarea/richtext triggers draft fill button) */
  fillFieldType?: string
  /** Whether this message used page context (shows ContextChip) */
  usedPageContext?: boolean
  /** Page title for ContextChip source label */
  pageContextTitle?: string
  /** Trace span ID for this message (enables 🔍 icon) */
  traceSpanId?: string
  /** Trace error message (shows ⚠️ icon instead of 🔍) */
  traceError?: string
  /** Trace duration in ms (shown next to icon) */
  traceDurationMs?: number
}>()

const emit = defineEmits<{
  fill: [value: string]
}>()

const { t } = useI18n()

const fillState = ref<'idle' | 'filling' | 'done' | 'error'>('idle')
/** Track which OPTIONS chip was selected — only that one highlights green */
const selectedOptionIndex = ref<number | null>(null)

// ── Markdown rendering ──
function renderMarkdown(text: string): string {
  let html = text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    // Fix nested uls
    .replace(/<\/ul>\s*<ul>/g, '')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  // Wrap in paragraph if not already
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>'
  }

  // Sanitize: remove script tags
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  html = html.replace(/ on\w+="[^"]*"/gi, '')

  return html
}

const renderedHtml = computed(() => renderMarkdown(displayContent.value))

// ── Stateful marker-based fill detection (tool-call-like) ──
// AI can respond with two markers:
//   1. [[OPTIONS:FieldName]]Val1||Val2||Val3[[/OPTIONS]] — multi-option selectable chips
//   2. [[FILL:FieldName]]Value[[/FILL]]                 — single fill button (fallback)
const OPTIONS_RE = /\[\[OPTIONS:([^\]]+)\]\]\s*([\s\S]*?)\s*\[\[\/OPTIONS\]\]/
const FILL_RE = /\[\[FILL:([^\]]+)\]\]\s*([\s\S]*?)\s*\[\[\/FILL\]\]/

// ── OPTIONS: multiple selectable fill chips ──
interface OptionItem {
  label: string
  value: string
}

const optionsMatch = computed<{ label: string; options: OptionItem[] } | null>(() => {
  if (props.isStreaming) return null
  if (!props.content) return null
  const m = props.content.match(OPTIONS_RE)
  if (!m) return null
  const fieldLabel = m[1].trim()
  const raw = m[2].trim()
  if (!raw) return null
  const options = raw.split('||').map(s => s.trim()).filter(s => s.length > 0)
  if (options.length === 0) return null
  log.info('[BotMessage] optionsMatch:', fieldLabel, '| options:', options)
  return { label: fieldLabel, options: options.map(v => ({ label: fieldLabel, value: v })) }
})

// ── FILL: single fill button (fallback) ──
const fillMatch = computed<{ label: string; value: string } | null>(() => {
  if (props.isStreaming) return null
  if (!props.content) return null
  const m = props.content.match(FILL_RE)
  if (!m) return null
  const value = m[2].trim()
  if (!value) return null
  log.info('[BotMessage] fillMatch:', m[1].trim(), '| value:', value)
  return { label: m[1].trim(), value }
})

/** Content with ALL markers stripped for display */
const displayContent = computed(() => {
  return props.content.replace(OPTIONS_RE, '').replace(FILL_RE, '').trim()
})

// ── Textarea / richtext draft fill ──
const showDraftFill = computed(() => {
  if (props.isStreaming) return false
  if (!props.content) return false
  if (!props.fillFieldType) return false
  return props.fillFieldType === 'textarea' || props.fillFieldType === 'richtext'
})

/** Strip basic markdown to get plain text for filling */
function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,4}\s+/gm, '')           // headers
    .replace(/\*\*(.+?)\*\*/g, '$1')        // bold
    .replace(/\*(.+?)\*/g, '$1')             // italic
    .replace(/`([^`]+)`/g, '$1')             // inline code
    .replace(/^- (.+)$/gm, '$1')             // unordered list items
    .replace(/^\d+\. (.+)$/gm, '$1')         // ordered list items
    .replace(/<br>/g, '\n')                  // line breaks
    .replace(/<\/?[^>]+(>|$)/g, '')          // HTML tags
    .replace(/\n{3,}/g, '\n\n')              // collapse excessive newlines
    .trim()
}

const draftFillValue = computed(() => stripMarkdown(displayContent.value))

const suggestedValue = computed<string | null>(() => fillMatch.value?.value ?? null)

async function handleFill(val?: string): Promise<void> {
  const value = val ?? suggestedValue.value
  if (!value) return
  fillState.value = 'filling'
  emit('fill', value)
  // Revert to idle after brief animation — don't claim success
  // (actual fill result is visible in the form field itself)
  setTimeout(() => {
    if (fillState.value === 'filling') fillState.value = 'idle'
  }, 1200)
}

/** Option chip click — highlights only the selected one, emits fill */
function handleOptionClick(index: number, value: string): void {
  if (selectedOptionIndex.value !== null) return
  selectedOptionIndex.value = index
  emit('fill', value)
}

// Expose for parent to reset
function setFillDone(): void { fillState.value = 'done' }
function setFillError(): void { fillState.value = 'error' }
defineExpose({ setFillDone, setFillError })

// ── Trace detail ──
const { span: traceSpan, fetchDetail: fetchTraceDetail, reset: resetTrace } = useTraceDetail()
const showTraceDialog = ref(false)

const traceDurationLabel = computed(() => {
  if (!props.traceDurationMs) return ''
  const s = props.traceDurationMs / 1000
  return s >= 1 ? `${s.toFixed(1)}s` : `${props.traceDurationMs}ms`
})

async function handleOpenTrace(): Promise<void> {
  if (!props.traceSpanId) return
  showTraceDialog.value = true
  await fetchTraceDetail(props.traceSpanId)
}

function handleCloseTrace(): void {
  showTraceDialog.value = false
  resetTrace()
}
</script>

<template>
  <div class="bot-msg">
    <div class="bubble">
      <!-- Loading dots: waiting for first token -->
      <div v-if="isStreaming && !content" class="loading-typing">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <!-- Rendered content -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="content" class="md-content" v-html="renderedHtml" />

      <!-- Streaming cursor: blink while receiving tokens -->
      <span v-if="isStreaming && content" class="cursor">▊</span>

      <!-- Option chips: [[OPTIONS:label]]val1||val2[[/OPTIONS]] — direct fill -->
      <div v-if="optionsMatch && !isStreaming" class="options-row">
        <button
          v-for="(opt, i) in optionsMatch.options"
          :key="i"
          class="option-chip"
          :class="{ filled: selectedOptionIndex === i }"
          :disabled="selectedOptionIndex !== null"
          @click="() => handleOptionClick(i, opt.value)"
        >
          <span class="opt-icon">✍️</span>
          <span class="opt-value">{{ opt.value }}</span>
        </button>
      </div>

      <!-- Fill button: [[FILL:label]]value[[/FILL]] — single fill (fallback) -->
      <div v-if="suggestedValue && !isStreaming" class="fill-row">
        <button
          class="fill-btn"
          :class="{ filling: fillState === 'filling', done: fillState === 'done', error: fillState === 'error' }"
          :disabled="fillState !== 'idle'"
          @click="() => handleFill()"
        >
          <template v-if="fillState === 'idle'">
            <span class="fill-icon">✍️</span>
            <span class="fill-label">{{ t('bot.fill', { '{}': suggestedValue }) }}</span>
            <span v-if="fillMatch" class="fill-target">→ {{ fillMatch.label }}</span>
          </template>
          <template v-else-if="fillState === 'filling'">
            <span class="fill-spinner"></span>
            Filling...
          </template>
          <template v-else-if="fillState === 'done'">
            <span>✓</span> {{ t('bot.filled') }}
          </template>
          <template v-else>
            <span>⚠</span> {{ t('bot.notFound') }}
          </template>
        </button>
      </div>

      <!-- Draft fill button: for textarea / richtext responses -->
      <div v-if="showDraftFill && !optionsMatch && !suggestedValue" class="fill-row">
        <button
          class="fill-btn draft-fill"
          :class="{ filling: fillState === 'filling' }"
          :disabled="fillState !== 'idle'"
          @click="() => handleFill(draftFillValue)"
        >
          <template v-if="fillState === 'idle'">
            <span class="fill-icon">✍️</span>
            <span class="fill-label">{{ t('bot.fillDraft') }}</span>
            <span v-if="fillFieldLabel" class="fill-target">→ {{ fillFieldLabel }}</span>
          </template>
          <template v-else>
            <span class="fill-spinner"></span>
            {{ t('bot.filling') }}
          </template>
        </button>
      </div>

      <!-- Context chip: shown when message used page context (field mode) -->
      <ContextChip
        v-if="usedPageContext && pageContextTitle && !isStreaming"
        :source-title="pageContextTitle"
      />

      <!-- Trace icon: shown on completed/failed messages that have trace data -->
      <div
        v-if="!isStreaming && traceSpanId"
        class="trace-entry"
        :class="{ error: !!traceError }"
        @click="handleOpenTrace"
        :title="traceError ? `Error: ${traceError}` : 'View trace details'"
      >
        <span v-if="traceError" class="trace-icon">⚠️</span>
        <span v-else class="trace-icon">🔍</span>
        <span v-if="traceDurationLabel" class="trace-dur">{{ traceDurationLabel }}</span>
        <span v-if="traceError" class="trace-label">{{ traceError.slice(0, 30) }}</span>
      </div>
    </div>
  </div>

  <!-- Trace Detail Dialog -->
  <TraceDetailDialog
    v-if="showTraceDialog"
    :span="traceSpan"
    @close="handleCloseTrace"
  />
</template>

<style scoped>
.bot-msg {
  display: flex;
  justify-content: flex-start;
  padding: 8px 12px;
}
.bubble {
  max-width: 95%;
  padding: 8px 12px;
  background: var(--app-gray-50, #f8fafc);
  border: 1px solid var(--border-light);
  border-radius: 12px 12px 12px 4px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  word-break: break-word;
}

/* Markdown content */
.md-content :deep(p) {
  margin: 0 0 6px;
}
.md-content :deep(p:last-child) {
  margin-bottom: 0;
}
.md-content :deep(h2),
.md-content :deep(h3),
.md-content :deep(h4) {
  margin: 8px 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.md-content :deep(strong) {
  font-weight: 600;
}
.md-content :deep(em) {
  font-style: italic;
}
.md-content :deep(code) {
  padding: 1px 4px;
  background: #e2e8f0;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'SF Mono', 'Cascadia Code', monospace;
}
.md-content :deep(ul),
.md-content :deep(ol) {
  margin: 4px 0;
  padding-left: 16px;
}
.md-content :deep(li) {
  margin: 2px 0;
}

/* Streaming cursor */
.cursor {
  display: inline-block;
  animation: blink 0.7s steps(1) infinite;
  color: var(--accent-color);
  font-weight: 600;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* Loading typing dots — mimics WeKnora UX */
.loading-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 20px;
}
.loading-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-color, #3b82f6);
  animation: typingBounce 1.4s ease-in-out infinite;
}
.loading-typing span:nth-child(1) { animation-delay: 0s; }
.loading-typing span:nth-child(2) { animation-delay: 0.2s; }
.loading-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}

/* Option chips — [[OPTIONS:label]]val1||val2[[/OPTIONS]] */
.options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light, #e2e8f0);
}

.option-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.12s ease;
  box-shadow: 0 2px 4px rgba(102, 126, 234, 0.25);
}
.option-chip:hover:not(:disabled) {
  opacity: 0.92;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}
.option-chip:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(102, 126, 234, 0.2);
}
.option-chip:disabled {
  opacity: 0.5;
  cursor: default;
  transform: none;
  box-shadow: none;
}
.option-chip.filled {
  background: linear-gradient(135deg, #34d399 0%, #059669 100%);
  box-shadow: 0 2px 4px rgba(52, 211, 153, 0.25);
}

.opt-icon {
  font-size: 12px;
  flex-shrink: 0;
}
.opt-value {
  font-weight: 500;
}

/* Fill button */
.fill-row {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light, #e2e8f0);
}
.fill-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px;
  font-size: 11px; font-family: inherit;
  color: #667eea;
  background: rgba(102, 126, 234, 0.08);
  border: 1px solid rgba(102, 126, 234, 0.25);
  border-radius: 6px; cursor: pointer;
  transition: all 150ms ease;
  max-width: 100%; overflow: hidden;
}
.fill-btn:hover:not(:disabled) {
  background: rgba(102, 126, 234, 0.15);
  border-color: #667eea;
}
.fill-btn:disabled { cursor: default; }
.fill-btn.done {
  color: #4caf50; background: rgba(76, 175, 80, 0.08);
  border-color: rgba(76, 175, 80, 0.25);
}
.fill-btn.error {
  color: #f44336; background: rgba(244, 67, 54, 0.06);
  border-color: rgba(244, 67, 54, 0.2);
}
.fill-icon { font-size: 12px; flex-shrink: 0; }
.fill-label { opacity: 0.7; flex-shrink: 0; }
.fill-value {
  font-weight: 600; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; max-width: 160px;
}
.fill-spinner {
  width: 10px; height: 10px; border: 2px solid rgba(102,126,234,0.2);
  border-top-color: #667eea; border-radius: 50%;
  animation: fill-spin 0.6s linear infinite; flex-shrink: 0;
}
@keyframes fill-spin { to { transform: rotate(360deg); } }

/* Trace entry */
.trace-entry {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 6px;
  font-size: 10px;
  color: #94a3b8;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: all 0.12s;
  user-select: none;
}
.trace-entry:hover {
  background: #f1f5f9;
  color: #64748b;
}
.trace-entry.error {
  color: #ef4444;
}
.trace-entry.error:hover {
  background: #fef2f2;
}
.trace-icon {
  font-size: 11px;
}
.trace-dur {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 10px;
  color: inherit;
}
.trace-label {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
