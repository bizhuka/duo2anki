<template>
  <div :data-lang="optionsData.pluginLanguage">
    <!--   -->
       <!-- Fixed header with pagination in a nice card -->
       <v-card flat class="pagination-card mb-2"> 
        <div class="d-flex justify-end px-2" style="margin-bottom: 0.5rem; gap: 0.5rem;">
      <ActionButton :icon="hasDuolingoPage ? 'mdi-download' : 'mdi-open-in-new'"
        :tooltipText="hasDuolingoPage ? util.getText('Load Words') : util.getText('Open Words Page')" color="primary"
        :loading="loadingButton" :dataLang="optionsData.pluginLanguage" @click="loadWords" />
      <ActionButton icon="mdi-chat-question-outline" :tooltipText="util.getText('Fill Contexts')" color="secondary"
        :dataLang="optionsData.pluginLanguage" @click="openContextDialog" />
      <ActionButton icon="mdi-delete" :tooltipText="util.getText('Delete all')" color="error"
        :disabled="!db_words.length" :dataLang="optionsData.pluginLanguage" @click="clearHistory" />
        </div>

      <v-text-field append-icon="mdi-magnify" autofocus density="compact" v-model="search" clearable hide-details
          :label="util.getText('Search')"/>
      <v-pagination v-model="page" :length="totalPages" density="compact" />
    </v-card>

    <!-- Data table in scrollable container -->
    <div class="data-table-container">
      <v-data-table class="elevation-1" density="compact" :headers="[
        { title: util.getText('Word - Front'), key: 'front' },
        { title: util.getText('Translation - Back'), key: 'back' },
        { title: util.getText('Context'), key: 'context', sortable: false },
        { title: util.getText('Actions'), key: 'actions', sortable: false }]" :items="filteredWords"
        :loading="loadingTable" :page="page" :items-per-page="itemsPerPage" @update:page="page = $event"
        @update:items-per-page="itemsPerPage = $event">

        <template v-slot:item.back="{ item }">
          <div v-html="item.back"></div>
        </template>

        <template v-slot:item.context="{ item }">
          <div v-html="item.context"></div>
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn icon variant="text" color="primary" size="small" density="compact" @click="playSound(item)">
            <v-icon>mdi-volume-high</v-icon>
          </v-btn>

          <v-btn icon variant="text" color="error" size="small" density="compact" @click="deleteWord(item)">
            <v-icon>mdi-delete</v-icon>
          </v-btn>

          <v-tooltip location="top">
            <template v-slot:activator="{ props }">
              <v-btn v-if="item.image" v-bind="props" icon variant="text" color="info" size="small" density="compact">
                <v-icon>mdi-image</v-icon>
              </v-btn>
            </template>
            <img :src="item.image" style="max-height: 7rem; max-width: 10rem; object-fit: contain;"
              :alt="util.getText('Image preview')" />
          </v-tooltip>

          <v-btn icon variant="text" color="info" size="small" density="compact" @click="handleEditRequest(item)">
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
        </template>

        <template v-slot:no-data>
          <p class="text-center">{{ util.getText('wordsTab_noData') }}</p>
        </template>
      </v-data-table>
    </div>

    <!-- Moved Dialogs -->
    <EditDialog ref="editDialog" @save="handleSaveWord" :onDeleteWord="deleteWord" :filteredWords="filteredWords"
      :optionsData="optionsData" />
    <ConfirmDialog ref="confirmDialog" :optionsData="optionsData" />
    <ContextDialog ref="contextDialog" :optionsData="optionsData" :saveOptions="saveOptions" :db_words="db_words" />
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { util } from '../lib/util.js'; // Import util directly
import ContextDialog from './ContextDialog.vue';
import EditDialog from './EditDialog.vue'; // Import EditDialog
import ConfirmDialog from './small/ConfirmDialog.vue'; // Import ConfirmDialog
import ActionButton from './small/ActionButton.vue'; // Import the new ActionButton component

const DUOLINGO_WORDS_URL = 'https://www.duolingo.com/practice-hub/words';

export default {
  components: { // Register the new component
    ContextDialog,
    EditDialog,
    ConfirmDialog,
    ActionButton, // Register ActionButton
  },
  props: {
    db_words: {
      type: Array,
      required: true,
    },
    optionsData: { // Needed for WordsTabActions and ContextDialog
      type: Object,
      required: true,
    },
    saveOptions: { // Needed for ContextDialog
      type: Function,
      required: true,
    },
    dbProxy: { // Pass DbProxy instance
      type: Object,
      required: true,
    },
    showMessage: { // Pass showMessage function
      type: Function,
      required: true,
    }
  },
  emits: [
    'refresh-words' // Single emit to ask parent to reload words
  ],
  data() {
    return {
      search: '',
      page: 1,
      itemsPerPage: 10,
      loadingButton: false,
      loadingTable: false,
      hasDuolingoPage: false,
      util: util, // Expose util to the template
    };
  },
  computed: {
    filteredWords() {
      if (!this.search) return this.db_words;
      const searchLower = this.search.trim().toLowerCase();
      return this.db_words.filter(word =>
        word.front.toLowerCase().includes(searchLower) ||
        (word.back && typeof word.back === 'string' && word.back.toLowerCase().includes(searchLower))
      );
    },
    totalPages() {
      return Math.ceil(this.filteredWords.length / this.itemsPerPage);
    },
  },
  methods: {
    async getDuolingoTabId() {
      const allTabs = await chrome.tabs.query({ url: DUOLINGO_WORDS_URL });
      return allTabs.length > 0 ? allTabs[0].id : null;
    },

    async checkDuolingoPageLoaded() {
      this.hasDuolingoPage = !!await this.getDuolingoTabId();
    },

    async loadWords() {
      if (this.loadingButton) return;

      const tabId = await this.getDuolingoTabId();
      // Ensure current_course_id is available
      if (!tabId || !this.optionsData.current_course_id) {
        this.showMessage(util.getText('Please open the Duolingo words page first.'), 'info');

        const newTab = await chrome.tabs.create({ url: DUOLINGO_WORDS_URL, active: true });
        chrome.tabs.onUpdated.addListener(async function listener(tabId, changeInfo) {
          if (tabId !== newTab.id)
            return;

          if (changeInfo.status === 'complete' || changeInfo.status === 'error') {
            chrome.tabs.onUpdated.removeListener(listener);
            if (this.optionsData.current_course_id) {
              setTimeout(() => {
                this.loadWords();
              }, 2000); // Delay to ensure the page is fully loaded              
            }
          }
        }.bind(this));
        return;
      }
      this.loadingButton = true;
      this.loadingTable = true;

      chrome.runtime.sendMessage({
        background: true,
        action: "extract_vocabulary",
        action_params: [tabId]
      }, (response => {
        this.loadingButton = false;
        this.loadingTable = false;
        if (response.error) {
          this.showMessage(response.error, 'error');
        }
      }));
    },

    // --- Database Interaction ---
    async clearHistory() {
      this.$refs.confirmDialog.confirm_popup({
        message: 'Are you sure you want to delete all words?',
        action: async () => {
          this.loadingTable = true;
          await this.dbProxy.clearWords();
          this.$emit('refresh-words'); // Ask parent to reload
          this.showMessage(util.getText('All words deleted.'), 'success');
          this.loadingTable = false;
        }
      });
    },

    async deleteWord(word) {
      const confirmed = this.$refs.confirmDialog.confirm_popup({
        title: word.front,
        message: null, // 'Are you sure you want to delete "{0}"?',
        action: async () => {
          this.loadingTable = true;
          await this.dbProxy.deleteWord(word);

          this.$emit('refresh-words'); // Ask parent to reload
          this.showMessage(util.getText('Word "{0}" deleted.', [word.front]), 'success');
          this.loadingTable = false;
        }
      });
      return confirmed; // Return the promise to handle in the caller
    },

    async handleSaveWord(updatedWord) {
      if (!updatedWord) return;
      try {
        this.loadingTable = true;
        await this.dbProxy.updateWord(updatedWord);

        this.$emit('refresh-words'); // Ask parent to reload
        this.showMessage(util.getText('Word "{0}" saved successfully.', [updatedWord.front]), 'success');
      } catch (error) {
        console.error('Error updating word:', error);
        this.showMessage(util.getText('Error updating word. See console for details.'), 'error');
      } finally {
        this.loadingTable = false;
      }
    },

    // --- Dialog Triggers ---
    handleEditRequest(item) {
      this.$refs.editDialog.methods.edit_popup(item);
    },

    openContextDialog() {
      this.$refs.contextDialog.context_popup({
        action: async (wordsWithContext) => {
          try {
            this.loadingTable = true;
            await this.dbProxy.updateWordsContext(wordsWithContext);

            this.$emit('refresh-words'); // Ask parent to reload
            this.showMessage(util.getText('Word contexts updated successfully.'), 'success');
          } catch (error) {
            this.showMessage(error.message, 'error');
          } finally {
            this.loadingTable = false;
          }
        }
      });
    },

    // --- Other Actions ---
    playSound(item) {
      util.playSound(item); // Use imported util
    }
  },
  async mounted() {
    await this.checkDuolingoPageLoaded(); // Check on mount

    // Listen for tab updates to refresh Duolingo page status
    if (chrome && chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (tab.url && tab.url.includes(DUOLINGO_WORDS_URL)) {
          this.checkDuolingoPageLoaded();
        }
      });
    }
    if (chrome && chrome.tabs && chrome.tabs.onRemoved) {
      chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        // Simple check: re-evaluate if any Duolingo page exists
        this.checkDuolingoPageLoaded();
      });
    }
  }
};
</script>

<style scoped>
.data-table-container {
  position: relative;
  height: calc(100vh - 13.5rem); /* Adjust height calculation as needed */
  display: flex;
  flex-direction: column;
  overflow-y: auto; /* Make this container scrollable */
}

/* Ensure the data table properly fills its container */
.v-data-table {
  flex: 1;
  height: 100%;
  /* overflow-y: auto; */ /* Remove scroll from inner table */
}

/* Custom styling for the data table footer */
:deep(.v-data-table-footer) {
  padding-bottom: 0.3rem;
  padding-top: 0.3rem;
}

.pagination-card {
  padding: 0.5rem;
  background-color: var(--v-theme-surface);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  position: sticky;
  top: 0;
  padding-top: 0;
  padding-bottom: 0;
  z-index: 1;
}
</style>
