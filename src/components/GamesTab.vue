<template>
  <v-container fluid class="pa-0 fill-height">
    <v-row class="text-center" justify="center" style="position: absolute; top: 0.5rem; right: 1rem; z-index: 1;">
      <v-col cols="auto" class="pa-0">
        <v-btn-toggle v-model="selectedGame" mandatory density="compact">
          <v-tooltip location="bottom" :text="util.getText('flashcards')">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="scard">
                <v-icon>mdi-cards-playing-outline</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
          <v-tooltip location="bottom" :text="util.getText('sentenceConstructor')">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="sconstructor">
                <v-icon>mdi-puzzle-outline</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
          <v-tooltip location="bottom" :text="util.getText('wordConstructor')">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="sconstructor_bychar">
                <v-icon>mdi-alphabetical-variant</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
          <v-tooltip location="bottom" :text="util.getText('constructorFront')">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="sconstructor_frontGame">
                <v-icon>mdi-flip-to-front</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
          <v-tooltip location="bottom" :text="util.getText('constructorBack')">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" value="sconstructor_backGame">
                <v-icon>mdi-flip-to-back</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
        </v-btn-toggle>
      </v-col>
      <v-col cols="auto" class="pa-0 pl-2">
        <v-tooltip location="bottom" :text="util.getText('openInNewTab')">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon :href="fullscreenLink" target="_blank" density="compact">
              <v-icon color="primary">mdi-open-in-new</v-icon>
            </v-btn>
          </template>
        </v-tooltip>
      </v-col>
      <v-col cols="auto" class="pa-0 pl-2">
        <v-menu offset-y>
          <template v-slot:activator="{ props }">
            <v-tooltip location="bottom" :text="util.getText('gameNotifications')">
              <template v-slot:activator="{ props: tooltipProps }">
                <v-btn v-bind="{ ...props, ...tooltipProps }" icon density="compact">
                  <v-icon color="success">mdi-bell-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="item in notificationOptions"
              :key="item.value"
              @click="gameNotificationInterval = item.value"
              :class="{ 'v-list-item--active': gameNotificationInterval === item.value }"
            >
              <v-list-item-title>{{ item.title }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </v-col>
    </v-row>

    <v-window v-model="selectedGame" class="fill-height">
      <v-window-item value="scard" class="fill-height">
        <CardApp />
      </v-window-item>
      <v-window-item value="sconstructor" class="fill-height">
        <ConsApp />
      </v-window-item>
      <v-window-item value="sconstructor_bychar" class="fill-height">
        <ConsApp consMode='byChar' />
      </v-window-item>
      <v-window-item value="sconstructor_frontGame" class="fill-height">
        <ConsApp consMode='frontGame' />
      </v-window-item>
      <v-window-item value="sconstructor_backGame" class="fill-height">
        <ConsApp consMode='backGame' />
      </v-window-item>
    </v-window>
  </v-container>
</template>


<script setup>
  import { util } from '../lib/util.js';
</script>

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
      notificationOptions: [
        { title: '🚫', value: 0 },
        { title: util.getText('timeUnit_min', [20]), value: 20 },
        { title: util.getText('timeUnit_hour', [1]), value: 60 },
        { title: util.getText('timeUnit_hours', [2]), value: 120 },
        { title: util.getText('timeUnit_hours', [6]), value: 360 },
        { title: util.getText('timeUnit_hours', [12]), value: 720 },
        { title: util.getText('timeUnit_day', [1]), value: 1440 },
        { title: util.getText('timeUnit_days', [2]), value: 2880 },
        { title: util.getText('timeUnit_week', [1]), value: 10080 },
      ],
    };
  },
  computed: {
    gameNotificationInterval: {
      get() {
        return util.options.gameNotificationInterval;
      },
      set(value) {
        if (value === util.options.gameNotificationInterval) return;
        util.save_options({ gameNotificationInterval: value });
        chrome.runtime.sendMessage({
            background: true,
            action: 'setupGameAlarm'
        });
      }
    },
    chromeRuntimeId() {
      return chrome.runtime.id;
    },
    fullscreenLink() {
      switch (this.selectedGame) {
        case 'scard':
          return `/src/games/SCard/index.html`;
        case 'sconstructor':
          return `/src/games/SConstructor/index.html`;
        case 'sconstructor_bychar':
          return `/src/games/SConstructor/index.html?consMode=${ 'byChar' }`;
        case 'sconstructor_frontGame':
          return `/src/games/SConstructor/index.html?consMode=${'frontGame'}`;
        case 'sconstructor_backGame':
          return `/src/games/SConstructor/index.html?consMode=${'backGame'}`;
      }
      return null;
    },
  },
};
</script>