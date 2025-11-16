<template>
  <div class="replay-sound-wrapper">
    <v-tooltip location="top" :text="card.front" :open-delay="1000">
      <template #activator="{ props }">
        <v-icon
          v-bind="props"
          color="success"
          size="large"
          @click="changeSoundMode"
        >{{ soundIcon }}</v-icon>
      </template>
    </v-tooltip>

    <v-tooltip
      v-if="showProviderToggle"
      location="top"
      :text="ttsProviderTooltip"
      :open-delay="400"
    >
      <template #activator="{ props }">
        <v-btn
          v-bind="props"
          class="tts-provider-toggle"
          variant="plain"
          size="x-small"
          density="compact"
          rounded="sm"
          @click.stop="toggleTtsProvider"
        >{{ providerShortLabel }}</v-btn>
      </template>
    </v-tooltip>
  </div>
</template>

<script>
import { util } from '../../lib/util.js';
import { ENABLE_DEBUG_LOGGING } from '../../lib/debugConfig.js';

const playbackCache = new WeakMap();

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
      switch (this.soundMode) {
        case util.SOUND_MODE.OFF:
          return 'mdi-volume-off';
        case util.SOUND_MODE.FRONT_WORD:
          return 'mdi-volume-low';
        case util.SOUND_MODE.CONTEXT_ONLY:
          return 'mdi-volume-medium';
        case util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
          return 'mdi-volume-high';
        default:
          return 'mdi-volume-off'; // Default icon
      }
    },
    showProviderToggle() {
      return this.soundMode !== util.SOUND_MODE.OFF;
    },
    providerShortLabel() {
      switch (util.options.ttsProvider) {
        case util.TTS_PROVIDER.RESPONSIVE_VOICE:
        case util.TTS_PROVIDER.GOOGLE:
        case util.TTS_PROVIDER.AZURE_MICROSOFT:
          return util.options.ttsProvider.charAt(0);          
      }
      return '?';
    },
    ttsProviderTooltip() {
      switch (util.options.ttsProvider) {
        case util.TTS_PROVIDER.RESPONSIVE_VOICE:
        case util.TTS_PROVIDER.GOOGLE:
        case util.TTS_PROVIDER.AZURE_MICROSOFT:
          return util.options.ttsProvider;         
      }
      return '?';
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
    set_new(newCard, { force = false } = {}){
      if (newCard) {
        const newSoundMode = this.soundMode;
        if(ENABLE_DEBUG_LOGGING)console.log("set_new()1 called with mode:", newSoundMode, force );
        const playbackKey = `${newCard.id ?? ''}::${newSoundMode}::${util.options.ttsProvider || ''}`;

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

    async toggleTtsProvider() {
      const providers = [
        util.TTS_PROVIDER.RESPONSIVE_VOICE,
        util.TTS_PROVIDER.GOOGLE,
        util.TTS_PROVIDER.AZURE_MICROSOFT,
      ];
      const current = util.options.ttsProvider ?? util.TTS_PROVIDER.RESPONSIVE_VOICE;
      const nextProvider = providers[(providers.indexOf(current) + 1) % providers.length];
      util.options.ttsProvider = nextProvider;

      try {
        await util.save_options({ ttsProvider: nextProvider });
      } catch (error) {
        console.error('Failed to persist TTS provider preference:', error);
      }

      this.set_new(this.card, { force: true });
    },

    async changeSoundMode() {
      if (!this.modes.length) return;

      const currentIndex = this.modes.indexOf(this.soundMode);
      // Cycle to the next mode in the allowed list
      const nextIndex = (currentIndex + 1) % this.modes.length;
      const newMode = this.modes[nextIndex];

      if(ENABLE_DEBUG_LOGGING)console.log("changeSoundMode called with mode:", newMode);

      // Update and save the global setting
      util.options.soundMode = newMode;

      this.set_new(this.card, { force: true });
      this.$emit('sound-mode-changed');
    },

    replay() {
      // TODO: Implement replay logic if needed
    },
  },
};
</script>

<style scoped>
.replay-sound-wrapper {
  position: relative;
  display: inline-flex;
}

.tts-provider-toggle {
  position: absolute;
  bottom: -0.1rem;
  right: -0.05rem;
  width: 0.65rem;
  height: 0.65rem;
  min-width: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.45rem;
  line-height: 1;
  background-color: rgba(33, 33, 33, 0.35);
  color: #fff;
  border-radius: 2px;
  transition: background-color 100ms ease;
}

.tts-provider-toggle:hover {
  background-color: rgba(33, 33, 33, 0.6);
}
</style>