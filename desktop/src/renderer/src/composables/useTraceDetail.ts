/**
 * useTraceDetail — composable for fetching and managing trace span details
 */

import { ref, type Ref } from 'vue'
import type { TraceSpanDetail } from '@ai-tip/sdk'

export interface TraceDetailState {
  span: Ref<TraceSpanDetail | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  fetchDetail: (spanId: string) => Promise<void>
  reset: () => void
}

export function useTraceDetail(): TraceDetailState {
  const span = ref<TraceSpanDetail | null>(null) as Ref<TraceSpanDetail | null>
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDetail(spanId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await window.traceApi.getDetail(spanId)
      span.value = result as TraceSpanDetail | null
    } catch (e: any) {
      error.value = e.message || 'Failed to load trace'
      span.value = null
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    span.value = null
    loading.value = false
    error.value = null
  }

  return { span, loading, error, fetchDetail, reset }
}
