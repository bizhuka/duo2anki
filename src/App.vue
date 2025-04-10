<template>
  <v-app :data-lang="optionsData.pluginLanguage">
    <div class="sidepanel-container">
      <v-app-bar density="compact">
        <v-app-bar-title>
          <v-icon color="green darken-2" class="me-2">mdi-translate</v-icon>
          {{ currentCourse }}
        </v-app-bar-title>
        <v-spacer />

        <!-- Language Selector -->
        <language-selector v-model="optionsData.pluginLanguage" @update:modelValue="saveOptions" />
        <!-- Theme Switch -->
        <v-switch density="compact" hide-details v-model="optionsData.lightTheme" @change="saveOptions"
          :label="optionsData.lightTheme ? util.getText('☀️ Light') : util.getText('🌙 Dark')" inset
          color="primary"></v-switch>
      </v-app-bar>

      <v-main>
        <InfoAlert ref="infoAlert" />
        <v-container fluid>
          <v-card density="compact">
            <v-tabs v-model="activeTab" bg-color="primary" density="compact">
              <v-tab value="words" density="compact" prepend-icon="mdi-magnify">{{ util.getText('Words') }}</v-tab>
              <v-tab value="anki" density="compact" prepend-icon="mdi-cards">{{ util.getText('Anki') }}</v-tab>
              <v-tab value="hotkeys" density="compact" prepend-icon="mdi-keyboard-settings-outline">{{
                util.getText('Hotkeys') }}</v-tab>
            </v-tabs>

            <v-card-text>
              <v-window v-model="activeTab">
                <!-- Words Tab -->
                <v-window-item value="words">
                  <WordsTab :db_words="db_words" :optionsData="optionsData" :saveOptions="saveOptions"
                    :dbProxy="dbProxy" :showMessage="showMessage" @refresh-words="loadWordsFromDb" />
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
    </div>
  </v-app>
</template>

<script>
import { useTheme } from 'vuetify';
import { ref } from 'vue';
import HotkeysInfo from './components/small/HotkeysInfo.vue';
import LanguageSelector from './components/small/LanguageSelector.vue'; // Import the new component
import WordsTab from './components/WordsTab.vue';

import { util } from './lib/util.js';
import { DbProxy } from './lib/database.js';
import { getDuolingoCourseLanguage, pluginsTranslations } from './lib/i18n/translation.js'; // Import pluginsTranslations

export default {
  components: { HotkeysInfo, WordsTab, LanguageSelector }, // Register LanguageSelector
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
      const course_id = this.optionsData.current_course_id;
      return course_id ? getDuolingoCourseLanguage(util.get_course_info(course_id).lang_id) : '';
    },
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
