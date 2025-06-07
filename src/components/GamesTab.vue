<template>
  <v-container fluid class="pa-0 fill-height">
    <v-row class="text-center" justify="center" style="position: absolute; top: 0.5rem; right: 1rem; z-index: 1;">
      <v-col cols="auto" class="pa-0">
        <v-btn-toggle v-model="selectedGame" mandatory density="compact">
          <v-tooltip location="bottom" text="Flashcards">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="scard">
                <v-icon>mdi-cards-playing-outline</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
          <v-tooltip location="bottom" text="Sentence Constructor">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="sconstructor">
                <v-icon>mdi-puzzle-outline</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
        </v-btn-toggle>
      </v-col>
      <v-col cols="auto" class="pa-0 pl-2">
        <v-tooltip location="bottom" text="Open in new tab">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon :href="fullscreenLink" target="_blank" density="compact">
              <v-icon>mdi-open-in-new</v-icon>
            </v-btn>
          </template>
        </v-tooltip>
      </v-col>
    </v-row>

    <v-window v-model="selectedGame" class="fill-height">
      <v-window-item value="scard" class="fill-height d-flex justify-center align-center">
        <CardApp />
      </v-window-item>
      <v-window-item value="sconstructor" class="fill-height d-flex justify-center align-center">
        <ConsApp />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script>
import CardApp from '../games/SCard/CardApp.vue';
import ConsApp from '../games/SConstructor/ConsApp.vue';

export default {
  name: 'GamesTab',
  components: {
    CardApp,
    ConsApp,
  },
  data() {
    return {
      selectedGame: 'scard', // Default game
    };
  },
  computed: {
    chromeRuntimeId() {
      return chrome.runtime.id;
    },
    fullscreenLink() {
      if (this.selectedGame === 'scard') {
        return `/src/games/SCard/index.html`;
      } else {
        return `/src/games/SConstructor/index.html`;
      }
    },
  },
};
</script>