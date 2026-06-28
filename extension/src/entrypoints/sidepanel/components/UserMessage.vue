<script setup lang="ts">
/**
 * UserMessage — Simple user message bubble (right-aligned).
 */
defineProps<{
  content: string
}>()
</script>

<template>
  <div class="user-msg">
    <div class="bubble">{{ content }}</div>
  </div>
</template>

<style scoped>
.user-msg {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
.bubble {
  background: #003d8f;
  color: #fff;
  padding: 8px 12px;
  border-radius: 12px 12px 4px 12px;
  max-width: 85%;
  font-size: 13px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
