<template>
  <div class="replay-sound-wrapper">
    <v-menu location="top" open-on-hover :open-on-click="false"
      :close-on-content-click="false" :open-delay="400" :close-delay="300">
      <template #activator="{ props }">
        <v-icon
          v-bind="props"
          :color="getSoundIconColor(soundMode)"
          size="large"
          @click="set_new(card, { force: true })"
        >{{ soundIcon }}</v-icon>
      </template>
      <v-card width="22.5rem" max-width="calc(100vw - 2rem)">
        <v-card-text>
          <div class="mb-3">{{ card?.front }}</div>
          <div class="text-caption mb-1">Sound mode</div>
          <v-btn-toggle :model-value="soundMode" mandatory divided
            variant="outlined" color="success" density="compact" class="tts-options mb-3"
            @update:model-value="changeSoundMode">
            <v-btn v-for="mode in soundModes" :key="mode.value" :value="mode.value"
              :aria-label="mode.title" size="small">
              <v-icon class="mr-1" :color="getSoundIconColor(mode.value)">{{ getSoundIcon(mode.value) }}</v-icon>
              <span style="white-space: pre-line; line-height: 1.1">{{ mode.title }}</span>
            </v-btn>
          </v-btn-toggle>
          <div class="text-caption mb-1">TTS provider</div>
          <v-btn-toggle :model-value="options.ttsProvider" mandatory divided
            :disabled="soundOff"
            variant="outlined" color="success" density="compact" class="tts-options mb-3"
            @update:model-value="changeTtsSettings({ ttsProvider: $event })">
            <v-btn v-for="provider in providers" :key="provider" :value="provider" size="small">
              <span style="white-space: pre-line; line-height: 1.1">{{ provider.replace('Responsive Voice', 'Responsive\nvoice') }}</span>
            </v-btn>
          </v-btn-toggle>
          <div class="text-caption mb-1">Speed</div>
          <v-slider v-model="options.ttsSpeed" aria-label="Speed" :disabled="soundOff"
            :min="0.5" :max="1.5" density="compact"
            :step="0.1" thumb-label hide-details
            @end="changeTtsSettings({ ttsSpeed: $event })" />
        </v-card-text>
      </v-card>
    </v-menu>
  </div>
</template>

<script>
import { util } from '../../lib/util.js';
import { ENABLE_DEBUG_LOGGING } from '../../lib/ai.js';

const playbackCache = new WeakMap();
const providers = [
  util.TTS_PROVIDER.RESPONSIVE_VOICE,
  util.TTS_PROVIDER.GOOGLE,
  // util.TTS_PROVIDER.AZURE_MICROSOFT,
];

export default {
  name: 'ReplaySoundButton',
  props: {
    card: {
      type: Object,
      default: null,
    },
    modes: {
      type: Array,
      required: true,
    },
    autoOff: {
      type: Boolean,
      default: false,
    },
  },

  emits: [
    'sound-mode-changed'
  ],

  data() {
    return {
      options: util.options,
      providers,
    };
  },

  computed:{
    soundMode() {
      // If the global sound mode is valid for this instance, use it.
      if (this.modes.includes(util.options.soundMode)) {
        if(ENABLE_DEBUG_LOGGING)console.log("soundMode() called with mode:", util.options.soundMode);
        return util.options.soundMode;
      }
      // Otherwise, fall back to the first available mode.
      const fallbackMode = this.modes.length > 0 ? this.modes[0] : util.SOUND_MODE.OFF;
      if(ENABLE_DEBUG_LOGGING)console.log("soundMode() called with mode:", fallbackMode, this.modes);
      return fallbackMode;
    },
    soundIcon(){
      return this.getSoundIcon(this.soundMode);
    },
    soundOff() {
      return this.soundMode === util.SOUND_MODE.OFF;
    },
    soundModes() {
      const labels = {
        [util.SOUND_MODE.OFF]: 'Off',
        [util.SOUND_MODE.FRONT_WORD]: 'Word',
        [util.SOUND_MODE.CONTEXT_ONLY]: 'Context',
        [util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT]: 'Word +\ncontext',
      };
      return this.modes.map(value => ({ value, title: labels[value] }));
    }
  },

  watch: {
    card: {
      handler(newCard) {
        this.set_new(newCard);
      },
      immediate: true,
      deep: true,
    },
  },
  methods: {
    getSoundIconColor(mode) {
      return mode === util.SOUND_MODE.OFF ? 'grey-darken-1' : 'success';
    },
    getSoundIcon(mode) {
      switch (mode) {
        case util.SOUND_MODE.FRONT_WORD:
          return 'mdi-volume-low';
        case util.SOUND_MODE.CONTEXT_ONLY:
          return 'mdi-volume-medium';
        case util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
          return 'mdi-volume-high';
        default:
          return 'mdi-volume-off';
      }
    },
    set_new(newCard, { force = false } = {}){
      if (newCard) {
        const newSoundMode = this.soundMode;
        if(ENABLE_DEBUG_LOGGING)console.log("set_new()1 called with mode:", newSoundMode, force );
        const playbackKey = `${newCard.id ?? ''}::${newSoundMode}::${util.options.ttsProvider || ''}::${util.options.ttsSpeed}`;

        if (!force) {
          const cachedKey = playbackCache.get(newCard);
          if (cachedKey && cachedKey === playbackKey) {
            if(ENABLE_DEBUG_LOGGING)console.log("set_new() early return via cache");
            return;
          }
        }

        //Cannot use this.lastPlaybackKey = playbackKey;
        playbackCache.set(newCard, playbackKey);

        if(ENABLE_DEBUG_LOGGING)console.log("set_new()2 called with mode:", newSoundMode);
        util.playSound(newCard, newSoundMode);
        if(this.autoOff) 
          setTimeout(() => {
             // Automatically turn off sound mode after playing
          util.options.soundMode = util.SOUND_MODE.OFF;
        }, 2000);
      }
    },

    async changeTtsSettings(settings) {
      try {
        await util.save_options(settings);
      } catch (error) {
        console.error('Failed to persist TTS preference:', error);
      }

      this.set_new(this.card, { force: true });
    },

    async changeSoundMode(newMode) {
      if (!this.modes.includes(newMode)) return;

      if(ENABLE_DEBUG_LOGGING)console.log("changeSoundMode called with mode:", newMode);

      // Update and save the global setting
      util.options.soundMode = newMode;

      this.set_new(this.card, { force: true });
      this.$emit('sound-mode-changed');
    },

    // Unused placeholder; retained for reference.
    // replay() {
    //   // TODO: Implement replay logic if needed
    // },
  },
};
</script>

<style scoped>
.replay-sound-wrapper {
  position: relative;
  display: inline-flex;
}

.tts-options {
  display: flex;
}

.tts-options .v-btn {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 0.375rem;
  text-transform: none;
}

</style>
