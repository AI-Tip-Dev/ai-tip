<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TraceSpanDetail, TraceLogEntry } from '@ai-tip/sdk'

const props = defineProps<{
  span: TraceSpanDetail | null
}>()

const emit = defineEmits<{
  close: []
}>()

// ── Tab state ──
const activeTab = ref<'stages' | 'request' | 'response' | 'logs'>('stages')

function setTab(tab: 'stages' | 'request' | 'response' | 'logs'): void {
  activeTab.value = tab
}

// ── Copy state ──
const copyState = ref<'idle' | 'copied'>('idle')

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copyState.value = 'copied'
    setTimeout(() => { copyState.value = 'idle' }, 1500)
  } catch {
    // Fallback
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copyState.value = 'copied'
    setTimeout(() => { copyState.value = 'idle' }, 1500)
  }
}

const statusIcon = computed(() => {
  if (!props.span) return ''
  return props.span.status === 'ok' ? '✅' : props.span.status === 'error' ? '❌' : '⏳'
})

const eventCount = computed(() => props.span?.events?.length ?? 0)

const attemptLabel = computed(() => {
  if (!props.span || props.span.attempt === undefined) return ''
  return `第 ${props.span.attempt + 1} 次尝试`
})

const formatMs = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1) return '<1ms'
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(2) + 's'
}

const logCount = computed(() => props.span?.logs?.length ?? 0)

const sortedLogs = computed<TraceLogEntry[]>(() => {
  if (!props.span?.logs) return []
  return [...props.span.logs].sort((a, b) => a.timestampMs - b.timestampMs)
})

function logOffset(log: TraceLogEntry): string {
  if (!props.span) return ''
  return `+${log.timestampMs - props.span.startMs}ms`
}

function logLevelClass(level: string): string {
  return 'log-' + level
}

// ── Stage tree ──
interface StageNode {
  name: string
  durationMs: number
  indent: number
  attributes?: Record<string, string | number | boolean>
}

const STAGE_LABELS: Record<string, string> = {
  'stream_start': 'Stream started',
  'stream_done': 'Stream finished',
  'first_token': 'First token',
  'api_call': 'API call',
  'api_call_done': 'API response',
  'dns': 'DNS lookup',
  'dns_done': 'DNS resolved',
  'dns_error': 'DNS failed',
  'parse': 'Parse response',
  'prepare': 'Prepare request',
  'finish': 'Done',
}

const KIND_LABELS: Record<string, string> = {
  'batch-suggest': 'Batch Suggest (LLM)',
  'chat': 'Chat (LLM)',
  'fill-single': 'Single Fill (LLM)',
  'detect-fields': 'Detect Fields',
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] || kind
}

function stageLabel(name: string): string {
  return STAGE_LABELS[name] || name
}

const stageTree = computed<StageNode[]>(() => {
  if (!props.span?.events) return []
  const events = props.span.events.filter(e => e.name.startsWith('pipeline.'))
  const stages: StageNode[] = []

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const name = ev.name.replace('pipeline.', '')
    let indent = 0
    if (['api_call', 'api_call_done', 'dns', 'dns_done', 'dns_error', 'parse', 'prepare', 'first_token', 'stream_start', 'stream_done'].includes(name)) {
      indent = 1
    }

    const nextEv = events[i + 1]
    const durationMs = nextEv ? nextEv.timestampMs - ev.timestampMs : 0

    stages.push({ name: stageLabel(name), durationMs, indent, attributes: ev.attributes })
  }

  return stages
})

const rootDurationMs = computed(() => {
  if (!props.span?.startMs || !props.span?.endMs) return 0
  return props.span.endMs - props.span.startMs
})

const requestBody = computed(() => {
  if (!props.span?.requestBody) return ''
  try {
    return JSON.stringify(JSON.parse(props.span.requestBody), null, 2)
  } catch {
    return props.span.requestBody
  }
})

const responseBody = computed(() => {
  if (!props.span?.responseBody) return ''
  try {
    return JSON.stringify(JSON.parse(props.span.responseBody), null, 2)
  } catch {
    return props.span.responseBody
  }
})

/** Raw JSON for copying (no prettify) */
const rawRequestBody = computed(() => {
  if (!props.span?.requestBody) return ''
  try {
    return JSON.stringify(JSON.parse(props.span.requestBody))
  } catch {
    return props.span.requestBody
  }
})

const rawResponseBody = computed(() => {
  if (!props.span?.responseBody) return ''
  try {
    return JSON.stringify(JSON.parse(props.span.responseBody))
  } catch {
    return props.span.responseBody
  }
})

const copyCurrentTabText = computed(() => {
  if (activeTab.value === 'request') return rawRequestBody.value
  if (activeTab.value === 'response') return rawResponseBody.value
  return ''
})

function copyCurrentTab(): void {
  const text = copyCurrentTabText.value
  if (!text) return
  copyToClipboard(text)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="span" class="trace-overlay" @click.self="emit('close')">
      <div class="trace-dialog" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="trace-header">
          <h2 class="trace-title">处理流水线</h2>
          <button class="trace-close" @click="emit('close')">✕</button>
        </div>

        <!-- Summary bar -->
        <div class="trace-summary-bar">
          <span class="trace-stat main">{{ statusIcon }} {{ formatMs(rootDurationMs) }}</span>
          <span class="trace-stat" v-if="eventCount">· {{ eventCount }} 阶段</span>
          <span v-if="attemptLabel" class="trace-stat">· {{ attemptLabel }}</span>
        </div>

        <!-- Model info -->
        <div v-if="span.provider || span.model" class="trace-model-info">
          <span v-if="span.provider" class="trace-badge">{{ span.provider }}</span>
          <span v-if="span.model" class="trace-badge">{{ span.model }}</span>
          <span v-if="span.httpStatus" class="trace-badge">HTTP {{ span.httpStatus }}</span>
          <span v-if="span.promptTokens !== undefined" class="trace-badge">{{ span.promptTokens }} in</span>
          <span v-if="span.completionTokens !== undefined" class="trace-badge">{{ span.completionTokens }} out</span>
        </div>

        <!-- Stage tree -->
        <div class="trace-body">
          <div class="trace-tree-wrap">
          <div class="trace-tree">
            <!-- Root -->
            <div class="tree-node root">
              <span class="node-icon">📡</span>
              <span class="node-label">{{ kindLabel(span.kind) }}</span>
              <span class="node-duration">{{ formatMs(rootDurationMs) }}</span>
            </div>

            <!-- Stages -->
            <div
              v-for="(stage, i) in stageTree"
              :key="i"
              class="tree-node"
              :class="{ 'node-child': stage.indent === 1, 'node-grandchild': stage.indent >= 2 }"
            >
              <span class="node-icon child-icon">{{ stage.indent >= 2 ? '└' : '├' }}</span>
              <span class="node-label">{{ stage.name }}</span>
              <span class="node-duration">{{ formatMs(stage.durationMs) }}</span>
              <span v-if="stage.attributes" class="node-attrs">
                <template v-for="(v, k) in stage.attributes" :key="k">
                  <span class="node-attr">{{ k }}={{ v }}</span>
                </template>
              </span>
            </div>
            <div v-if="stageTree.length === 0" class="tree-empty">No stage events recorded</div>
          </div>
          </div>

          <!-- Tab bar -->
          <div class="trace-tabs">
            <button
              class="trace-tab"
              :class="{ active: activeTab === 'stages' }"
              @click="setTab('stages')"
            >📊 阶段</button>
            <button
              class="trace-tab"
              :class="{ active: activeTab === 'request' }"
              @click="setTab('request')"
            >📤 Request</button>
            <button
              class="trace-tab"
              :class="{ active: activeTab === 'response' }"
              @click="setTab('response')"
            >📥 Response</button>
            <button
              class="trace-tab"
              :class="{ active: activeTab === 'logs' }"
              @click="setTab('logs')"
            >
              📋 Logs
              <span v-if="logCount" class="tab-badge">{{ logCount }}</span>
            </button>
          </div>

          <!-- Tab content -->
          <div class="trace-tab-content">
            <!-- Logs tab -->
            <div v-if="activeTab === 'logs'" class="trace-logs">
              <div v-if="sortedLogs.length === 0" class="trace-empty">No logs recorded</div>
              <div
                v-for="(log, i) in sortedLogs"
                :key="i"
                class="log-line"
                :class="logLevelClass(log.level)"
              >
                <span class="log-offset">{{ logOffset(log) }}</span>
                <span class="log-level">{{ log.level.toUpperCase() }}</span>
                <span class="log-msg">{{ log.message }}</span>
              </div>
            </div>

            <!-- Request tab -->
            <div v-if="activeTab === 'request'" class="trace-code">
              <div v-if="requestBody" class="code-header">
                <span class="code-lang">JSON</span>
                <button class="copy-btn" @click="copyCurrentTab">
                  {{ copyState === 'copied' ? '✅ Copied' : '📋 Copy' }}
                </button>
              </div>
              <pre v-if="requestBody"><code>{{ requestBody }}</code></pre>
              <div v-else class="trace-empty">No request body captured</div>
            </div>

            <!-- Response tab -->
            <div v-if="activeTab === 'response'" class="trace-code">
              <div v-if="responseBody" class="code-header">
                <span class="code-lang">JSON</span>
                <button class="copy-btn" @click="copyCurrentTab">
                  {{ copyState === 'copied' ? '✅ Copied' : '📋 Copy' }}
                </button>
              </div>
              <pre v-if="responseBody"><code>{{ responseBody }}</code></pre>
              <div v-else class="trace-empty">No response captured</div>
            </div>

            <!-- Stages tab (default) -->
            <div v-if="activeTab === 'stages'" class="trace-stage-detail">
              <div v-if="span.statusMessage" class="stage-msg" :class="span.status === 'error' ? 'err' : 'ok'">
                {{ span.statusMessage }}
              </div>
              <div v-else class="trace-empty">Click a stage for details</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Overlay */
.trace-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10002;
  backdrop-filter: blur(2px);
}

/* Dialog */
.trace-dialog {
  background: #fff;
  border-radius: 12px;
  width: 680px;
  max-width: 94vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.08);
  animation: trace-in 0.15s ease-out;
}

@keyframes trace-in {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.trace-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 0;
}

.trace-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.trace-close {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 14px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.trace-close:hover { background: #f1f5f9; color: #475569; }

/* Summary bar */
.trace-summary-bar {
  padding: 10px 20px;
  font-size: 13px;
  color: #1e293b;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  border-bottom: 1px solid #f1f5f9;
}

.trace-stat.main {
  font-weight: 600;
  font-size: 15px;
  font-family: 'SF Mono', 'Consolas', monospace;
  color: #1e293b;
}

.trace-stat { color: #64748b; font-size: 12px; }

/* Model info */
.trace-model-info {
  padding: 0 20px 8px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.trace-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  background: #f1f5f9;
  color: #64748b;
  font-family: 'SF Mono', 'Consolas', monospace;
}

/* Body */
.trace-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 16px;
}

/* Tree */
.trace-tree-wrap {
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 14px;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 4px;
}

.trace-tree {
  padding: 4px 0;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: 'SF Mono', 'Consolas', monospace;
  border-radius: 4px;
}

.tree-node.root {
  font-weight: 600;
  color: #1e293b;
  font-size: 13px;
  background: #f8fafc;
  margin-bottom: 2px;
}

.tree-node.node-child {
  padding-left: 24px;
  color: #475569;
}

.tree-node.node-grandchild {
  padding-left: 44px;
  color: #64748b;
  font-size: 11px;
}

.node-icon {
  width: 18px;
  text-align: center;
  flex-shrink: 0;
  font-size: 11px;
  color: #94a3b8;
}

.node-icon.child-icon {
  font-family: 'SF Mono', 'Consolas', monospace;
  color: #cbd5e1;
}

.node-label {
  flex: 1;
  color: inherit;
}

.node-duration {
  color: #64748b;
  font-size: 11px;
  min-width: 55px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.node-attrs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  max-width: 200px;
  overflow: hidden;
}

.node-attr {
  font-size: 9px;
  color: #94a3b8;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.tree-empty {
  font-size: 11px;
  color: #94a3b8;
  padding: 8px 8px 8px 28px;
}

/* Tabs */
.trace-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 10px;
}

.trace-tab {
  padding: 6px 14px;
  font-size: 11px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.12s;
  font-family: inherit;
}
.trace-tab:hover { color: #64748b; }
.trace-tab.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.tab-badge {
  font-size: 9px;
  background: #e2e8f0;
  padding: 0 5px;
  border-radius: 8px;
  margin-left: 4px;
  color: #64748b;
}

/* Tab content */
.trace-tab-content {
  flex: 1;
  min-height: 60px;
  max-height: 260px;
  overflow-y: auto;
}

.trace-empty {
  font-size: 11px;
  color: #94a3b8;
  padding: 12px 0;
  text-align: center;
}

.stage-msg {
  font-size: 12px;
  padding: 8px;
  border-radius: 6px;
}
.stage-msg.ok { background: #f0fdf4; color: #166534; }
.stage-msg.err { background: #fef2f2; color: #991b1b; }

/* Logs */
.trace-logs {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
  line-height: 1.7;
  max-height: 260px;
  overflow-y: auto;
}

.log-line {
  display: flex;
  gap: 8px;
  padding: 1px 4px;
  border-radius: 2px;
}

.log-offset {
  color: #94a3b8;
  min-width: 52px;
  flex-shrink: 0;
}

.log-level {
  min-width: 42px;
  flex-shrink: 0;
  font-weight: 500;
}

.log-msg {
  color: #334155;
  word-break: break-all;
}

.log-info .log-level { color: #3b82f6; }
.log-debug .log-level { color: #8b5cf6; }
.log-warn .log-level { color: #f59e0b; }
.log-error .log-level { color: #ef4444; }

/* Code */
.trace-code {
  max-height: 260px;
  overflow: auto;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  border-radius: 8px 8px 0 0;
}

.code-lang {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-family: 'SF Mono', 'Consolas', monospace;
}

.copy-btn {
  font-size: 10px;
  padding: 3px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.12s;
}
.copy-btn:hover {
  background: #3b82f6;
  color: #fff;
  border-color: #3b82f6;
}

.trace-code pre {
  margin: 0;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 0 0 8px 8px;
  font-size: 11px;
  font-family: 'SF Mono', 'Consolas', monospace;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  color: #334155;
}
</style>
