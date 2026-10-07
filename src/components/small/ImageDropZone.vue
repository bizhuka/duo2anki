<template>
  <div
    @click="methods.findImage"
    @keydown.enter.prevent="methods.findImage"
    @keydown.space.prevent="methods.findImage"
    @dragover.prevent="methods.handleDragOver"
    @drop.prevent="methods.handleDrop"
    @dragenter.prevent="methods.handleDragEnter"
    @dragleave.prevent="methods.handleDragLeave"
    class="my-2 text-center"
    :role="!image ? 'button' : undefined"
    :tabindex="!image ? 0 : undefined"
    :aria-label="!image ? util.getText('Find Image (F4)') : undefined"
    :style="dropZoneStyle"
  >
    <!-- Image Display -->
    <v-img
      v-if="image"
      :src="image"
      height="100%"
      max-height="100%"
      contain
      style="border-radius: 4px; display: block; object-fit: contain;"
    ></v-img>
    <div v-else style="text-align: center; color: #616161;"> <!-- Added text color -->
      <div>{{ util.getText('Drop image here (URL or file)') }}</div>
      <div class="text-body-2 mt-2">{{ util.getText('image_emptyHint') }}</div>
      <div class="text-body-2 mt-2" style="white-space: pre-line;">{{ util.getText('image_autoFillHint') }}</div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import { useTheme } from 'vuetify'; // Import useTheme
import { util } from '@/lib/util'; // Import util

export default {
  props: {
    image: {
      type: String,
      default: null,
    },
    optionsData: { // Added prop
      type: Object,
      required: true
    }
  },
  
  emits: ['update:image', 'save', 'find-image', 'image-too-large'],

  setup(props, { emit }) {
    const theme = useTheme(); // Use theme
    const isDragOverValid = ref(false);

    const dropZoneStyle = computed(() => {
      let bgColor;
      let borderColor;

      if (isDragOverValid.value) {
        // Highlight colors when dragging a valid item over
        bgColor = '#e8f5e9'; // Light green background
        borderColor = '#4caf50'; // Green border
      } else if (!props.image) {
        // Default colors when empty and not dragging over
        bgColor = '#f0f0f0'; // Fixed light gray background
        borderColor = '#bdbdbd'; // Visible gray border
      } else {
        // Style when image is present and not dragging over
        bgColor = 'transparent';
        borderColor = '#bdbdbd'; // Keep border visible even with image
      }

      return {
        border: `2px dashed ${borderColor}`,
        borderRadius: '4px',
        backgroundColor: bgColor,
        cursor: 'pointer',
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
        padding: props.image ? '0' : '1rem',
        minHeight: '7rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
      };
    });

    const methods = {
      setImage(source) {
        if (util.isImageTooLarge(source)) {
          emit('image-too-large');
          return;
        }
        emit('update:image', source);
        emit('save');
      },

      findImage() {
        if (!props.image) emit('find-image');
      },

      handleDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping
      },

      handleDrop(event) {
        event.preventDefault();
        isDragOverValid.value = false; // Reset highlight state

        const html = event.dataTransfer.getData('text/html');
        const imageElement = html
          ? new DOMParser().parseFromString(html, 'text/html').querySelector('img')
          : null;
        const imageSource = imageElement?.getAttribute('src');
        const imageLink = imageElement?.closest('a[href]')?.getAttribute('href');
        const urlSources = ['text/uri-list', 'text/plain']
          .flatMap(type => event.dataTransfer.getData(type).split(/\r?\n/))
          .map(source => source.trim()).filter(source => source && !source.startsWith('#'));
        const originalSources = [imageLink, ...urlSources].map(source => {
          try {
            return new URL(source).searchParams.get('imgurl');
          } catch {
            return null;
          }
        });
        const url = [...originalSources, imageSource, ...urlSources.filter(source => source !== imageLink)]
          .find(source => /^https?:\/\//i.test(source || '') && util.isValidImageSource(source));
        if (url) {
          methods.setImage(url);
          return;
        }

        if (event.dataTransfer.files.length > 0) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target?.result) {
                methods.setImage(e.target.result);
              }
            };
            reader.readAsDataURL(file);
            return; // Exit early as FileReader is async
          }
        }

        const source = [imageSource, ...urlSources].find(candidate => util.isValidImageSource(candidate));
        if (source) {
          methods.setImage(source);
        }
      },

      handleDragEnter(event) {
        event.preventDefault();
        // Check if files or links are being dragged
        const types = event.dataTransfer?.types;
        if (types && (types.includes('Files') || types.includes('text/uri-list'))) {
          isDragOverValid.value = true;
        }
      },

      handleDragLeave(event) {
        event.preventDefault();
        // Check if the relatedTarget (where the mouse is going) is outside the drop zone
        // This prevents flickering when moving over child elements like the v-img
        if (!event.currentTarget.contains(event.relatedTarget)) {
          isDragOverValid.value = false;
        }
      }
    };

    return {
      // Data
      isDragOverValid, // Needed for :class binding

      // Computed
      dropZoneStyle,
      image: computed(() => props.image), // Expose image for :class binding

      // Methods (exposed for template binding)
      methods,
      util, // Expose util to the template
    };
  }
}
</script>

<style scoped>
/* Scoped styles can be added here if needed */
/* .image-drop-container {} */ /* Example */
</style>