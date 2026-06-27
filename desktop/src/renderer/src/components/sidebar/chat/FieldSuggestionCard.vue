<script setup lang="ts">
import { useI18n } from '../../../composables/useI18n'

defineProps<{
  fieldKey: string
  suggestedValue: string
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
}>()

const emit = defineEmits<{
  reSuggest: []
}>()

const { t } = useI18n()

const confidenceLabel = {
  high: t('suggestion.confidenceHigh'),
  medium: t('suggestion.confidenceMedium'),
  low: t('suggestion.confidenceLow'),
}
</script>

<template>
  <div class="suggestion-card" :class="confidence">
    <div class="sugg-header">
      <span class="sugg-icon">
        {{ confidence === 'high' ? '🟢' : confidence === 'medium' ? '🟡' : '⚪' }}
      </span>
      <span class="sugg-label">{{ t('suggestion.title') }}</span>
      <span class="sugg-confidence">{{ confidenceLabel[confidence] }}</span>
    </div>

    <div v-if="suggestedValue" class="sugg-value">{{ suggestedValue }}</div>
    <div v-else class="sugg-empty">{{ t('suggestion.empty') }}</div>

    <div v-if="reasoning" class="sugg-reason">
      {{ t('suggestion.reason') }}: {{ reasoning }}
    </div>

    <div class="sugg-actions">
      <span v-if="suggestedValue" class="sugg-filled">{{ t('suggestion.filled') }}</span>
      <button class="sugg-btn resuggest" @click="emit('reSuggest')">
        🤖 {{ t('suggestion.reSuggestBtn') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.suggestion-card {
  padding: 8px 12px;
  border-radius: 12px 12px 12px 4px;
  border: 1px solid var(--border-light, #e2e8f0);
  background: var(--app-gray-50, #f8fafc);
  margin: 0;
}
.suggestion-card.high { border-left: 3px solid #4caf50; }
.suggestion-card.medium { border-left: 3px solid #f59e0b; }
.suggestion-card.low { border-left: 3px solid #ccc; }
.sugg-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.sugg-icon { font-size: 13px; }
.sugg-label { font-size: 11px; font-weight: 600; color: var(--text-secondary, #666); text-transform: uppercase; letter-spacing: 0.5px; }
.sugg-confidence { font-size: 10px; padding: 1px 5px; border-radius: 3px; }
.suggestion-card.high .sugg-confidence { background: #e6f7e6; color: #2e7d32; }
.suggestion-card.medium .sugg-confidence { background: #fff8e1; color: #f57f17; }
.suggestion-card.low .sugg-confidence { background: #f0f0f0; color: #666; }
.sugg-value { font-size: 13px; font-weight: 600; line-height: 1.4; margin-bottom: 4px; word-break: break-all; }
.sugg-empty { font-size: 12px; color: var(--text-secondary, #666); font-style: italic; margin-bottom: 4px; }
.sugg-reason { font-size: 11px; color: var(--text-secondary, #666); margin-bottom: 6px; font-style: italic; }
.sugg-actions { display: flex; align-items: center; gap: 8px; }
.sugg-filled { font-size: 11px; color: #4caf50; font-weight: 500; }
.sugg-btn {
  padding: 3px 8px;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid var(--border-light, #e2e8f0);
  cursor: pointer;
  background: var(--app-gray-50, #f8fafc);
  color: var(--accent, #667eea);
  transition: all 0.15s;
}
.sugg-btn.resuggest:hover { background: var(--accent, #667eea); color: #fff; border-color: var(--accent, #667eea); }
</style>
