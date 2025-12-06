<template>
  <div
    @dragover.prevent="methods.handleDragOver"
    @drop.prevent="methods.handleDrop"
    @dragenter.prevent="methods.handleDragEnter"
    @dragleave.prevent="methods.handleDragLeave"
    class="my-2 text-center"
    :style="dropZoneStyle"
    :data-lang="optionsData.pluginLanguage"
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
      {{ util.getText('Drop image here (URL or file)') }}
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
  
  emits: ['update:image', 'save'],

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
      handleDragOver(event) {
        event.preventDefault(); // Necessary to allow dropping
      },

      handleDrop(event) {
        event.preventDefault();
        isDragOverValid.value = false; // Reset highlight state

        // Try to get URL first (from dragged link or image)
        const urlData = event.dataTransfer.getData('text/uri-list');

        // If a valid URL is found
        if (util.isValidImageSource(urlData)) {
          emit('update:image', urlData);
          emit('save');
          return; // Exit after handling URL
        }

        // If no valid URL, try files
        if (event.dataTransfer.files.length > 0) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
              if (e.target?.result) {
                emit('update:image', e.target.result);
                emit('save'); // Emit save event after file is read and image updated
              }
            };
            reader.readAsDataURL(file);
            return; // Exit early as FileReader is async
          }
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