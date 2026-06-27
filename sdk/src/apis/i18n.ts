/**
 * I18n API — lightweight internationalization with zero dependencies.
 *
 * Built-in: English (en). Additional locales registered via registerLocale().
 *
 * Usage:
 *   bridge.i18n.t('aiTip.banner.title', { field: 'Name' })
 *   bridge.i18n.setLocale('zh-CN')
 *   bridge.i18n.registerLocale('zh-CN', { greeting: '你好' })
 */

import type { Transport, I18nAPI, SupportedLocale, LocaleMessages } from '../types'

// Built-in English locale
const en: LocaleMessages = {
  bridge: {
    notAvailable: 'Bridge is not available in this environment.',
    versionMismatch: 'SDK v{sdk} is incompatible with host v{host}.',
    timeout: 'Request timed out after {ms}ms.',
    permissionDenied: 'Permission denied for operation.',
    unsupported: 'Operation not supported in this environment.',
  },
  aiTip: {
    banner: {
      title: 'AI Tip',
      fill: 'Fill',
      loading: 'Generating...',
    },
  },
  error: {
    unknown: 'An unknown error occurred.',
    networkError: 'Network error. Please check your connection.',
  },
}

// Locale registry
const locales: Map<string, LocaleMessages> = new Map([['en', en]])
let currentLocale: SupportedLocale = 'en'

function getNestedValue(obj: LocaleMessages, path: string): string | null {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return null
    }
  }
  return typeof current === 'string' ? current : null
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

export function createI18nAPI(_transport: Transport): I18nAPI {
  return {
    t(key: string, params?: Record<string, string | number>): string {
      const messages = locales.get(currentLocale)
      if (!messages) return key

      const template = getNestedValue(messages, key)
      if (!template) {
        // Fallback to English
        if (currentLocale !== 'en') {
          const enMessages = locales.get('en')
          if (enMessages) {
            const enTemplate = getNestedValue(enMessages, key)
            if (enTemplate) return interpolate(enTemplate, params)
          }
        }
        return key
      }

      return interpolate(template, params)
    },

    getLocale(): SupportedLocale {
      return currentLocale
    },

    setLocale(locale: SupportedLocale): void {
      if (locales.has(locale)) {
        currentLocale = locale
      }
    },

    registerLocale(locale: string, messages: LocaleMessages): void {
      locales.set(locale, messages)
    },
  }
}
