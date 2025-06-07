<template>
  <!-- Bind the computed style to set the CSS variable -->
  <div class="rich-text-editor-wrapper mb-2" :style="editorStyle" :data-lang="optionsData.pluginLanguage">
    <label v-if="label" class="v-label v-label--clickable">{{ label }}</label>
    <QuillEditor
      :content="modelValue"
      @update:content="handleUpdate"
      :options="editorOptions"
      contentType="html"
      theme="snow"
      :style="{ minHeight: props.minHeight }"
    />
  </div>
</template>

<script setup>
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import { computed } from 'vue';
import { useTheme } from 'vuetify'; // Import useTheme
import { util } from '@/lib/util'; // Import util

// Define props and emits for v-model compatibility
const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  label: {
    type: String,
    default: ''
  },
  minHeight: { // Add minHeight prop
    type: String,
    required: true,
  },
  handlers: { // Keep handlers prop
    type: Object,
    default: () => ({})
  },
  icons: { // Add icons prop
    type: Object,
    default: () => ({}) // Expects keys like customButton1Icon, customButton1Color
  },
  optionsData: { // Added prop
    type: Object,
    required: true
  },
  hideToolbar: { // New prop to control toolbar visibility
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);
const theme = useTheme(); // Get the theme object

// Computed property for the icon content CSS variable
// Generic computed property for the custom button icon content
const customButton1IconContent = computed(() => {
  // Use a generic key like 'customButton1Icon'
  return props.icons?.customButton1Icon; // e.g., '\\F0978'
});

// Computed property for the custom button icon color
const customButton1Color = computed(() => {
  const colorName = props.icons?.customButton1Color; // e.g., 'primary', 'success'
  if (colorName && theme.current.value.colors[colorName]) {
    // If it's a valid theme color name, resolve it to its CSS value
    return theme.current.value.colors[colorName]; // e.g., 'rgb(var(--v-theme-primary))' or hex/rgb value
  }
  // Otherwise, use the provided value directly (could be a CSS color like '#FF0000') or default to 'inherit'
  return colorName || 'inherit';
});

const editorStyle = computed(() => ({
  '--custom-button1-icon': `"${customButton1IconContent.value}"`,
  '--custom-button1-color': customButton1Color.value // Pass color value directly
}));


// Toolbar options with the new button and handler
const editorOptions = computed(() => {
  const modules = {
    toolbar: props.hideToolbar ? false : { // Conditionally hide or show toolbar
      container: [
        ['bold', 'italic', 'underline', 'clean'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        ['customButton1'] // props.hideToolbar Or hide this button?
      ],
      handlers: {
        // Use generic handler key 'customButton1Click'
        'customButton1': () => props.handlers?.customButton1Click?.()
      }
    }
  };

  return {
    matchVisual: false,
    modules: modules,
    placeholder: util.getText('Enter text...')
  };
});

// Function to emit update event
const handleUpdate = (content) => {
    const mergedContent = content.replace(/<\/p><p>/g, '')  // Yep delete this way. Not util.delete_all_linebreaks(content)
    emit('update:modelValue', mergedContent);
};
</script>

<style scoped>
/* Apply the CSS variable via style binding */
.rich-text-editor-wrapper {
  display: flex;
  flex-direction: column;
}

.rich-text-editor-wrapper .v-label {
  font-size: 0.875rem; /* Match Vuetify label size */
  color: rgba(0, 0, 0, 0.6); /* Match Vuetify label color */
  margin-bottom: 4px;
  display: block; /* Ensure label takes its own line */
}

/* Style adjustments for Quill inside Vuetify */
:deep(.ql-toolbar.ql-snow) {
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
  border-bottom: 0;
  padding: 8px;
}

:deep(.ql-container.ql-snow) {
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  /* min-height is now controlled by the prop via inline style */
  font-size: 1rem; /* Match default text field font size */
  line-height: 1.5;
}

:deep(.ql-editor) {
  padding: 10px 12px; /* Adjust padding to better match v-text-field */
  /* min-height is now controlled by the prop via inline style */
}

/* Adjust padding for single-line appearance */
:deep(.ql-editor[style*="min-height: 40px"]) {
  padding-top: 8px;
  padding-bottom: 8px;
}


:deep(.ql-editor.ql-blank::before) {
  font-style: normal; /* Prevent italic placeholder */
  left: 12px; /* Align placeholder with padding */
  right: 12px;
  color: rgba(0, 0, 0, 0.42); /* Match Vuetify placeholder color */
}

/* Style the generic custom button */
:deep(.ql-toolbar .ql-customButton1::before) {
  font-family: 'Material Design Icons'; /* Ensure MDI font is used */
  content: var(--custom-button1-icon); /* Use generic CSS variable for icon */
  color: var(--custom-button1-color); /* Use generic CSS variable for color */
  font-size: 18px; /* Adjust size as needed */
  line-height: 18px; /* Match button inner height (24px - 3px*2) */
  display: inline-block; /* Needed for proper rendering */
  width: 18px; /* Match button inner width (28px - 5px*2) */
  vertical-align: middle; /* Align icon vertically */
}

/* Optional: Adjust spacing if needed */
:deep(.ql-toolbar .ql-formats button) {
  margin-right: 4px; /* Add some space between buttons */
}
</style>