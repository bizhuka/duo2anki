/**
 * plugins/index.js
 *
 * Automatically included in `./src/main.js`
 */

// Plugins
import vuetify, { initializeTheme } from './vuetify'

export async function registerPlugins(app) {
  app.use(vuetify)
  await initializeTheme(vuetify)
}
