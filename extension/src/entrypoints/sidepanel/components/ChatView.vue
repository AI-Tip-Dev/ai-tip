<script setup lang="ts">
/**
 * ChatView — Message list with WelcomeView, messages, and scroll-to-bottom.
 * Supports BatchFillCard special messages.
 */
import { ref, watch, nextTick } from 'vue'
import type { ChatMessageItem } from '../composables/useSession'
import UserMessage from './UserMessage.vue'
import BotMessage from './BotMessage.vue'
import BatchFillCard from './BatchFillCard.vue'
import WelcomeView from './WelcomeView.vue'

const props = defineProps<{
  messages: ChatMessageItem[]
  /** Active field info (null = Overview mode) */
  activeFieldLabel?: string | null
  activeFieldType?: string | null
  activeFieldPlaceholder?: string | null
  pageTitle?: string
  fieldCount?: number
  /** Whether a model is configured */
  hasModel?: boolean
}>()

const emit = defineEmits<{
  fill: [value: string]
  sendSuggestion: [text: string]
  batchStart: []
  batchCancel: []
  batchViewAll: []
  openSettings: []
}>()

const chatArea = ref<HTMLElement | null>(null)

// ── Auto-scroll ──
function scrollToBottom(): void {
  nextTick(() => {
    if (chatArea.value) {
      chatArea.value.scrollTop = chatArea.value.scrollHeight
    }
  })
}

watch(() => props.messages.length, scrollToBottom)
watch(
  () => {
    // Watch last message content changes (streaming)
    const msgs = props.messages
    if (msgs.length === 0) return ''
    return msgs[msgs.length - 1].content
  },
  scrollToBottom,
)
</script>

<template>
  <div ref="chatArea" class="chat-area">
    <!-- Empty state: WelcomeView -->
    <WelcomeView
      v-if="messages.length === 0"
      :field-label="activeFieldLabel"
      :field-type="activeFieldType"
      :field-placeholder="activeFieldPlaceholder"
      :page-title="pageTitle"
      :field-count="fieldCount"
      :has-model="hasModel"
      @send="(text: string) => emit('sendSuggestion', text)"
      @open-settings="emit('openSettings')"
    />

    <!-- Messages -->
    <template v-for="msg in messages" :key="msg.id || msg.timestamp">
      <!-- Batch Fill Card -->
      <BatchFillCard
        v-if="msg.card?.type === 'batch-fill'"
        :state="msg.card.state"
        :field-count="fieldCount || 0"
        :high-count="msg.card.highCount"
        :medium-count="msg.card.mediumCount"
        :low-count="msg.card.lowCount"
        :stream-content="msg.card.streamContent"
        @start="emit('batchStart')"
        @cancel="emit('batchCancel')"
        @view-all="emit('batchViewAll')"
      />

      <!-- User Message -->
      <UserMessage v-else-if="msg.role === 'user'" :content="msg.content" />

      <!-- Bot Message -->
      <BotMessage
        v-else-if="msg.role === 'assistant'"
        :content="msg.content"
        :is-streaming="msg.isStreaming || false"
        :fill-field-label="activeFieldLabel || undefined"
        @fill="(val: string) => emit('fill', val)"
      />
    </template>
  </div>
</template>

<style scoped>
.chat-area {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  scroll-behavior: smooth;
}
</style>
