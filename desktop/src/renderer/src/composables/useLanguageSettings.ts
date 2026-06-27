/**
 * Language Settings composable — manages UI language and AI output language preferences.
 * Stored in localStorage for persistence.
 */

import { ref, watch } from 'vue'

// ============================================================
// Types
// ============================================================

export interface LanguageOption {
  code: string
  nativeName: string
  englishName: string
}

/** Supported UI languages */
export const UI_LANGUAGES: LanguageOption[] = [
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Simplified Chinese' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
]

/** Supported AI output languages (for form filling) */
export const OUTPUT_LANGUAGES: LanguageOption[] = [
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Simplified Chinese' },
  { code: 'en', nativeName: 'English', englishName: 'English' },
]

// ============================================================
// Storage keys
// ============================================================

const UI_LANG_KEY = 'ai-sidebar-ui-lang'
const OUTPUT_LANGS_KEY = 'ai-sidebar-output-langs'

// ============================================================
// Singleton state
// ============================================================

const uiLanguage = ref<string>(loadUiLang())
const outputLanguages = ref<string[]>(loadOutputLangs())

// ============================================================
// Composable
// ============================================================

export function useLanguageSettings() {
  // Auto-persist
  watch(uiLanguage, (v) => {
    localStorage.setItem(UI_LANG_KEY, v)
    applyUiLanguage(v)

  })

  watch(outputLanguages, (v) => {
    localStorage.setItem(OUTPUT_LANGS_KEY, JSON.stringify(v))
  }, { deep: true })

  /** Toggle an output language on/off */
  function toggleOutputLang(code: string): void {
    const idx = outputLanguages.value.indexOf(code)
    if (idx >= 0) {
      outputLanguages.value = outputLanguages.value.filter(c => c !== code)
    } else {
      outputLanguages.value = [...outputLanguages.value, code]
    }
  }

  /** Check if an output language is enabled */
  function hasOutputLang(code: string): boolean {
    return outputLanguages.value.includes(code)
  }

  /** Get the AI instruction snippet for output languages */
  function outputLangInstruction(): string {
    if (outputLanguages.value.length === 0) return ''
    const names = outputLanguages.value
      .map(c => OUTPUT_LANGUAGES.find(l => l.code === c)?.nativeName ?? c)
    if (names.length === 1) return `Please respond in ${names[0]}.`
    return `Please respond in one of: ${names.join(', ')}.`
  }

  return {
    uiLanguage,
    outputLanguages,
    toggleOutputLang,
    hasOutputLang,
    outputLangInstruction,
  }
}

// ============================================================
// Internal helpers
// ============================================================

function loadUiLang(): string {
  const stored = localStorage.getItem(UI_LANG_KEY)
  if (stored && UI_LANGUAGES.some(l => l.code === stored)) return stored
  // Default to system language if available, otherwise English
  const sysLang = navigator.language
  return UI_LANGUAGES.some(l => l.code === sysLang) ? sysLang : 'en'
}

function loadOutputLangs(): string[] {
  try {
    const stored = localStorage.getItem(OUTPUT_LANGS_KEY)
    if (stored) {
      const arr = JSON.parse(stored)
      if (Array.isArray(arr)) {
        return arr.filter((c: unknown) =>
          typeof c === 'string' && OUTPUT_LANGUAGES.some(l => l.code === c)
        )
      }
    }
  } catch { /* ignore */ }
  // Default: match UI language
  return [loadUiLang()]
}

function applyUiLanguage(lang: string): void {
  document.documentElement.lang = lang
  // Future: trigger i18n system here
}
