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

  build: {
    chunkSizeWarningLimit: 1000, // Adjust chunk size warning limit to 1000 kB
    rollupOptions: {
      input: {
        sidepanel: fileURLToPath(new URL('./sidepanel.html', import.meta.url)),
        background: fileURLToPath(new URL('./src/background.js', import.meta.url)) // Added background script entry
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
        // {
        //   src: 'src/lib/dexie.min.mjs',
        //   dest: './lib/',
        // },
        // {
        //   src: 'src/duolingo_loader.js',
        //   dest: './',
        // },
        // {
        //   src: 'src/background.js',
        //   dest: './',
        // },
        // {
        //   src: 'src/util.js',
        //   dest: './',
        // },
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
