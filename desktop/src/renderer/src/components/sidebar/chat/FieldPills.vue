<script setup lang="ts">
/**
 * FieldPills — Inline pill bar with "+N more" overflow.
 *
 * Shows Overview + field pills. When pills overflow the container,
 * extras collapse into a "+N" button that opens a popup menu.
 * No scrolling — clean, predictable, easy to click.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { SubSession, SessionKey } from '@ai-tip/sdk'

const props = defineProps<{
  children: SubSession[]
  activeKey: SessionKey | null
}>()

const emit = defineEmits<{
  select: [key: SessionKey]
}>()

const overflowOpen = ref(false)

// ── Computed ──
const overviewSession = computed<SubSession | undefined>(() =>
  props.children.find(c => c.key.type === 'page-chat')
)

const fieldPills = computed<SubSession[]>(() =>
  props.children.filter(c => c.key.type === 'field' && c.messages.length > 0)
)

const showBar = computed(() =>
  overviewSession.value != null || fieldPills.value.length > 0
)

// ── Overflow tracking (simple ResizeObserver approach) ──
// Default: show max 4 pills (1 Overview + 3 fields). If more → overflow.
// Simpler than measuring DOM — just cap visible count.
const MAX_VISIBLE = 4
const visibleFieldCount = computed(() => Math.min(fieldPills.value.length, MAX_VISIBLE - 1))
const overflowCount = computed(() => fieldPills.value.length - visibleFieldCount.value)
const overflowPills = computed(() => fieldPills.value.slice(visibleFieldCount.value))

function isActive(key: SessionKey): boolean {
  if (!props.activeKey) return false
  return props.activeKey.type === key.type && props.activeKey.fieldName === key.fieldName
}

function fieldLabel(sub: SubSession): string {
  if (sub.key.type === 'page-chat') return 'Overview'
  const fm = sub.fieldMeta as any
  return fm?.label || fm?.placeholder || fm?.name || sub.key.fieldName || 'field'
}

function msgCount(sub: SubSession): number {
  return sub.messages.length
}

function handleSelect(key: SessionKey): void {
  overflowOpen.value = false
  emit('select', key)
}

// Close overflow on outside click
function onDocClick(e: MouseEvent): void {
  const target = e.target as HTMLElement
  if (!target.closest('.overflow-popup') && !target.closest('.overflow-btn')) {
    overflowOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
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

    <!-- +N overflow button -->
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
/* ── Bar ── */
.field-pills-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-light);
  background: var(--app-white, #fff);
  min-height: 32px;
  flex-wrap: wrap;
}

/* ── Pill ── */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  height: 24px;
  border: 1px solid var(--border-light);
  border-radius: 12px;
  background: var(--app-white);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 0.12s ease;
}
.pill:hover {
  background: var(--app-gray-50);
  border-color: var(--app-gray-300);
}

.pill.active {
  background: var(--accent-bg, #e8f0fe);
  border-color: var(--accent-color, #3b82f6);
  color: var(--accent-color, #3b82f6);
  font-weight: 600;
}

/* ── Overview dot ── */
.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--app-gray-300);
  flex-shrink: 0;
}
.pill.active .pill-dot {
  background: var(--accent-color, #3b82f6);
}

/* ── Separator ── */
.sep {
  width: 1px;
  height: 16px;
  background: var(--border-light);
  border-radius: 1px;
  margin: 0 2px;
  flex-shrink: 0;
}

/* ── Badge ── */
.badge {
  font-size: 9.5px;
  font-weight: 600;
  padding: 0 5px;
  border-radius: 7px;
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text-muted);
  min-width: 16px;
  text-align: center;
  line-height: 14px;
  flex-shrink: 0;
}
.pill.active .badge {
  background: var(--accent-color, #3b82f6);
  color: #fff;
}

/* ── Overflow button ── */
.overflow-wrap {
  position: relative;
  flex-shrink: 0;
}

.overflow-btn {
  color: var(--color-text-muted);
  font-weight: 600;
  min-width: 28px;
  justify-content: center;
  padding: 3px 8px;
}
.overflow-btn:hover {
  color: var(--color-text);
}

/* ── Overflow popup ── */
.overflow-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 160px;
  background: var(--app-white);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 100;
  overflow: hidden;
}

.popup-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.popup-item:hover {
  background: var(--app-gray-50);
}
.popup-item.active {
  background: var(--accent-bg);
  color: var(--accent-color);
}
.popup-item + .popup-item {
  border-top: 1px solid var(--app-gray-100);
}

/* ── Popup transition ── */
.popup-enter-active,
.popup-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
