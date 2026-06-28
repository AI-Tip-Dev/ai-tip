/**
 * Side Panel — main.ts
 * Vue 3 app bootstrap for the side panel.
 * Communication via chrome.runtime to Background SW.
 */

import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)
app.mount('#app')
