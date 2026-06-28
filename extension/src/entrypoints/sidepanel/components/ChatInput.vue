<script setup lang="ts">
/**
 * ChatInput — Text input with send/stop button.
 */
import { ref } from 'vue'

defineProps<{
  isStreaming: boolean
  placeholder?: string
  disabled?: boolean
  disabledHint?: string
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
  openSettings: []
}>()

const inputText = ref('')

function handleSend(): void {
  const text = inputText.value.trim()
  if (!text) return
  emit('send', text)
  inputText.value = ''
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="input-area">
    <input
      v-model="inputText"
      class="chat-input"
      :class="{ disabled: disabled }"
      :placeholder="disabled ? (disabledHint || placeholder || 'Configure a model first...') : (placeholder || 'Ask AI Tip...')"
      :disabled="isStreaming || disabled"
      @keydown="handleKeydown"
      @click="disabled ? $emit('openSettings') : undefined"
    />
    <button v-if="!isStreaming" class="send-btn" @click="handleSend" :disabled="!inputText.trim()">
      ▶
    </button>
    <button v-else class="stop-btn" @click="emit('stop')">
      ■
    </button>
  </div>
</template>

<style scoped>
.input-area {
  display: flex;
  padding: 8px 14px;
  border-top: 1px solid #e2e5e9;
  flex-shrink: 0;
  gap: 6px;
}

.chat-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
}
.chat-input:focus {
  border-color: #003d8f;
}
.chat-input.disabled {
  background: #f9fafb;
  color: #9ca3af;
  cursor: pointer;
  border-color: #e2e5e9;
}
.chat-input.disabled::placeholder {
  color: #9ca3af;
  font-style: italic;
}

.send-btn, .stop-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}
.send-btn {
  background: #003d8f;
  color: #fff;
}
.send-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
.stop-btn {
  background: #e74c3c;
  color: #fff;
}
</style>
