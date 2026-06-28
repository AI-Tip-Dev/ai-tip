<script setup lang="ts">
/**
 * WelcomeView — Empty-state welcome + suggestion chips.
 *
 * Shows context-aware suggestion cards when no messages exist yet.
 * Adapted from desktop WelcomeView.vue.
 */
import { computed, ref } from 'vue'

const props = defineProps<{
  /** Active field label (null = overview mode) */
  fieldLabel?: string | null
  /** Active field type */
  fieldType?: string | null
  /** Active field placeholder */
  fieldPlaceholder?: string | null
  /** Current page title */
  pageTitle?: string
  /** Total detected field count */
  fieldCount?: number
  /** Whether an LLM model is configured and active */
  hasModel?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  openSettings: []
}>()

// ── Suggestion cards ──
interface SuggestionCard {
  label: string
  icon: string
  prompt: string
  primary?: boolean
}

const MAX_VISIBLE = 3
const showMore = ref(false)

const generalChips = computed<SuggestionCard[]>(() => [
  { label: 'Summarize this page', icon: '📝', prompt: 'Summarize this page', primary: true },
  { label: 'Analyze page structure', icon: '🔎', prompt: 'Analyze the structure and layout of this page' },
  { label: 'List all form fields', icon: '📋', prompt: 'List and describe all form fields detected on this page' },
])

const fieldChips = computed<SuggestionCard[]>(() => {
  const label = props.fieldLabel || 'this field'
  const type = props.fieldType || 'text'
  const placeholder = props.fieldPlaceholder

  const chips: SuggestionCard[] = [{
    label: '💡 What should I fill in?',
    icon: '💡',
    prompt: `I'm filling out "${label}" (${type} field). Please suggest 3 candidate values.${placeholder ? ` Placeholder: "${placeholder}".` : ''}\n\nAfter your explanation, put your 3 suggestions in this format:\n[[OPTIONS:${label}]]suggestion-one||suggestion-two||suggestion-three[[/OPTIONS]]`,
    primary: true,
  }]

  if (type === 'select-one' || type === 'select-multiple') {
    chips.push({
      label: '📋 List common options',
      icon: '📋',
      prompt: `List the most common options for "${label}" and put your top 3 suggestions in:\n[[OPTIONS:${label}]]option-one||option-two||option-three[[/OPTIONS]]`,
    })
  } else if (type === 'textarea' || type === 'richtext') {
    chips.push({
      label: '✍️ Write a draft',
      icon: '✍️',
      prompt: `Write a draft for "${label}".${placeholder ? ` The placeholder says: "${placeholder}".` : ''}`,
    })
  } else if (type === 'email') {
    chips.push({
      label: '📧 Suggest email format',
      icon: '📧',
      prompt: `Suggest an appropriate email address for "${label}".`,
    })
  } else {
    chips.push({
      label: '📐 What format is expected?',
      icon: '📐',
      prompt: `What format or rules should I follow for "${label}" (${type} field)?${placeholder ? ` Placeholder: "${placeholder}".` : ''}`,
    })
  }

  return chips
})

const activeChips = computed(() => {
  if (!props.hasModel) return [] // no suggestions without a model
  return props.fieldLabel ? fieldChips.value : generalChips.value
})

const visibleChips = computed(() =>
  showMore.value ? activeChips.value : activeChips.value.slice(0, MAX_VISIBLE)
)

const overflowCount = computed(() => activeChips.value.length - visibleChips.value.length)
</script>

<template>
  <div class="welcome">
    <div class="welcome-icon">{{ !hasModel ? '⚙️' : (fieldLabel ? '✨' : '🤖') }}</div>
    <p class="welcome-title">
      <template v-if="!hasModel">Set up an LLM model to get started</template>
      <template v-else-if="fieldLabel">AI assistance for "{{ fieldLabel }}"</template>
      <template v-else>How can I help?</template>
    </p>
    <p class="welcome-subtitle">
      <template v-if="!hasModel">Connect to Ollama, OpenAI, DeepSeek, or other providers</template>
      <template v-else-if="fieldLabel">Select a suggestion or type your own question</template>
      <template v-else>Ask me about this page or its form fields</template>
    </p>

    <!-- No model: Config CTA -->
    <div v-if="!hasModel" class="suggestions">
      <button class="sug-card sug-primary" @click="emit('openSettings')">
        <span class="sug-card-icon">🔧</span>
        <span class="sug-card-label">Open Model Settings</span>
      </button>
      <p class="config-hint">
        Supports Ollama, OpenAI, Anthropic, DeepSeek,
        Zhipu AI, SiliconFlow, Moonshot, and more.
      </p>
    </div>

    <!-- Suggestion cards (only when model is ready) -->
    <div v-else class="suggestions">
      <button
        v-for="(card, i) in visibleChips"
        :key="i"
        class="sug-card"
        :class="{ 'sug-primary': card.primary }"
        @click="emit('send', card.prompt)"
      >
        <span class="sug-card-icon">{{ card.icon }}</span>
        <span class="sug-card-label">{{ card.label }}</span>
      </button>

      <!-- +N more -->
      <button
        v-if="overflowCount > 0 && !showMore"
        class="sug-card sug-more"
        @click="showMore = true"
      >
        +{{ overflowCount }} more
      </button>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 16px 20px;
  text-align: center;
}

.welcome-icon { font-size: 32px; margin-bottom: 10px; }

.welcome-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px;
}

.welcome-subtitle {
  font-size: 12px;
  color: #9ca3af;
  margin: 0 0 16px;
}

.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 280px;
}

.sug-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #e2e5e9;
  border-radius: 10px;
  background: #fff;
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
  width: 100%;
}
.sug-card:hover {
  border-color: #3b82f6;
  background: #f8faff;
  box-shadow: 0 1px 4px rgba(59, 130, 246, 0.1);
}
.sug-primary {
  border-color: #bfdbfe;
  background: #eff6ff;
}
.sug-primary:hover {
  border-color: #3b82f6;
  background: #dbeafe;
}

.sug-card-icon { font-size: 16px; flex-shrink: 0; }
.sug-card-label { font-size: 12px; color: #374151; }

.sug-more {
  justify-content: center;
  color: #3b82f6;
  font-weight: 500;
  border-style: dashed;
}

.config-hint {
  font-size: 11px;
  color: #9ca3af;
  text-align: center;
  margin-top: 8px;
  line-height: 1.5;
}
</style>
