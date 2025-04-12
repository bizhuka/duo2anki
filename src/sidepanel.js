import './assets/sidepanel.css'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Create app with initial props
const app = createApp(App, {
 
})

// Initialize plugins and mount app
registerPlugins(app).then(() => {
  app.mount('#app')
})
