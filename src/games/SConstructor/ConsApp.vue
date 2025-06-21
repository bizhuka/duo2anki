<template>
  <div class="game-app-wrapper">
    <v-sheet rounded="lg" border class="game-app-container text-center pa-4">
    <div class="text-h6 mb-4">{{ allSentences.length }} | 😊 {{ correctAnswersCount }} | 😟 {{ incorrectAnswersCount }}</div>
    
    <div v-if="currentSentence">
      <div class="d-flex justify-center align-center ga-2 mb-4">
        <div class="text-h6">{{ currentSentence.sourcePhrase }}</div>
        <ReplaySoundButton
            ref="replayButton"
            :card="currentSentence"
            :modes="currentSoundModes"
            :autoOff="true"
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
          <v-btn @click="checkAnswer" :disabled="isCheckDisabled()" :title="util.getText('checkAnswer')" color="success">
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </div>
        <div v-else>
          <ReviewControls v-if="isCorrectAnswer"
            :card="currentSentence"
            :dbProxy="dbProxy"
            @review-selected="handleReviewSelected"/>
          <v-btn v-else @click="nextSentence" :title="util.getText('nextSentence')" color="primary">
            <v-icon>mdi-arrow-right</v-icon>
          </v-btn>
        </div>
      </div>

    </div>
    <div v-else-if="allSentences.length > 0 && currentSentenceIndex >= allSentences.length" class="py-8">
      <v-btn @click="restartQuiz" :title="util.getText('startAgain')" size="x-large" icon color="primary">
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
    currentSoundModes(){
      switch(this.consMode){
        case 'byChar':
          return [util.SOUND_MODE.OFF, util.SOUND_MODE.FRONT_WORD]
        case 'frontGame':
          return [util.SOUND_MODE.OFF, util.SOUND_MODE.FRONT_WORD]
        case 'backGame':
          return [util.SOUND_MODE.OFF, util.SOUND_MODE.FRONT_WORD]
      }
      return [util.SOUND_MODE.OFF, util.SOUND_MODE.CONTEXT_ONLY]      
    },
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
        switch(this.consMode){
          case 'frontGame':
            return util.delete_all_tags(this.currentSentence.back)
          case 'backGame':
            return util.delete_all_tags(this.currentSentence.front)
          default:
            return this.currentSentence.targetPhrase.split(' ');
        }        
      }
      return this.constructedWords;
    },
  },
  methods: {
    isCheckDisabled() {
      if(this.answerChecked && !this.isCorrectAnswer)
        return true;

      switch(this.consMode){
        case 'frontGame':
        case 'backGame':
          return this.constructedWords.length !== 1
        default:
          return this.availableWords.length !== 0;
      }
    },
    async loadSentences() {
      if (!this.dbProxy) {
        console.error("DbProxy not initialized in loadSentences");
        return;
      }
      this.dbWords = await this.dbProxy.getCardsForReview();

      this.allSentences = this.dbWords.map(element => {
        const frontWord = util.delete_all_tags(element.front);
        const backWord = util.delete_all_tags(element.back)

        const arr = util.delete_all_tags(element.context).split('→');
        const frontContext = arr[0].trim();
        const backContext = arr[1].trim()

        switch(this.consMode){
          case 'byChar':
            element.targetPhrase = element.front.split('').join(' ');
            element.sourcePhrase = backWord;
            break;
          case 'frontGame':
            const distractorBackWords = this.getDistractorWords(element.id, 'back');
            element.targetPhrase = distractorBackWords.join(' ') + ' ' + backWord;
            element.sourcePhrase = frontWord;
            break;
          case 'backGame':
            const distractorFrontWords = this.getDistractorWords(element.id, 'front');
            element.targetPhrase = distractorFrontWords.join(' ') + ' ' + frontWord;
            element.sourcePhrase = backWord;
            break;
          default:
            // Default to target mode            
            element.targetPhrase = frontContext;
            element.sourcePhrase = `${ backContext } (${ element.front })`;
        }

        return element;
      });
    },
    getDistractorWords(excludeId, type, count = 2) {
      const otherWords = this.dbWords.filter(word => word.id !== excludeId);
      if (otherWords.length < count) {
        count = otherWords.length;
      }
      const shuffled = this.shuffleArray([...otherWords]);
      return shuffled.slice(0, count).map(word => util.delete_all_tags(word[type]));
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

    compareAnswer(){
      switch(this.consMode){
        case 'frontGame':
          return this.constructedWords[0] === util.delete_all_tags(this.currentSentence.back)
        case 'backGame':
          return this.constructedWords[0] === util.delete_all_tags(this.currentSentence.front)
      }

      const constructed = this.constructedWords.join(' ');
      const correct = this.currentCorrectTargetWords.join(' ');
      return constructed === correct
    },

    async checkAnswer() {
      if (!this.currentSentence || !this.dbProxy) return;
      this.answerChecked = true;

      this.isCorrectAnswer = this.compareAnswer();
      if (this.isCorrectAnswer) {
        this.correctAnswersCount++;
        
        this.$nextTick(() => {
          if (this.$refs.constructedSentenceWordList) {
            this.$refs.constructedSentenceWordList.animateSuccess();
          }
        });
      } else {
        this.incorrectAnswersCount++;
        if (this.$refs.constructedSentenceWordList) {
          this.$refs.constructedSentenceWordList.animateFailure();
        }
      }

      // if (this.$refs.replayButton) {
      //   this.$refs.replayButton.replay();
      // }
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