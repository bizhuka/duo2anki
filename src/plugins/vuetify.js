/**
 * plugins/vuetify.js
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'

// Create vuetify instance
function createVuetifyInstance() {
  return createVuetify({
    theme: {
      defaultTheme: 'dark', // Default fallback theme
    },
  })
}

// Export the vuetify instance
export default createVuetifyInstance()

import { util } from '.././lib/util.js'

// Export function to update theme after initialization
export async function initializeTheme(vuetifyInstance) {
  try {
    await util.read_options()
    if (util.options.lightTheme) {
     vuetifyInstance.theme.global.name.value = 'light'
    }
  } catch (error) {
    console.warn(util.getText('Failed to get initial theme from storage:'), error)
  }
}
