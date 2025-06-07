<template>
  <v-app :data-lang="optionsData.pluginLanguage">
    <div class="sidepanel-container">
      <v-app-bar density="compact" style="height: 2.3rem;">
        <v-app-bar-title>
          <v-icon color="green darken-2" class="me-2">mdi-translate</v-icon>
          {{ currentCourse }}
        </v-app-bar-title>
        <v-spacer />

        <!-- Language Selector -->
        <language-selector v-model="optionsData.pluginLanguage" @update:modelValue="saveOptions" />
        <!-- Theme Toggle Button -->
        <v-btn density="compact" variant="text" @click="optionsData.lightTheme = !optionsData.lightTheme; saveOptions()"
          style="min-width: 0; padding: 0 2px; font-size: 1.2rem;">
          {{ optionsData.lightTheme ? '☀️' : '🌙' }}
        </v-btn>
      </v-app-bar>

      <v-main style="--v-layout-bottom: 0;--v-layout-top: 2.5rem;">
        <InfoAlert ref="infoAlert" />
        <v-container fluid style="padding-top: 0rem; padding-bottom: 0;height: 100%;">
          <v-card density="compact" style="height: 100%;">
            <v-tabs v-model="activeTab" bg-color="primary" density="compact">
              <v-tab value="words" density="compact" prepend-icon="mdi-magnify" style="text-transform: none;">{{ util.getText('Words') }}</v-tab>
              <v-tab value="games" density="compact" prepend-icon="mdi-gamepad-variant" style="text-transform: none;">Games</v-tab>
              <v-tab value="anki" density="compact" prepend-icon="mdi-cards" style="text-transform: none;">{{ util.getText('Anki') }}</v-tab>
              <v-tooltip location="bottom" :open-delay="1000">
                <template v-slot:activator="{ props }">
                  <v-tab value="hotkeys" density="compact" prepend-icon="mdi-keyboard-settings-outline" v-bind="props"></v-tab>
                </template>
                <span>{{ util.getText('Hotkeys') }}</span>
              </v-tooltip>
            </v-tabs>

            <v-card-text>
              <v-window v-model="activeTab">
                <!-- Words Tab -->
                <v-window-item value="words">
                  <WordsTab :db_words="db_words" :optionsData="optionsData" :saveOptions="saveOptions"
                    :dbProxy="dbProxy" :showMessage="showMessage" @refresh-words="loadWordsFromDb" />
                </v-window-item>

                <!-- Games Tab -->
                <v-window-item value="games" class="fill-height">
                  <GamesTab />
                </v-window-item>

                <!-- Anki -->
                <v-window-item value="anki">
                  <Anki :optionsData="optionsData" :saveOptions="saveOptions" :db_words="db_words"
                    :showMessage="showMessage" />
                </v-window-item>

                <!-- Hotkeys Tab -->
                <v-window-item value="hotkeys">
                  <HotkeysInfo :optionsData="optionsData" />
                </v-window-item>
              </v-window>
            </v-card-text>
          </v-card>
        </v-container>
      </v-main>

      <v-footer app style="height: 0;" />
    </div>
  </v-app>
</template>

<script>
import { useTheme } from 'vuetify';
import { ref } from 'vue';
import HotkeysInfo from './components/small/HotkeysInfo.vue';
import LanguageSelector from './components/small/LanguageSelector.vue'; // Import the new component
import WordsTab from './components/WordsTab.vue';
import GamesTab from './components/GamesTab.vue';

import { util } from './lib/util.js';
import { DbProxy } from './lib/database.js';

export default {
  components: { HotkeysInfo, WordsTab, LanguageSelector, GamesTab }, // Register LanguageSelector
  data() {
    return {
      activeTab: null,


      dbProxy: null,
      db_words: [],
      messageTimeoutId: null, // To store the timeout ID for the info/success message
    };
  },

  computed: {
    currentCourse() {
      return util.getCurrentCourse();
    },
    chromeRuntimeId() {
      return chrome.runtime.id;
    }
  },

  methods: {

    showMessage(message, type = 'info') {
      this.$refs.infoAlert.showMessage(message, type);

      // Clear any existing timeout before setting a new one
      if (this.messageTimeoutId) {
        clearTimeout(this.messageTimeoutId);
        this.messageTimeoutId = null; // Reset the ID
      }

      // Hide the message after 3 seconds for success/info types
      if (type === 'success' || type === 'info') {
        this.messageTimeoutId = setTimeout(() => {
          this.$refs.infoAlert.showMessage('', '');
          this.messageTimeoutId = null; // Clear the ID after execution
        }, 3000);
      }
    },

    update_progress_bar(info_message) {
      this.showMessage(info_message, 'info');
    },

    async close_side_panel() {
      console.log('Closing side panel');
      window.close(); // Close the side panel
    },

    async set_new_course_id(course_id) {
      this.optionsData.current_course_id = course_id; // Update the current course ID in optionsData
    },

    async words_loaded(all_words) {
      this.showMessage(util.getText('app_wordsExtracted', [all_words.length]), 'success'); // Show success message

      await this.dbProxy.addWords(all_words); // Use db instance from data()
      await this.loadWordsFromDb(); // Call method to refresh list
    },

    async loadWordsFromDb() {
      try {
        const course_id = this.optionsData.current_course_id;
        this.db_words = course_id ? await this.dbProxy.select(course_id) : [];
      } catch (error) {
        console.error(util.getText('Error loading words from database:'), error);
        this.db_words = []; // Reset on error
        this.showMessage(error.message, 'error');
      }
    },
  },

  // Setup function to use Composition API features like useTheme
  setup() {
    const theme = useTheme();
    // Initialize optionsData reactively using ref
    const optionsData = ref(util.options);


    const toggleTheme = () => {
      theme.global.name.value = optionsData.value.lightTheme ? "light" : "dark";
    };

    const saveOptions = async () => {
      await util.save_options(optionsData.value);
      toggleTheme();
    };

    // Return refs and functions to make them available in the template and Options API context
    return {
      optionsData,  // The reactive ref containing theme preference
      toggleTheme,  // Method to apply theme based on optionsData
      saveOptions,  // Method to save options and apply theme
      util,         // Utility functions
    };
  },

  async mounted() {
    // Setup message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message.foreground) return true; // Indicate async response potentially needed

      // 'this' context here refers to the component instance
      util.callMethod(this, message, sendResponse);

      return true; // Keep the message port open for async response
    });

    // Initialize database
    this.dbProxy = new DbProxy();

    // Ensure optionsData is reactive after async operation
    this.optionsData = { ...util.options };
    this.toggleTheme();

    await this.loadWordsFromDb(); // Load initial words
  }
}
</script>

<style>
.sidepanel-container {
    height: 100%;
    display: flex;
    flex-direction: column;
}

/* Hide the app-level scrollbar while keeping the data-table scrollbar */
.v-app, .v-main, .sidepanel-container, .v-container {
  overflow: hidden !important;
}

/* Override compact app bar height */
.v-app-bar.v-toolbar--density-compact .v-toolbar__content {
  height: 2.2rem !important;
}

/* Hide visual scrollbar on main page elements */
html, body {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}
html::-webkit-scrollbar, body::-webkit-scrollbar {
  display: none; /* Chrome, Safari, Opera */
}

/* Ensure the tab content can scroll within its container */
.v-window {
  /* height: calc(100vh - 10rem); */
  overflow: hidden;
}

.v-window-item {
  height: 100%;
  overflow: hidden;
}

/* Ensure adequate space for the content */
.v-card-text {
  padding: 0.5rem;
  height: 100%;
  overflow: hidden;
}
</style>
