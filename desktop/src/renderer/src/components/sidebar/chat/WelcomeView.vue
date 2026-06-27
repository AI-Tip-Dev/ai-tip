<script setup lang="ts">
/**
 * WelcomeView — Empty-state welcome + suggestion chips.
 *
 * Shows general or field-specific suggestion cards inside the chat area.
 * Chips hidden once conversation starts (market standard: ChatGPT, Claude).
 *
 * Max 3 visible chips with "+N more" overflow.
 */
import { computed, ref } from 'vue'
import type { FieldContext } from '../../../../../preload/index.d'
import { useI18n } from '../../../composables/useI18n'

const props = defineProps<{
  pageLabel: string
  hasKB: boolean
  hasFields: boolean
  tipContext?: FieldContext | null
  /** When true, hide suggestion chips (e.g. page summary or batch in progress) */
  loading?: boolean
}>()

const emit = defineEmits<{
  send: [text: string, modelId?: string]
}>()

const { t } = useI18n()

// ── Types ──
interface SuggestionCard {
  label: string
  icon: string
  prompt: string
  primary?: boolean
}

const MAX_VISIBLE = 3
const showMore = ref(false)

// ── Field-specific chips ──
const fieldChips = computed<SuggestionCard[]>(() => {
  const ctx = props.tipContext
  if (!ctx) return []

  const label = ctx.label || ctx.placeholder || ctx.name || t('aiTip.thisField')
  const type = ctx.type
  const purpose = ctx.formPurpose
  const hasValue = !!ctx.value
  const hasSiblings = ctx.siblingLabels.length > 0
  const siblingNames = ctx.siblingLabels.slice(0, 3).join(', ')
  const pageTitle = ctx.pageTitle || 'this page'

  const result: SuggestionCard[] = []

  result.push({
    label: t('chips.whatToFill'),
    icon: '💡',
    prompt: `I'm filling out "${label}" (${type} field) on ${pageTitle}. Please suggest 3 candidate values.${ctx.placeholder ? ` Placeholder: "${ctx.placeholder}".` : ''}${hasValue ? ` Current value: "${ctx.value}".` : ''}

After your explanation, put your 3 suggestions (real values, not placeholders) in this format:
[[OPTIONS:${label}]]suggestion-one||suggestion-two||suggestion-three[[/OPTIONS]]

Replace "suggestion-one" etc with your actual suggested values.`,
    primary: true
  })

  if (type === 'select-one' || type === 'select-multiple' || ctx.tagName?.toLowerCase() === 'select') {
    result.push({
      label: t('chips.listOptions'),
      icon: '📋',
      prompt: `List the most common options I should consider for "${label}" (${type} field)${purpose !== 'unknown' ? ` on a ${purpose} form` : ''}. After your list, put your 3 suggestions (real values, not placeholders) in this format:\n[[OPTIONS:${label}]]suggestion-one||suggestion-two||suggestion-three[[/OPTIONS]]\n\nReplace "suggestion-one" etc with your actual suggested values.`
    })
  } else if (type === 'textarea' || type === 'richtext') {
    result.push({
      label: hasValue ? t('chips.polishText') : t('chips.writeDraft'),
      icon: hasValue ? '✨' : '✍️',
      prompt: hasValue
        ? `Please polish and improve the text I entered in "${label}":\n\n"${ctx.value}"\n\nFix grammar, improve clarity, and make it more professional.`
        : `Please write a draft for "${label}" on ${pageTitle}.${ctx.placeholder ? ` The placeholder says: "${ctx.placeholder}".` : ''}${purpose !== 'unknown' ? ` This is a ${purpose} form.` : ''}`
    })
  } else if (type === 'email') {
    result.push({
      label: t('chips.suggestEmail'),
      icon: '📧',
      prompt: `I need to enter an email for "${label}"${purpose !== 'unknown' ? ` on a ${purpose} form` : ''}. Suggest an appropriate email address format.${hasSiblings ? ` Other fields include ${siblingNames}.` : ''}`
    })
  } else {
    result.push({
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

  return result
})

// ── General chips ──
const generalChips = computed<SuggestionCard[]>(() => {
  const chips: SuggestionCard[] = []

  chips.push({
    label: t('chips.summarize'),
    icon: '📝',
    prompt: 'Summarize this page',
    primary: true
  })

  chips.push({
    label: t('chips.analyzeStructure'),
    icon: '🔎',
    prompt: 'Analyze the structure and layout of this page'
  })

  if (props.hasFields) {
    chips.push({
      label: t('chips.extractFields'),
      icon: '📋',
      prompt: 'List and describe all form fields detected on this page'
    })
  }

  if (props.hasKB) {
    chips.push({
      label: t('chips.searchKb'),
      icon: '📚',
      prompt: 'Search my knowledge base for relevant information'
    })
  }

  return chips
})

// ── Active chips ──
const activeChips = computed<SuggestionCard[]>(() => {
  if (props.tipContext) return fieldChips.value
  return generalChips.value
})

const visibleChips = computed<SuggestionCard[]>(() => {
  if (showMore.value) return activeChips.value
  return activeChips.value.slice(0, MAX_VISIBLE)
})

const overflowCount = computed(() => activeChips.value.length - visibleChips.value.length)

// ── Header text ──
const headerTitle = computed(() => {
  if (props.tipContext) {
    const label = props.tipContext.label || props.tipContext.placeholder || props.tipContext.name || t('aiTip.thisField')
    return t('chat.welcomeTipActive', { '{}': label })
  }
  return t('chat.welcome')
})

const headerSubtitle = computed(() => {
  if (props.tipContext) {
    return t('chat.welcomeTipSubtitle')
  }
  return t('chat.welcomeSubtitle')
})
</script>

<template>
  <div class="welcome">
    <!-- Header -->
    <div class="welcome-icon">{{ tipContext ? '✨' : '🤖' }}</div>
    <p class="welcome-title">{{ headerTitle }}</p>
    <p class="welcome-subtitle">{{ headerSubtitle }}</p>

    <!-- Suggestion cards with staggered transition (hidden during loading) -->
    <TransitionGroup
      v-if="!loading"
      name="sug"
      tag="div"
      class="suggestions"
      :style="{ '--stagger-delay': '60ms' }"
    >
      <!-- key on label+index for stable identity across field switches -->
      <button
        v-for="(card, i) in visibleChips"
        :key="`${tipContext?.name || 'gen'}-${i}`"
        class="sug-card"
        :class="{ 'sug-primary': card.primary }"
        :style="{ transitionDelay: i * 60 + 'ms' }"
        @click="emit('send', card.prompt)"
      >
        <span class="sug-card-icon">{{ card.icon }}</span>
        <span class="sug-card-label">{{ card.label }}</span>
      </button>

      <!-- Overflow toggle -->
      <button
        v-if="!showMore && overflowCount > 0"
        class="sug-card sug-more"
        @click="showMore = true"
      >
        {{ t('chips.showMore', { n: overflowCount }) }}
      </button>
      <button
        v-if="showMore && overflowCount > 0"
        class="sug-card sug-more"
        @click="showMore = false"
      >
        {{ t('chips.showLess') }}
      </button>
    </TransitionGroup>

    <!-- Loading state: hide chips, let the progress bar in ChatView handle visuals -->
    <div v-else class="welcome-loading">
      <span class="welcome-loading-dot" />
    </div>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 24px 16px 16px;
  overflow-y: auto;
}
.welcome-icon {
  font-size: 32px;
  margin-bottom: 8px;
}
.welcome-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 2px;
  text-align: center;
}
.welcome-subtitle {
  font-size: 11px;
  color: var(--color-text-secondary);
  margin: 0 0 18px;
  text-align: center;
}

/* ── Suggestion cards (vertical) with TransitionGroup ── */
.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 280px;
}

/* TransitionGroup: staggered slide-in on field switch */
.sug-enter-active {
  transition: all 0.25s ease-out;
}
.sug-leave-active {
  transition: all 0.15s ease-in;
}
.sug-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.sug-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.sug-move {
  transition: transform 0.2s ease;
}

.sug-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--border-light, #e5e7eb);
  border-radius: 10px;
  background: var(--app-white, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s ease;
}
.sug-card:hover {
  border-color: var(--accent-color, #3b82f6);
  color: var(--accent-color, #3b82f6);
  background: #f0f5ff;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.08);
}
.sug-card:active {
  transform: translateY(0);
}

.sug-primary {
  border-color: var(--accent-color, #3b82f6);
  background: #eff6ff;
  color: var(--accent-color, #3b82f6);
  font-weight: 600;
}
.sug-primary:hover {
  background: #dbeafe;
  color: #2563eb;
  border-color: #2563eb;
}

.sug-card-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.sug-card-label {
  flex: 1;
  line-height: 1.4;
}

/* Overflow */
.sug-more {
  justify-content: center;
  border-style: dashed;
  color: var(--color-text-muted, #9ca3af);
  font-size: 11px;
  font-weight: 500;
  padding: 8px 14px;
}
.sug-more:hover {
  border-color: var(--accent-color, #3b82f6);
  color: var(--accent-color, #3b82f6);
  background: #f0f5ff;
  transform: none;
  box-shadow: none;
}

/* ── Loading state ── */
.welcome-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px 0;
}

.welcome-loading-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-color, #3b82f6);
  animation: welcome-pulse 1.4s ease-in-out infinite;
}

@keyframes welcome-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.85); }
  50%      { opacity: 1;   transform: scale(1); }
}
</style>
