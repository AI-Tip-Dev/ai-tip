/**
 * Lightweight i18n composable — zero dependencies, full TypeScript safety.
 *
 * Usage:
 *   const { t } = useI18n()
 *   t('menu.file')                    // → "文件" or "File"
 *   t('bot.fill', { '{}': 'Name' })   // → '填入 "Name"'
 */

import { computed } from 'vue'
import { useLanguageSettings } from './useLanguageSettings'
import type { LocaleMessages } from '../../../shared/locales/types'
import en from '../../../shared/locales/en'
import zhCN from '../../../shared/locales/zh-CN'

const locales: Record<string, LocaleMessages> = { en, 'zh-CN': zhCN }
const fallback = en

export function useI18n() {
  const { uiLanguage } = useLanguageSettings()

  const messages = computed<LocaleMessages>(() => locales[uiLanguage.value] ?? fallback)

  function t<K extends keyof LocaleMessages>(key: K, params?: Record<string, string | number>): string {
    let text = messages.value[key] ?? fallback[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replaceAll(k, String(v))
      }
    }
    return text
  }

  return { t, locale: uiLanguage }
}
