<template>
  <v-expansion-panels class="mt-4" :data-lang="optionsData.pluginLanguage">
    <v-expansion-panel>
      <v-expansion-panel-title :data-lang="optionsData.pluginLanguage">
        {{ util.getText('Anki Configuration Guide') }}
      </v-expansion-panel-title>
      <v-expansion-panel-text>
        <v-carousel
          height="auto"
          hide-delimiters
          show-arrows="hover"
          class="mt-2"
        >
          <!-- Slide 1: Fields Setup -->
          <v-carousel-item>
            <v-card flat class="pa-3 fill-height d-flex flex-column">
              <v-card-title class="text-subtitle-1">{{ util.getText('Step 1: Note Type Fields') }}</v-card-title>
              <v-card-text class="flex-grow-1">
                <p class="mb-2">{{ util.getText('In Anki, navigate to:') }} <strong>{{ util.getText('Tools > Manage Note Types... > Add') }}</strong></p>
                <v-img src="/images/cards_manage.png" max-width="550" class="my-2 mx-auto"></v-img>
                
              </v-card-text>
            </v-card>
          </v-carousel-item>

          <!-- Slide 2: Cards Intro -->
          <v-carousel-item>
            <v-card flat class="pa-3 fill-height d-flex flex-column">
               <v-card-title class="text-subtitle-1">{{ util.getText('Step 2: Card Templates') }}</v-card-title>
               <v-card-text class="flex-grow-1">
                <p class="mb-2">{{ util.getText('ankiGuide_step1Desc') }}</p>
                <v-img src="/images/fields.png" :alt="util.getText('Anki Manage Note Types window showing fields')" max-width="550" class="my-2 mx-auto"></v-img>
                <ol>
                  <li>Front</li>
                  <li>Back</li>
                  <li>Image</li>
                  <li>{{ util.getText('Transcription (optional)') }}</li>
                  <li>Context</li>
                  <li>Sound</li>
                </ol>              
               </v-card-text>
            </v-card>
          </v-carousel-item>

          <!-- Slide 3: Front Template -->
          <v-carousel-item>
            <v-card flat class="pa-3 fill-height d-flex flex-column">
              <v-card-title class="text-subtitle-1">{{ util.getText('Step 3: Front Template') }}</v-card-title>
              <v-card-text class="flex-grow-1">
                <p v-html="util.getText('ankiGuide_step2Desc')"></p>
                 <p class="mt-3">{{ util.getText('ankiGuide_step2Desc2') }}</p>   
                <br/><br/>
                
                <v-img src="/images/cards_front.png" :alt="util.getText('Anki Card Template Front')" max-width="550" class="my-2 mx-auto"></v-img>
                <p class="mt-2 mb-1">{{ util.getText('Paste this into the \'Front template\' box:') }}</p>
                <pre v-pre><code class="language-html">
&lt;div&gt;{{Front}}&lt;/div&gt;
&lt;div class=&quot;transcription&quot;&gt;{{Transcription}}&lt;/div&gt;
[sound:{{Sound}}]
                </code></pre>
              </v-card-text>
            </v-card>
          </v-carousel-item>

          <!-- Slide 4: Back Template -->
          <v-carousel-item>
            <v-card flat class="pa-3 fill-height d-flex flex-column">
              <v-card-title class="text-subtitle-1">{{ util.getText('Step 4: Back Template') }}</v-card-title>
              <v-card-text class="flex-grow-1">
                <v-img src="/images/cards_back.png" :alt="util.getText('Anki Card Template Back')" max-width="550" class="my-2 mx-auto"></v-img>
                 <p class="mt-2 mb-1">{{ util.getText('Paste this into the \'Back template\' box:') }}</p>
                <pre v-pre><code class="language-html">
&lt;div&gt;{{FrontSide}}&lt;/div&gt;
&lt;hr id=answer&gt;
&lt;div&gt;{{Back}}&lt;/div&gt;
&lt;div&gt;&lt;img src=&quot;{{Image}}&quot;&gt;&lt;/div&gt;
&lt;div class=&quot;context&quot;&gt;{{Context}}&lt;/div&gt;
                </code></pre>
              </v-card-text>
            </v-card>
          </v-carousel-item>

          <!-- Slide 5: Styling -->
          <v-carousel-item>
            <v-card flat class="pa-3 fill-height d-flex flex-column">
              <v-card-title class="text-subtitle-1">{{ util.getText('Step 5: Styling') }}</v-card-title>
              <v-card-text class="flex-grow-1">
                <v-img src="/images/cards_style.png" :alt="util.getText('Anki Card Template Styling')" max-width="550" class="my-2 mx-auto"></v-img>
                <p class="mt-2 mb-1">{{ util.getText('ankiGuide_step5Desc') }}</p>
                <pre><code class="language-css">.card {
 font-family: arial;
 font-size: 16pt;
 text-align: center;
 color: black;
 background-color: white;
}

.transcription {
 font-size: 12pt;
}

.context {
 font-style: italic;
 font-size: 12pt;
}</code></pre>
              </v-card-text>
            </v-card>
          </v-carousel-item>
        </v-carousel>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup>
import { util } from '@/lib/util'; // Import util

// Define props
const props = defineProps({
  optionsData: {
    type: Object,
    required: true
  }
});
</script>

<script>
export default {
  data() {
    return {
      // Define any data properties if needed
    };
  },
};
</script>

<style scoped>
/* Add any component-specific styles here if needed */
pre {
  background-color: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto; /* Handle long lines */
}
code {
  font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
  font-size: 0.9em;
}
.language-html, .language-css {
  display: block; /* Ensure block display for proper formatting */
  white-space: pre; /* Preserve whitespace */
}
</style>