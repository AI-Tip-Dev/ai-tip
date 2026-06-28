/**
 * Options Page — main.ts
 *
 * Extension settings page. Uses Vue SFCs (OptionsApp + ModelConfigDialog)
 * matching desktop SettingsDialog + ModelConfigDialog design.
 */
import { createApp } from 'vue'
import OptionsApp from './OptionsApp.vue'

createApp(OptionsApp).mount('#app')
