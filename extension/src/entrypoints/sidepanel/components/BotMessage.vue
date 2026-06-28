<script setup lang="ts">
/**
 * BotMessage — AI assistant message bubble.
 *
 * Renders markdown, shows loading dots while streaming, and
 * supports [[OPTIONS:...]] marker for selectable fill chips.
 */
import { computed, ref } from 'vue'

const props = defineProps<{
  content: string
  isStreaming: boolean
  /** Label of the active field (for Fill button) */
  fillFieldLabel?: string
}>()

const emit = defineEmits<{
  fill: [value: string]
}>()

const fillState = ref<'idle' | 'filling' | 'done'>('idle')
const selectedOptionIndex = ref<number | null>(null)

// ── Markdown rendering ──
function renderMarkdown(text: string): string {
  let html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^# (.+)$/gm, '<h2>$1</h2>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  if (!html.startsWith('<')) html = '<p>' + html + '</p>'
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
  html = html.replace(/ on\w+="[^"]*"/gi, '')
  return html
}

// ── Marker parsing: [[OPTIONS:FieldName]]Val1||Val2||Val3[[/OPTIONS]] ──
const OPTIONS_RE = /\[\[OPTIONS:([^\]]+)\]\]\s*([\s\S]*?)\s*\[\[\/OPTIONS\]\]/

interface OptionItem {
  label: string
  value: string
}

const optionsMatch = computed<{ fieldLabel: string; options: OptionItem[] } | null>(() => {
  if (props.isStreaming || !props.content) return null
  const m = props.content.match(OPTIONS_RE)
  if (!m) return null
  const raw = m[2].trim()
  if (!raw) return null
  const options = raw.split('||').map(s => s.trim()).filter(s => s.length > 0)
  if (options.length === 0) return null
  return { fieldLabel: m[1].trim(), options: options.map(v => ({ label: m[1].trim(), value: v })) }
})

/** Content with markers stripped for display */
const displayContent = computed(() => {
  return props.content.replace(OPTIONS_RE, '').trim()
})

const renderedHtml = computed(() => renderMarkdown(displayContent.value))

// ── Fill ──
function handleFill(value: string): void {
  fillState.value = 'filling'
  emit('fill', value)
  setTimeout(() => { if (fillState.value === 'filling') fillState.value = 'idle' }, 1200)
}

function handleOptionClick(index: number, value: string): void {
  if (selectedOptionIndex.value !== null) return
  selectedOptionIndex.value = index
  emit('fill', value)
}
</script>

<template>
  <div class="bot-msg">
    <div class="bubble">
      <!-- Loading dots -->
      <div v-if="isStreaming && !content" class="loading-typing">
        <span /><span /><span />
      </div>

      <!-- Rendered markdown -->
      <div v-else class="content" v-html="renderedHtml" />

      <!-- [[OPTIONS:...]] selectable chips -->
      <div v-if="optionsMatch" class="options-row">
        <button
          v-for="(opt, i) in optionsMatch.options"
          :key="i"
          class="option-chip"
          :class="{ selected: selectedOptionIndex === i }"
          :disabled="selectedOptionIndex !== null"
          @click="handleOptionClick(i, opt.value)"
        >
          {{ opt.value }}
        </button>
      </div>

      <!-- Fill button (when no options match, but field is active) -->
      <button
        v-if="!optionsMatch && fillFieldLabel && displayContent && !isStreaming && fillState !== 'done'"
        class="fill-btn"
        :class="{ filling: fillState === 'filling' }"
        @click="handleFill(displayContent)"
      >
        {{ fillState === 'filling' ? '⏳ Filling...' : `📝 Fill "${fillFieldLabel}"` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bot-msg {
  margin-bottom: 10px;
}

.bubble {
  display: inline-block;
  max-width: 92%;
  padding: 8px 12px;
  border-radius: 12px 12px 12px 4px;
  background: #f5f5f5;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

/* Loading dots */
.loading-typing {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}
.loading-typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #bbb;
  animation: dot-bounce 1.4s infinite ease-in-out both;
}
.loading-typing span:nth-child(1) { animation-delay: -0.32s; }
.loading-typing span:nth-child(2) { animation-delay: -0.16s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* Content */
.content :deep(p) { margin: 0 0 4px; }
.content :deep(p:last-child) { margin-bottom: 0; }
.content :deep(strong) { font-weight: 600; }
.content :deep(em) { font-style: italic; }
.content :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'SF Mono', 'Menlo', monospace;
}
.content :deep(ul) { padding-left: 16px; margin: 2px 0; }
.content :deep(li) { margin: 1px 0; }
.content :deep(h2) { font-size: 14px; margin: 6px 0 2px; }
.content :deep(h3) { font-size: 13px; margin: 4px 0 2px; }
.content :deep(h4) { font-size: 12px; margin: 4px 0 2px; }

/* Options chips */
.options-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.option-chip {
  padding: 3px 10px;
  border: 1px solid #3b82f6;
  border-radius: 14px;
  background: #e8f0fe;
  color: #3b82f6;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
}
.option-chip:hover:not(:disabled) {
  background: #3b82f6;
  color: #fff;
}
.option-chip.selected {
  background: #059669;
  border-color: #059669;
  color: #fff;
  cursor: default;
}

/* Fill button */
.fill-btn {
  display: block;
  margin-top: 6px;
  padding: 4px 12px;
  border: 1px solid #003d8f;
  border-radius: 6px;
  background: #e8f0fe;
  color: #003d8f;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s;
}
.fill-btn:hover {
  background: #003d8f;
  color: #fff;
}
.fill-btn.filling {
  opacity: 0.6;
  cursor: wait;
}
</style>
