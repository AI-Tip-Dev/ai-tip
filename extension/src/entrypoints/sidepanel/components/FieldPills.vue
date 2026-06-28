<script setup lang="ts">
/**
 * FieldPills — Inline pill bar for session switching.
 *
 * Shows Overview + field pills. When pills overflow, extras collapse
 * into a "+N" popup. Adapted from desktop FieldPills.vue.
 */
import { ref, computed } from 'vue'
import type { SubSession, SessionKey } from '../composables/useSession'

const props = defineProps<{
  children: SubSession[]
  activeKey: SessionKey | null
}>()

const emit = defineEmits<{
  select: [key: SessionKey]
}>()

// ── Overflow ──
const MAX_VISIBLE = 4
const overflowOpen = ref(false)

const overviewSession = computed<SubSession | undefined>(() =>
  props.children.find(c => c.key.type === 'page-chat')
)

const fieldPills = computed<SubSession[]>(() =>
  props.children.filter(c => c.key.type === 'field')
)

const showBar = computed(() =>
  overviewSession.value != null || fieldPills.value.length > 0
)

const visibleFieldCount = computed(() => Math.min(fieldPills.value.length, MAX_VISIBLE - 1))
const overflowCount = computed(() => fieldPills.value.length - visibleFieldCount.value)
const overflowPills = computed(() => fieldPills.value.slice(visibleFieldCount.value))

function isActive(key: SessionKey): boolean {
  if (!props.activeKey) return false
  return props.activeKey.type === key.type && props.activeKey.fieldName === key.fieldName
}

function fieldLabel(sub: SubSession): string {
  if (sub.key.type === 'page-chat') return 'Overview'
  const fm = sub.fieldMeta as Record<string, string> | undefined
  return fm?.label || fm?.placeholder || fm?.name || sub.key.fieldName || 'field'
}

function msgCount(sub: SubSession): number {
  return sub.messages.length
}

function handleSelect(key: SessionKey): void {
  overflowOpen.value = false
  emit('select', key)
}

function onDocClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.overflow-popup') && !target.closest('.overflow-btn')) {
    overflowOpen.value = false
  }
}

// Register/cleanup document click on mount/unmount
if (typeof document !== 'undefined') {
  document.addEventListener('click', onDocClick)
}
</script>

<template>
  <div v-if="showBar" class="field-pills-bar">
    <!-- Overview pill -->
    <button
      v-if="overviewSession"
      class="pill"
      :class="{ active: isActive(overviewSession.key) }"
      @click="handleSelect(overviewSession.key)"
    >
      <span class="pill-dot" />
      Overview
      <span v-if="msgCount(overviewSession)" class="badge">{{ msgCount(overviewSession) }}</span>
    </button>

    <span v-if="overviewSession && fieldPills.length" class="sep" />

    <!-- Visible field pills -->
    <button
      v-for="sub in fieldPills.slice(0, visibleFieldCount)"
      :key="sub.key.fieldName"
      class="pill"
      :class="{ active: isActive(sub.key) }"
      @click="handleSelect(sub.key)"
    >
      ✨ {{ fieldLabel(sub) }}
      <span v-if="msgCount(sub)" class="badge">{{ msgCount(sub) }}</span>
    </button>

    <!-- +N overflow -->
    <span v-if="overflowCount > 0" class="overflow-wrap">
      <button class="pill overflow-btn" @click.stop="overflowOpen = !overflowOpen">
        +{{ overflowCount }}
      </button>
      <Transition name="popup">
        <div v-if="overflowOpen" class="overflow-popup">
          <button
            v-for="sub in overflowPills"
            :key="sub.key.fieldName"
            class="popup-item"
            :class="{ active: isActive(sub.key) }"
            @click="handleSelect(sub.key)"
          >
            ✨ {{ fieldLabel(sub) }}
            <span v-if="msgCount(sub)" class="badge">{{ msgCount(sub) }}</span>
          </button>
        </div>
      </Transition>
    </span>
  </div>
</template>

<style scoped>
.field-pills-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid #e2e5e9;
  background: #fff;
  min-height: 32px;
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  height: 24px;
  border: 1px solid #ddd;
  border-radius: 12px;
  background: #fff;
  color: #6b7280;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.12s ease;
}
.pill:hover {
  background: #f0f0f0;
  border-color: #ccc;
}
.pill.active {
  background: #e8f0fe;
  border-color: #3b82f6;
  color: #3b82f6;
  font-weight: 600;
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ccc;
  flex-shrink: 0;
}
.pill.active .pill-dot {
  background: #3b82f6;
}

.sep {
  width: 1px;
  height: 16px;
  background: #e2e5e9;
  border-radius: 1px;
  margin: 0 2px;
  flex-shrink: 0;
}

.badge {
  font-size: 9px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.06);
  color: #6b7280;
  line-height: 16px;
}

.overflow-wrap {
  position: relative;
}

.overflow-popup {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 100;
  background: #fff;
  border: 1px solid #e2e5e9;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  padding: 4px;
  min-width: 140px;
  max-width: 200px;
}

.popup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  text-align: left;
  color: #374151;
}
.popup-item:hover {
  background: #f0f0f0;
}
.popup-item.active {
  background: #e8f0fe;
  color: #3b82f6;
}

/* Transition */
.popup-enter-active { transition: all 0.15s ease-out; }
.popup-leave-active { transition: all 0.1s ease-in; }
.popup-enter-from, .popup-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
