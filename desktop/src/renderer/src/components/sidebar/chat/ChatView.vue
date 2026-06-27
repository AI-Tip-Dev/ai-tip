<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import WelcomeView from './WelcomeView.vue'
import UserMessage from './UserMessage.vue'
import BotMessage from './BotMessage.vue'
import DetectedFieldsPanel from '../DetectedFieldsPanel.vue'
import BatchFillCard from './BatchFillCard.vue'
import FieldSuggestionCard from './FieldSuggestionCard.vue'
import type { ChatMessageItem } from '../../../composables/useChat'
import type { FieldContext, SimpleField, RawAXNode } from '../../../../../preload/index.d'
import type { BatchFieldSuggestion } from '@ai-tip/sdk'
import { useI18n } from '../../../composables/useI18n'

const props = defineProps<{
  messages: ChatMessageItem[]
  isStreaming: boolean
  hasKB: boolean
  hasFields: boolean
  pageLabel: string
  /** Label of the field being tipped (for Fill button detection) */
  fillFieldLabel?: string
  /** Field context from AI Tip button — set when user clicks ✨ */
  tipContext?: FieldContext | null
  /** Field metadata from active sub-session — used as fallback when no AI Tip active */
  fieldMeta?: FieldContext | null
  /** Whether we're in a field sub-session (shows ContextChip in BotMessage) */
  isFieldMode?: boolean
  /** Page context title for ContextChip source label */
  pageContextTitle?: string
  /** Detected form fields for the current page (overview mode) */
  detectedFields?: SimpleField[]
  /** Raw AX nodes for the current page (overview mode) */
  rawAXNodes?: RawAXNode[]
  /** Whether page summarization is in progress (suppresses suggestion chips) */
  pageSummaryLoading?: boolean
  /** Batch pre-fill suggestions (for showing BatchFillCard and FieldSuggestionCard) */
  batchSuggestions?: BatchFieldSuggestion[]
  /** Whether batch pre-fill is in progress */
  batchInProgress?: boolean
  /** Number of fields to pre-fill */
  detectedFieldCount?: number
  /** Whether a page summary already exists (hide redundant "总结本页" chip) */
  hasPageSummary?: boolean
  /** Streaming partial content from batch suggest (raw JSON being generated) */
  batchStreamContent?: string
}>()

const emit = defineEmits<{
  send: [text: string, modelId?: string]
  fill: [value: string]
  rescan: []
  batchStart: []
  batchCancel: []
  batchViewAll: []
  suggestionReSuggest: [fieldKey: string]
}>()

const { t } = useI18n()

/** Effective field context: AI Tip takes priority, fall back to session fieldMeta */
const effectiveCtx = computed<FieldContext | null>(() => {
  return props.tipContext ?? props.fieldMeta ?? null
})

watch(() => props.tipContext, () => {
  // Reset overflow when field changes
  showMoreFollowUps.value = false
})

// ── Follow-up chips (after last bot response) ──
// Unified with WelcomeView: same rich chip set whether first field or Nth field

const MAX_VISIBLE = 3
const showMoreFollowUps = ref(false)

interface FollowUp {
  label: string
  icon: string
  prompt: string
  primary?: boolean
}

const followUps = computed<FollowUp[]>(() => {
  if (props.messages.length === 0) return []
  const last = props.messages[props.messages.length - 1]
  // Only show after bot finished responding
  if (last.role !== 'assistant' || last.isStreaming) return []

  const chips: FollowUp[] = []

  // ── Field-specific follow-ups (unified with WelcomeView fieldChips) ──
  const ctx = effectiveCtx.value
  if (ctx) {
    const label = ctx.label || ctx.placeholder || ctx.name || 'this field'
    const type = ctx.type
    const purpose = ctx.formPurpose
    const hasValue = !!ctx.value
    const hasSiblings = ctx.siblingLabels.length > 0
    const siblingNames = ctx.siblingLabels.slice(0, 3).join(', ')
    const pageTitle = ctx.pageTitle || 'this page'

    // Primary: same as WelcomeView
    chips.push({
      label: t('chips.whatToFill'),
      icon: '💡',
      prompt: `I'm filling out "${label}" (${type} field) on ${pageTitle}. Please suggest 3 candidate values.${ctx.placeholder ? ` Placeholder: "${ctx.placeholder}".` : ''}${hasValue ? ` Current value: "${ctx.value}".` : ''}

After your explanation, put your 3 suggestions (real values, not placeholders) in this format:
[[OPTIONS:${label}]]suggestion-one||suggestion-two||suggestion-three[[/OPTIONS]]

Replace "suggestion-one" etc with your actual suggested values.`,
      primary: true
    })

    // Type-aware secondary chips
    if (type === 'select-one' || type === 'select-multiple' || ctx.tagName?.toLowerCase() === 'select') {
      chips.push({
        label: t('chips.listOptions'),
        icon: '📋',
        prompt: `List the most common options I should consider for "${label}" (${type} field)${purpose !== 'unknown' ? ` on a ${purpose} form` : ''}. After your list, put your 3 suggestions (real values, not placeholders) in this format:\n[[OPTIONS:${label}]]suggestion-one||suggestion-two||suggestion-three[[/OPTIONS]]\n\nReplace "suggestion-one" etc with your actual suggested values.`
      })
    } else if (type === 'textarea' || type === 'richtext') {
      chips.push({
        label: hasValue ? t('chips.polishText') : t('chips.writeDraft'),
        icon: hasValue ? '✨' : '✍️',
        prompt: hasValue
          ? `Please polish and improve the text I entered in "${label}":\n\n"${ctx.value}"\n\nFix grammar, improve clarity, and make it more professional.`
          : `Please write a draft for "${label}" on ${pageTitle}.${ctx.placeholder ? ` The placeholder says: "${ctx.placeholder}".` : ''}${purpose !== 'unknown' ? ` This is a ${purpose} form.` : ''}`
      })
    } else if (type === 'email') {
      chips.push({
        label: t('chips.suggestEmail'),
        icon: '📧',
        prompt: `I need to enter an email for "${label}"${purpose !== 'unknown' ? ` on a ${purpose} form` : ''}. Suggest an appropriate email address format.${hasSiblings ? ` Other fields include ${siblingNames}.` : ''}`
      })
    } else {
      chips.push({
        label: hasValue ? t('chips.improveInput') : t('chips.formatHelp'),
        icon: hasValue ? '🔧' : '📐',
        prompt: hasValue
          ? `Please review and improve what I entered in "${label}": "${ctx.value}". Make it more appropriate for this form.`
          : `What format, rules, or constraints should I follow when filling in "${label}" (${type} field)${purpose !== 'unknown' ? ` on a ${purpose} form` : ''}?${ctx.placeholder ? ` The placeholder says: "${ctx.placeholder}".` : ''} Explain the expected format and conventions, then suggest 3 candidate values.

After your explanation, put your 3 suggestions (real values, not placeholders) in this format:
[[OPTIONS:${label}]]suggestion-one||suggestion-two||suggestion-three[[/OPTIONS]]

Replace "suggestion-one" etc with your actual suggested values.`
      })
    }

    return chips
  }

  // General follow-ups (no tipContext)
  // Skip "总结本页" when summary already visible — avoid redundant action
  if (!props.hasPageSummary) {
    chips.push({
      label: t('quick.summarize'),
      icon: '📝',
      prompt: 'Summarize this page'
    })
  }
  chips.push({
    label: t('chips.tellMore'),
    icon: '💬',
    prompt: 'Tell me more about this topic'
  })
  return chips
})

/** Field type from tipContext — used by BotMessage to show textarea fill button */
const fillFieldType = computed(() => effectiveCtx.value?.type ?? '')

const visibleFollowUps = computed(() => {
  if (showMoreFollowUps.value) return followUps.value
  return followUps.value.slice(0, MAX_VISIBLE)
})

const followUpOverflow = computed(() => followUps.value.length - visibleFollowUps.value.length)

const showFollowUps = computed(() => {
  if (props.batchInProgress) return false
  // When batch-fill card is in trigger state, it has its own CTA — suppress follow-ups
  const lastMsg = props.messages[props.messages.length - 1]
  if (lastMsg?.card?.type === 'batch-fill' && lastMsg.card.state === 'trigger') return false
  return followUps.value.length > 0
})

function handleFollowUpClick(chip: FollowUp): void {
  emit('send', chip.prompt)
}
</script>

<template>
  <div class="chat-view" :class="{ empty: messages.length === 0 }">
    <!-- AX Tree / Detected Fields — always visible in overview mode when data exists -->
    <DetectedFieldsPanel
      v-if="!isFieldMode && !effectiveCtx && (detectedFields?.length || rawAXNodes?.length)"
      :detected-fields="detectedFields ?? []"
      :raw-a-x-nodes="rawAXNodes ?? []"
      @rescan="$emit('rescan')"
    />



    <!-- Empty state: WelcomeView with suggestion cards (hidden during processing) -->
    <WelcomeView
      v-if="messages.length === 0"
      :page-label="pageLabel"
      :has-k-b="hasKB"
      :has-fields="hasFields"
      :tip-context="effectiveCtx"
      :loading="pageSummaryLoading || batchInProgress"
      @send="$emit('send', $event)"
    />

    <!-- Has messages: message list below -->
    <template v-else>
      <template v-for="msg in messages" :key="msg.id">
        <UserMessage
          v-if="msg.role === 'user'"
          :content="msg.content"
        />

        <template v-else>
          <!-- Card rendering: distinct wrapper for visual separation from BotMessage -->
          <div v-if="msg.card?.type === 'batch-fill'" class="card-msg">
            <BatchFillCard
              :state="msg.card.state"
              :field-count="msg.card.fieldCount"
              :trace-span-id="msg.card.traceSpanId"
              :model-name="msg.card.modelName"
              :token-count="msg.card.tokenCount"
              :started-at="msg.card.startedAt"
              :stream-content="batchStreamContent"
              @start="$emit('batchStart')"
              @cancel="$emit('batchCancel')"
              @view-all="$emit('batchViewAll')"
            />
          </div>
          <div v-else-if="msg.card?.type === 'suggestion'" class="card-msg">
            <FieldSuggestionCard
              :field-key="msg.card.fieldKey"
              :suggested-value="msg.card.suggestedValue"
              :confidence="msg.card.confidence"
              :reasoning="msg.card.reasoning"
              @re-suggest="$emit('suggestionReSuggest', msg.card!.fieldKey)"
            />
          </div>

          <BotMessage
            :content="msg.content"
            :is-streaming="msg.isStreaming ?? false"
            :fill-field-label="fillFieldLabel"
            :fill-field-type="fillFieldType"
            :used-page-context="isFieldMode && msg.usedPageContext === true"
            :page-context-title="pageContextTitle || ''"
            :trace-span-id="msg.traceSpanId"
            :trace-error="msg.traceError"
            :trace-duration-ms="msg.traceDurationMs"
            @fill="$emit('fill', $event)"
          />
        </template>
      </template>

      <!-- Follow-up suggestions (after last bot response) -->
      <div v-if="showFollowUps" class="followup-section">
        <div class="followup-row">
          <button
            v-for="(chip, i) in visibleFollowUps"
            :key="i"
            class="followup-chip"
            :class="{ 'followup-primary': chip.primary }"
            @click="handleFollowUpClick(chip)"
          >
            <span class="followup-icon">{{ chip.icon }}</span>
            <span class="followup-label">{{ chip.label }}</span>
          </button>

          <!-- Overflow toggle -->
          <button
            v-if="!showMoreFollowUps && followUpOverflow > 0"
            class="followup-chip followup-more"
            @click="showMoreFollowUps = true"
          >
            {{ t('chips.showMore', { n: followUpOverflow }) }}
          </button>
          <button
            v-if="showMoreFollowUps && followUpOverflow > 0"
            class="followup-chip followup-more"
            @click="showMoreFollowUps = false"
          >
            {{ t('chips.showLess') }}
          </button>
        </div>
      </div>

      <!-- Scroll anchor -->
      <div ref="scrollAnchor" class="scroll-anchor" />
    </template>
  </div>
</template>

<style scoped>
.chat-view {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.chat-view.empty {
  display: flex;
  flex-direction: column;
}

/* Card wrapper — distinct spacing from BotMessage, cards handle their own accent */
.card-msg {
  display: flex;
  justify-content: flex-start;
  padding: 6px 12px;
  margin: 4px 0;
}

.card-wrapper {
  padding: 0 12px;
}
.scroll-anchor {
  height: 4px;
}

/* ── Follow-up chips ── */
.followup-section {
  padding: 8px 12px 12px;
}

.followup-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.followup-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 16px;
  background: var(--app-white, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s ease;
}
.followup-chip:hover {
  border-color: var(--accent-color, #3b82f6);
  color: var(--accent-color, #3b82f6);
  background: #f0f5ff;
}

.followup-primary {
  border-color: var(--accent-color, #3b82f6);
  background: #eff6ff;
  color: var(--accent-color, #3b82f6);
  font-weight: 600;
}
.followup-primary:hover {
  background: #dbeafe;
  color: #2563eb;
  border-color: #2563eb;
}

.followup-more {
  color: var(--color-text-muted, #9ca3af);
  font-style: italic;
}

.followup-icon {
  font-size: 13px;
  flex-shrink: 0;
}
.followup-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
