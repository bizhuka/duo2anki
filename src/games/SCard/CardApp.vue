<template>
  <div class="game-app-wrapper">
    <v-sheet rounded="lg" border class="game-app-container text-center pa-4">
      <div v-if="isLoading" class="d-flex justify-center align-center" style="height: 100%;">
        <v-progress-circular indeterminate color="primary"></v-progress-circular>
      </div>
      <div v-else-if="gameFinished" class="game-finished-message">
        <p class="text-h6">{{ util.getText('reviewSessionFinished') }}</p>
        <v-btn @click="restartGame" color="primary" class="mt-4">{{ util.getText('restartSession') }}</v-btn>
      </div>
      <div v-else-if="cardDisplayData" class="game-area">
        <Flashcard
          :cardData="cardDisplayData"
          :showAnswer="showAnswer"
          ref="flashcardComponent"
          class="mb-4"
        />
        <div class="controls-container">
          <v-btn
            v-show="!showAnswer"
            @click="handleShowAnswerClick"
            block
            size="x-large"
            color="success"
            :title="util.getText('showAnswer')"
          >
            <v-icon>mdi-help</v-icon>
          </v-btn>
          
          <ReviewControls
            v-show="showAnswer"
            :card="currentCard"
            :dbProxy="dbProxy"
            @review-selected="handleReviewSelected"
          />
        </div>
      </div>
      <div v-else class="no-cards-message">
        <p class="text-body-1">{{ util.getText('noCardsForReview') }}</p>
        <v-btn @click="restartGame" color="primary" class="mt-4">{{ util.getText('tryAgain') }}</v-btn>
      </div>
    </v-sheet>
  </div>
</template>

<script setup>
  import { util } from '@/lib/util.js';
</script>

<script>
import Flashcard from './components/Flashcard.vue';
import ReviewControls from '../components/ReviewControls.vue';
import { DbProxy } from '../../lib/database.js';
import anime from 'animejs/lib/anime.es.js';

export default {
  components: {
    Flashcard,
    ReviewControls,
  },
  data() {
    return {
      dbProxy: null,
      allCards: [],
      currentCardIndex: 0,
      isLoading: true,
      showAnswer: false,
      gameFinished: false,
    };
  },
  computed: {
    currentCard() {
      if (this.allCards.length > 0 && this.currentCardIndex < this.allCards.length) {
        return this.allCards[this.currentCardIndex];
      }
      return null;
    },
    cardDisplayData() {
      if (!this.currentCard) return null;
      return this.currentCard;
    }
  },
  methods: {
    async initializeGame() {
      this.isLoading = true;
      if (!this.dbProxy) {
        this.dbProxy = new DbProxy();
      }
      await this.loadCards();
      this.setupNewCard();
      this.isLoading = false;
    },
    async loadCards() {
      try {
        this.allCards = await this.dbProxy.getCardsForReview();
        this.currentCardIndex = 0;
        this.gameFinished = false;
        if (this.allCards.length === 0) {
            this.gameFinished = true;
        }
      } catch (error) {
        console.error("Error loading cards:", error);
        this.allCards = [];
        this.gameFinished = true;
      }
    },
    setupNewCard() {
      if (!this.currentCard) {
        this.gameFinished = true;
        return;
      }
      this.showAnswer = false;
      if (this.$refs.flashcardComponent && this.$refs.flashcardComponent.$el) {
        anime.set(this.$refs.flashcardComponent.$el, { translateX: 0, opacity: 1 });
      }
      // TODO util.playSound(this.currentCard, false);
    },
    handleShowAnswerClick() {
      this.showAnswer = true;
    },
    async handleReviewSelected(quality) {
      if (!this.currentCard) return;
      try {
        await this.dbProxy.processReview(this.currentCard.id, quality);
      } catch (error) {
        console.error(`Error processing review for card ${this.currentCard.id}:`, error);
      }
      
      if (this.$refs.flashcardComponent && this.$refs.flashcardComponent.$el) {
        anime({
          targets: this.$refs.flashcardComponent.$el,
          translateX: [{ value: -20, duration: 200, easing: 'easeOutQuad' }, { value: '120%', duration: 300, easing: 'easeInQuad' }],
          opacity: [{value: 1, duration: 200}, {value:0, duration: 300}],
          duration: 500,
          complete: () => {
            this.goToNextCard();
          }
        });
      } else {
        this.goToNextCard();
      }
    },
    goToNextCard() {
      this.currentCardIndex++;
      if (this.currentCardIndex >= this.allCards.length) {
        this.gameFinished = true;
      } else {
        this.setupNewCard();
      }
    },
    restartGame() {
      this.initializeGame();
    }
  },
  async mounted() {
    await this.initializeGame();
  },
  beforeUnmount() {
  }
};
</script>

<style scoped>
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
  max-width: 40rem;
}

.controls-container {
  min-height: 68px; /* 52px button height + 16px margin */
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
