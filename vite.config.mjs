// Plugins
import Components from 'unplugin-vue-components/vite'
import Vue from '@vitejs/plugin-vue'
import Vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import ViteFonts from 'unplugin-fonts/vite'
// import { copy } from 'vite-plugin-copy';
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({

  publicDir: false, // Prevent auto-copying all files from public/

  build: {
    chunkSizeWarningLimit: 2000, // Adjust chunk size warning limit to 2000 kB
    rollupOptions: {
      input: {
        sidepanel: fileURLToPath(new URL('./sidepanel.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/background.js', import.meta.url)), // Added background script entry

        // Games
        sconstructor: fileURLToPath(new URL('./src/games/SConstructor/index.html', import.meta.url)),
        scard: fileURLToPath(new URL('./src/games/SCard/index.html', import.meta.url)),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          // Keep the original name for background.js and place it in the root
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          return 'assets/[name]-[hash].js';
        }
      }
    }
  },

  plugins: [
    Vue({
      template: { transformAssetUrls }
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    Vuetify(),
    Components(),
    // ViteFonts({
    //   google: {
    //     families: [
    //     //   {
    //     //   name: 'Roboto',
    //     //   styles: 'wght@100;300;400;500;700;900',
    //     // }
    //   ],
    //   },
    // }),

    // copy({
    //   targets: [
    //     { src: 'src/background.js', dest: './dist' }
    //   ],
    //   hook: 'writeBundle', // Ensures it copies files during build.
    // }),

    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/sql.js/dist/sql-wasm.wasm',
          dest: 'js/sql'
        },
        // Copy shared assets
        {
          src: 'public/images',
          dest: './'
        },
        // Copy correct manifest based on BUILD_PRODUCT
        ...(process.env.BUILD_PRODUCT === 'kindle'
          ? [
              { src: 'public/manifest-k.json', dest: './', rename: 'manifest.json' },
              { src: 'public/icon-k.png', dest: './', rename: 'icon.png' }
            ]
          : process.env.BUILD_PRODUCT === 'duo'
          ? [
              { src: 'public/manifest-d.json', dest: './', rename: 'manifest.json' },
              { src: 'public/icon-d.png', dest: './', rename: 'icon.png' }
            ]
          : []
        )
      ],
    }),

  ],
  define: { 'process.env': {} },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
    extensions: [
      '.js',
      '.json',
      '.jsx',
      '.mjs',
      '.ts',
      '.tsx',
      '.vue',
    ],
  },
  server: {
    port: 3000,
  },
  css: {
    preprocessorOptions: {
      sass: {
        api: 'modern-compiler',
      },
    },
  },
})
