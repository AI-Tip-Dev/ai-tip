/**
 * TraceStore — JSONL persistence + LRU memory cache
 *
 * Storage layout:
 *   {userData}/traces/YYYY-MM-DD.jsonl
 *
 * Each line is one SpanData JSON object. On app start, the current day's
 * file is read into an LRU cache (max 500 spans). Older spans can be
 * loaded on demand via getDetail().
 */

import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, appendFileSync, readFileSync, existsSync } from 'fs'
import log from 'electron-log'
import type { SpanData } from './TracingSpan'

const logger = log.scope('trace-store')

// ============================================================
// LRU Cache
// ============================================================

class LRUCache<V> {
  private map = new Map<string, V>()
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  get(key: string): V | undefined {
    const val = this.map.get(key)
    if (val !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key)
      this.map.set(key, val)
    }
    return val
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.maxSize) {
      // Delete oldest (first inserted)
      const first = this.map.keys().next().value
      if (first !== undefined) this.map.delete(first)
    }
    this.map.set(key, value)
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  values(): IterableIterator<V> {
    return this.map.values()
  }

  get size(): number {
    return this.map.size
  }
}

// ============================================================
// TraceStore
// ============================================================

export class TraceStore {
  private cache = new LRUCache<SpanData>(500)
  private tracesDir: string

  constructor() {
    this.tracesDir = join(app.getPath('userData'), 'traces')
    try {
      mkdirSync(this.tracesDir, { recursive: true })
    } catch {
      // Might already exist
    }
    this.loadToday()
  }

  // ── File path helpers ──

  private fileForDate(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return join(this.tracesDir, `${y}-${m}-${d}.jsonl`)
  }

  private todayFile(): string {
    return this.fileForDate(new Date())
  }

  // ── Persistence ──

  /** Save a completed span to JSONL + cache */
  save(span: SpanData): void {
    // Cache
    this.cache.set(span.spanId, span)

    // Append to today's JSONL
    try {
      const line = JSON.stringify(span) + '\n'
      appendFileSync(this.todayFile(), line, 'utf-8')
    } catch (err) {
      logger.error(`Failed to write span ${span.spanId}: ${err}`)
    }
  }

  /** Load today's spans into cache */
  private loadToday(): void {
    const file = this.todayFile()
    if (!existsSync(file)) return

    try {
      const text = readFileSync(file, 'utf-8')
      const lines = text.split('\n').filter((l) => l.trim())
      // Only load the last 500 to avoid memory issues
      const recent = lines.slice(-500)
      for (const line of recent) {
        try {
          const span: SpanData = JSON.parse(line)
          this.cache.set(span.spanId, span)
        } catch {
          // Skip malformed lines
        }
      }
      logger.info(`Loaded ${this.cache.size} spans from ${file}`)
    } catch (err) {
      logger.error(`Failed to load traces: ${err}`)
    }
  }

  // ── Query ──

  /** Get a single span by ID (checks cache first, then disk) */
  getDetail(spanId: string): SpanData | null {
    // Check cache
    const cached = this.cache.get(spanId)
    if (cached) return cached

    // Scan today's file
    try {
      const file = this.todayFile()
      if (!existsSync(file)) return null
      const text = readFileSync(file, 'utf-8')
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const span: SpanData = JSON.parse(line)
          if (span.spanId === spanId) {
            this.cache.set(spanId, span)
            return span
          }
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }

    return null
  }

  /**
   * Query spans with optional filter.
   * Default: returns the most recent 50 spans from cache.
   */
  query(filter?: {
    kind?: string
    status?: 'ok' | 'error'
    traceId?: string
    since?: number // timestamp
    limit?: number
  }): SpanData[] {
    let results: SpanData[] = []

    for (const span of this.cache.values()) {
      if (filter?.kind && span.kind !== filter.kind) continue
      if (filter?.status && span.status !== filter.status) continue
      if (filter?.traceId && span.traceId !== filter.traceId) continue
      if (filter?.since && (span.startMs || 0) < filter.since) continue
      results.push(span)
    }

    // Sort by startMs descending (most recent first)
    results.sort((a, b) => (b.startMs || 0) - (a.startMs || 0))

    if (filter?.limit) {
      results = results.slice(0, filter.limit)
    } else {
      results = results.slice(0, 50)
    }

    return results
  }

  /** Get all spans for a given trace */
  getByTrace(traceId: string): SpanData[] {
    return this.query({ traceId, limit: 100 })
  }

  /** Export spans in a date range as OTLP-ready JSON */
  exportRange(filter?: {
    since?: number
    until?: number
    kind?: string
  }): SpanData[] {
    const results: SpanData[] = []

    // Scan today's file (for full export, could scan multiple days)
    try {
      const file = this.todayFile()
      if (!existsSync(file)) return results
      const text = readFileSync(file, 'utf-8')
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        try {
          const span: SpanData = JSON.parse(line)
          if (filter?.kind && span.kind !== filter.kind) continue
          if (filter?.since && (span.startMs || 0) < filter.since) continue
          if (filter?.until && (span.startMs || 0) > filter.until) continue
          results.push(span)
        } catch { /* skip */ }
      }
    } catch { /* ignore */ }

    return results
  }

  /**
   * Clean up trace files older than `maxAgeDays`. Called periodically
   * (e.g., on app start and once per day).
   */
  cleanup(maxAgeDays = 30): void {
    const { readdirSync, unlinkSync, statSync } = require('fs')
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

    try {
      const files = readdirSync(this.tracesDir).filter((f: string) =>
        f.endsWith('.jsonl')
      )
      for (const file of files) {
        const fp = join(this.tracesDir, file)
        try {
          if (statSync(fp).mtimeMs < cutoff) {
            unlinkSync(fp)
            logger.info(`Cleaned up old trace file: ${file}`)
          }
        } catch { /* skip */ }
      }
    } catch (err) {
      logger.error(`Cleanup failed: ${err}`)
    }
  }
}

// Singleton
let _store: TraceStore | null = null
export function getTraceStore(): TraceStore {
  if (!_store) {
    _store = new TraceStore()
  }
  return _store
}

export function initTraceStore(): TraceStore {
  _store = new TraceStore()
  // Cleanup old traces on startup
  setTimeout(() => _store!.cleanup(30), 5000)
  return _store
}
