<template>
  <div class="game-app-wrapper">
    <v-sheet rounded="lg" border class="game-app-container text-center pa-4">
    <div class="text-h6 mb-4">{{ allSentences.length }} | 😊 {{ correctAnswersCount }} | 😟 {{ incorrectAnswersCount }}</div>
    
    <div v-if="currentSentence">
      <div class="d-flex justify-center align-center ga-2 mb-4">
        <div class="text-h6">{{ currentSentence.sourcePhrase }}</div>
        <replay-sound-button
            ref="replayButton"
            :card="currentSentence"
            :sound-mode="consMode === 'byChar' ? util.SOUND_MODE.FRONT_WORD : util.SOUND_MODE.CONTEXT_ONLY"
        />
      </div>
      <WordList
        :words="availableWords"
        emptyListMessage=""
        @wordClicked="handleWordSelected"
        containerClass="word-bank-style mb-4" />

      <WordList
        ref="constructedSentenceWordList"
        title="1️⃣2️⃣3️⃣➡️"
        :words="finalDisplayWords"
        emptyListMessage='...'
        @wordClicked="handleWordRemoved"
        wordItemClass="constructed-word"
        containerClass="constructed-sentence-style mb-4" />

      <div class="controls-container" style="min-height: 52px;">
        <div v-if="!answerChecked" class="d-flex justify-center ga-2">
          <v-btn @click="checkAnswer" :disabled="availableWords.length !== 0 || (answerChecked && !isCorrectAnswer)" title="Check Answer" color="success">
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </div>
        <div v-else>
          <ReviewControls v-if="isCorrectAnswer"
            :card="currentSentence"
            :dbProxy="dbProxy"
            @review-selected="handleReviewSelected"/>
          <v-btn v-else @click="nextSentence" title="Next Sentence" color="primary">
            <v-icon>mdi-arrow-right</v-icon>
          </v-btn>
        </div>
      </div>

    </div>
    <div v-else-if="allSentences.length > 0 && currentSentenceIndex >= allSentences.length" class="py-8">
      <v-btn @click="restartQuiz" title="Start Again" size="x-large" icon color="primary">
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>
    <div v-else class="d-flex justify-center align-center" style="height: 300px;">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>
    </v-sheet>
  </div>
</template>

<script setup>
  import { util } from '../../lib/util.js';
</script>

<script>
import WordList from './components/WordList.vue';
import ReviewControls from '../components/ReviewControls.vue';
import ReplaySoundButton from '../components/ReplaySoundButton.vue';
import { DbProxy } from '../../lib/database.js';

export default {
  props: {
    consMode: {
      type: String,
      default: '',
    },
  },
  components: {
    WordList,
    ReviewControls,
    ReplaySoundButton,
  },
  data() {
    return {
      dbWords: [],
      allSentences: [],
      currentSentenceIndex: 0,
      dbProxy: null,
      availableWords: [],
      constructedWords: [],
      isCorrectAnswer: false,
      answerChecked: false,
      correctAnswersCount: 0,
      incorrectAnswersCount: 0,
    };
  },
  computed: {
    currentSentence() {
      let item = null
      if (this.allSentences.length > 0 && this.currentSentenceIndex < this.allSentences.length) {
        item = this.allSentences[this.currentSentenceIndex];
      }
      return item;
    },
    currentCorrectTargetWords() {
      if (this.currentSentence) {
        const phrase = this.currentSentence.targetPhrase.toLowerCase();
        const words = phrase.split(/\s+/);
        
        const processedWords = words.map(word => {
          let processedWord = word.replace(/^[^'\p{L}\p{N}]+/u, '');
          processedWord = processedWord.replace(/[^'\p{L}\p{N}]+$/u, '');
          return processedWord;
        }).filter(word => word.length > 0);

        return processedWords;
      }
      return [];
    },
    finalDisplayWords() {
      if (this.isCorrectAnswer && this.currentSentence) {
        return this.currentSentence.targetPhrase.split(' ');
      }
      return this.constructedWords;
    },
  },
  methods: {
    async loadSentences() {
      if (!this.dbProxy) {
        console.error("DbProxy not initialized in loadSentences");
        return;
      }
      this.dbWords = await this.dbProxy.getCardsForReview();

      this.allSentences = this.dbWords.map(element => {        
        if(this.consMode === 'byChar') {
          element.targetPhrase = element.front.split('').join(' ');
          element.sourcePhrase = util.delete_all_tags(element.back);
        } else {
          // Default to target mode
          const arr = util.delete_all_tags(element.context).split('→');
          element.targetPhrase = arr[0].trim();
          element.sourcePhrase = `${ arr[1].trim() } (${ element.front })`;
        }

        return element;
      });
    },
    shuffleArray(array) {
      let currentIndex = array.length, randomIndex;
      while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
      }
      return array;
    },
    setupCurrentSentence() {
      this.isCorrectAnswer = false;
      this.answerChecked = false;
      this.constructedWords = [];
      if (this.currentSentence) {
        this.availableWords = this.shuffleArray([...this.currentCorrectTargetWords]);
      } else {
        this.availableWords = [];
      }
    },
    handleWordSelected({ word, originalIndex }) {
      if (this.isCorrectAnswer) return;
      this.constructedWords.push(word);
      this.availableWords.splice(originalIndex, 1);
      this.answerChecked = false;
    },
    handleWordRemoved({ word, originalIndex }) {
      if (this.isCorrectAnswer) return;
      this.availableWords.push(word);
      this.constructedWords.splice(originalIndex, 1);
      this.answerChecked = false;
    },
    async checkAnswer() {
      if (!this.currentSentence || !this.dbProxy) return;
      this.answerChecked = true;
      const constructed = this.constructedWords.join(' ');
      const correct = this.currentCorrectTargetWords.join(' ');

      if (constructed === correct) {
        this.isCorrectAnswer = true;
        this.correctAnswersCount++;
        
        this.$nextTick(() => {
          if (this.$refs.constructedSentenceWordList) {
            this.$refs.constructedSentenceWordList.animateSuccess();
          }
        });

        if (this.$refs.replayButton) {
          this.$refs.replayButton.replay();
        }
      } else {
        this.isCorrectAnswer = false;
        this.incorrectAnswersCount++;
        if (this.$refs.constructedSentenceWordList) {
          this.$refs.constructedSentenceWordList.animateFailure();
        }
      }
    },
    async handleReviewSelected(quality) {
      if (!this.currentSentence || !this.dbProxy) return;
      try {
        await this.dbProxy.processReview(this.currentSentence.id, quality);
      } catch (error) {
        console.error(`Error processing review for card ${this.currentSentence.id}:`, error);
      }
      this.nextSentence();
    },
    nextSentence() {
      if (this.currentSentenceIndex < this.allSentences.length - 1) {
        this.currentSentenceIndex++;
        this.setupCurrentSentence();
      } else {
        this.currentSentenceIndex++;
        this.answerChecked = false;
      }
    },
    restartQuiz() {
      window.location.reload();
    },
  },
  async mounted() {
    this.dbProxy = new DbProxy();
    await this.loadSentences();
    if (this.allSentences.length > 0) {
      this.setupCurrentSentence();
    }
  },
};
</script>

<style>
.game-app-wrapper {
  min-height: 100dvh;
  min-width: 70dvw;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  box-sizing: border-box;
}

.game-app-container {
  width: 100%;
  max-width: 40rem
}

.constructed-word .v-chip {
  background-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}
</style>