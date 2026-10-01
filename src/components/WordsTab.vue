<template>
  <div class="words-tab">
       <v-card flat class="pagination-card mb-2">
        <div class="d-flex flex-wrap justify-end px-2" style="margin-bottom: 0.5rem;">
          <ActionButton :icon="hasDuolingoPage ? 'mdi-download' : 'mdi-open-in-new'"
            :tooltipText="hasDuolingoPage ? util.getText('Load Words') : util.getText('Open Words Page')" color="primary"
            :loading="loadingButton" @click="loadWords" />
          <ActionButton v-if="isDuolingo" icon="mdi-chat-question-outline" :tooltipText="util.getText('Fill Contexts')" color="secondary"
            :loading="loadingTable" @click="openContextDialog" />
          <ActionButton icon="mdi-translate" :tooltipText="util.getText('Translate words')" color="primary"
            :loading="translatingWords" :disabled="!db_words.length || loadingTable || loadingButton"
            @click="$refs.translateWordsDialog.openTranslationDialog()" />
          <ActionButton icon-only :icon="allCourseWordsArchived ? 'mdi-archive-arrow-up-outline' : 'mdi-archive-arrow-down-outline'"
            :tooltipText="util.getText(allCourseWordsArchived ? 'Unarchive &quot;{0}&quot;' : 'Archive &quot;{0}&quot;', [courseName])"
            :color="allCourseWordsArchived ? 'success' : 'error'"
            :disabled="!courseWords.length || loadingTable" @click="archiveAllWords" />
          <ActionButton icon-only icon="mdi-delete" :tooltipText="util.getText('Delete &quot;{0}&quot;', [courseName])" color="error"
            :disabled="!courseWords.length || loadingTable" @click="clearHistory" />
        </div>

      <v-text-field autofocus density="compact" v-model="search" clearable hide-details
          :label="util.getText('Search')">
        <template v-slot:append-inner v-if="search && !db_words.some(word => word.front.toLowerCase() === search.trim().toLowerCase())">
          <v-tooltip location="top" v-if="isDuolingo">
            <template v-slot:activator="{ props }">
              <v-icon v-bind="props" @click="handleAddWord" color="success">mdi-plus</v-icon>
            </template>
            <span>{{ util.getText('addNewWord') }}</span>
          </v-tooltip>
        </template>
      </v-text-field>
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
        @update:items-per-page="itemsPerPage = $event"
        :row-props="({ item }) => ({ class: item.archived ? 'archived-row' : '' })">

        <template v-slot:item.back="{ item }">
          <div v-if="!item.archived" v-html="item.back"></div>
        </template>

        <template v-slot:item.context="{ item }">
          <div v-if="!item.archived" v-html="item.context"></div>
        </template>

        <template v-slot:item.actions="{ item }">
          <v-btn v-if="!item.archived" icon variant="text" color="primary" size="small" density="compact" @click="playSound(item)">
            <v-icon>mdi-volume-high</v-icon>
          </v-btn>

          <v-btn v-if="!item.archived" icon variant="text" color="error" size="small" density="compact" @click="archiveWord(item, true)">
            <v-icon>mdi-archive-arrow-down-outline</v-icon>
          </v-btn>
          <v-btn v-else icon variant="text" color="success" size="small" density="compact" @click="archiveWord(item, false)">
            <v-icon>mdi-archive-arrow-up-outline</v-icon>
          </v-btn>

          <v-tooltip v-if="!item.archived" location="top">
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
    <EditDialog ref="editDialog" @save="handleSaveWord" :onArchiveWord="archiveWord" :filteredWords="filteredWords"
      :optionsData="optionsData" />
    <ConfirmDialog ref="confirmDialog" :optionsData="optionsData" />
    <ContextDialog ref="contextDialog" :optionsData="optionsData" :saveOptions="saveOptions" :db_words="db_words"/>
    <TranslateWordsDialog ref="translateWordsDialog" :optionsData="optionsData" :saveOptions="saveOptions"
      :dbProxy="dbProxy" :showMessage="showMessage" @refresh-words="$emit('refresh-words')"
      @update:loading="translatingWords = $event" />
  </div>
</template>

<script>
import { util } from '../lib/util.js';
import { processContexts } from '../lib/contextProcessor.js';
import TranslateWordsDialog from './TranslateWordsDialog.vue';

const DUOLINGO_WORDS_URL = 'https://www.duolingo.com/practice-hub/words';

export default {
  components: { TranslateWordsDialog },
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
    },
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
      translatingWords: false,
      hasDuolingoPage: false,
      util: util, // Expose util to the template
    };
  },
  computed: {
    courseName() {
      const courseId = this.optionsData.current_course_id;
      return courseId ? `${util.getCurrentCourse()} (${courseId})` : '';
    },
    courseWords() {
      return this.db_words.filter(word => word.course_id === this.optionsData.current_course_id);
    },
    allCourseWordsArchived() {
      return this.courseWords.length > 0 && this.courseWords.every(word => word.archived);
    },
    isDuolingo() {
      return !util.isReaderCourse(this.optionsData.current_course_id);
    },
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
    addWordFromContextMenu(word) {
      this.search = word;
      this.handleAddWord();
    },
    async getDuolingoTabId() {
      const allTabs = await chrome.tabs.query({ url: DUOLINGO_WORDS_URL });
      allTabs.sort((first, second) => Number(second.active) - Number(first.active) ||
        (second.lastAccessed || 0) - (first.lastAccessed || 0));
      return allTabs[0]?.id ?? null;
    },

    async checkDuolingoPageLoaded() {
      this.hasDuolingoPage = !!await this.getDuolingoTabId();
    },

    async openWordsPage(tabId = null) {
      let tab;
      if (tabId !== null) {
        tab = await chrome.tabs.update(tabId, { url: DUOLINGO_WORDS_URL, active: true });
      } else {
        tab = await chrome.tabs.create({ url: DUOLINGO_WORDS_URL, active: true });
      }
      this.hasDuolingoPage = true;
      return tab.id;
    },

    async loadWords() {
      if (this.loadingButton) return;

      this.loadingButton = true;
      this.loadingTable = true;
      try {
        let tabId = await this.getDuolingoTabId();
        if (tabId === null) {
          tabId = await this.openWordsPage();
        } else {
          await chrome.tabs.update(tabId, { active: true });
        }
        const response = await chrome.runtime.sendMessage({
          background: true,
          action: "extract_vocabulary",
          action_params: [tabId]
        });
        if (response?.error) this.showMessage(response.error, 'error');
      } catch (error) {
        this.showMessage(error.message, 'error');
      } finally {
        this.loadingButton = false;
        this.loadingTable = false;
      }
    },

    // --- Database Interaction ---
    async archiveAllWords() {
      const courseId = this.optionsData.current_course_id;
      if (!courseId || !this.courseWords.length) return;
      const courseName = this.courseName;
      const isArchived = !this.allCourseWordsArchived;
      this.$refs.confirmDialog.confirm_popup({
        message: util.getText(isArchived ? 'Archive all words in course "{0}"?' : 'Unarchive all words in course "{0}"?', [courseName]),
        action: async () => {
          this.loadingTable = true;
          try {
            await this.dbProxy.archiveAllWords(courseId, isArchived);
            this.$emit('refresh-words');
            this.showMessage(util.getText(isArchived ? 'Course "{0}" archived.' : 'Course "{0}" unarchived.', [courseName]), 'success');
          } catch (error) {
            this.showMessage(error.message, 'error');
          } finally {
            this.loadingTable = false;
          }
        }
      });
    },

    async clearHistory() {
      const courseId = this.optionsData.current_course_id;
      if (!courseId) return;
      const courseName = this.courseName;
      this.$refs.confirmDialog.confirm_popup({
        message: util.getText('Delete all words in course "{0}"? Other courses will be kept.', [courseName]),
        action: async () => {
          this.loadingTable = true;
          try {
            await this.dbProxy.clearWords(courseId);
            this.$emit('refresh-words');
            this.showMessage(util.getText('All words in course "{0}" deleted.', [courseName]), 'success');
          } catch (error) {
            this.showMessage(error.message, 'error');
          } finally {
            this.loadingTable = false;
          }
        }
      });
    },

    async archiveWord(word, isArchived = true) {
      const confirmed = this.$refs.confirmDialog.confirm_popup({
        title: word.front,
        message: util.getText(`Are you sure you want to ${isArchived ? 'archive' : 'restore'}?`, [word.front]),
        action: async () => {
          this.loadingTable = true;
          await this.dbProxy.archiveWord(word, isArchived);

          this.$emit('refresh-words'); // Ask parent to reload
          this.showMessage(util.getText(`Word ${isArchived ? 'archived' : 'restored'}`, [word.front]), 'success');
          this.loadingTable = false;
        }
      });
      return confirmed; // Return the promise to handle in the caller
    },

    async handleSaveWord(updatedWord) {
      if (!updatedWord) return;
      try {
        this.loadingTable = true;
        
        if(updatedWord.id === util.WORD_IS_NEW) {
          delete updatedWord.id;
          await this.dbProxy.addWords([updatedWord]);
        } else {
          await this.dbProxy.updateWord(updatedWord);
        }

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
      console.log(item);
      this.$refs.editDialog.methods.edit_popup(item);
    },

    async handleAddWord() {
      await processContexts([{ id: util.WORD_IS_NEW, front: this.search }], this.optionsData, (wordsWithContext) => {
        const course_info = util.get_course_info(util.options.current_course_id);

        // jsut 1 word
        const newWord = wordsWithContext[0];
        newWord.course_id = util.options.current_course_id;
        newWord.targetLang = course_info.targetLang;
        newWord.sourceLang = course_info.sourceLang;

        this.$refs.editDialog.methods.add_new_word(newWord);
      });
    },

    async openContextDialog() {
      this.loadingTable = true;
      try {
        await this.$refs.contextDialog.context_popup({
          action: async (wordsWithContext) => {
            // This action is awaited by the contextProcessor now
            await this.dbProxy.updateWordsContext(wordsWithContext);
            this.$emit('refresh-words'); // Ask parent to reload
            this.showMessage(wordsWithContext.length * this.optionsData.request_count + ` ` + util.getText('Word contexts updated successfully.'), 'success');
          }
        });
        this.loadingTable = false;
      } catch (error) {
        // This will catch errors from the API call or the action
        this.showMessage(error.message, 'error');
        this.loadingTable = false;
      }
    },

    playSound(item) {
      util.playSound(item);
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
.words-tab {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 6rem);
  min-height: 0;
}

:deep(.archived-row) {
  background-color: #f5f5f5; /* Light grey background */
  color: #9e9e9e; /* Grey text */
}
:deep(.archived-row:hover) {
  background-color: #eeeeee !important; /* Slightly darker grey on hover */
}

.data-table-container {
  position: relative;
  flex: 1;
  min-height: 0;
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
