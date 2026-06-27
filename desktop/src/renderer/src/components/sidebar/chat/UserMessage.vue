<script setup lang="ts">
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
  padding: 8px 12px;
}
.bubble {
  max-width: 90%;
  padding: 8px 12px;
  background: var(--accent-color, #3b82f6);
  color: #fff;
  border-radius: 12px 12px 4px 12px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}
</style>
