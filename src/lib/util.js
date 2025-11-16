import { get_translated_text, getDuolingoCourseLanguage } from "./i18n/translation.js";
import { reactive } from "vue";
import { buildTtsUrl, normalizeAzureLanguage } from "./ai_api.js";
import { ENABLE_DEBUG_LOGGING } from "./debugConfig.js";

export const util = {
  options: reactive({
    lightTheme: true,
    current_course_id: null,
    pluginLanguage: "EN",

    // Context
    ai_model: 'chatgpt',
    prompt_prefix: "",
    request_count: 1,
    words_per_request: 10,
    add_2_back: true,
    ttsProvider: "Responsive Voice",

    // Image Search
    imageSearchTabId: null, // Store the ID of the image search tab

    // Anki export options
    exportWithContextOnly: true,
    includeScheduleInformation: true,
    collection_media: false,

    // Game Notification
    gameNotificationInterval: 0, // in minutes. 0 means 'off'.
  }),

  audioPlayer: null,

  CONFIRM_RESULT: {
    YES: "yes",
    NO: "no",
    STOP: "stop",
  },

  WORD_IS_NEW: 9007199254740777,

  SOUND_MODE: {
    OFF: 10,
    FRONT_WORD: 20,
    CONTEXT_ONLY: 30,
    FRONT_WORD_WITH_CONTEXT: 40,
  },

  AI_MODEL: {
    CHATGPT: 'chatgpt',
    GROK: 'grok',
    GPT4MINI: 'gpt-4.1-mini',
  },

  TTS_PROVIDER: {
    RESPONSIVE_VOICE: 'Responsive Voice',
    GOOGLE: 'Google',
    AZURE_MICROSOFT: 'Azure Microsoft',
  },

  getCurrentCourse() {
    const course_id = this.options.current_course_id;
    return course_id ? getDuolingoCourseLanguage(this.get_course_info(course_id).lang_id) : '';
  },

  delete_all_linebreaks: function (text) {
    if (!text) return "";
    return text.replace(/<\/?p>|<br\/?>/g, "").trim();
  },

  delete_all_tags: function (text) {
    if (!text) return "";
    // Or   /<[^>]*>/g  ?
    return text.replace(/<\/?[^>]+(>|$)/g, "").trim();
  },

  get_sound_url: function (item) {
    if (!item) {
      return null;
    }

    const wholeText = this.get_speak_text(item);
    if (!wholeText || !item.targetLang) {
      return null;
    }

    switch (this.options.ttsProvider) {
      case this.TTS_PROVIDER.RESPONSIVE_VOICE:
        return `https://texttospeech.responsivevoice.org/v1/text:synthesize?text=${encodeURIComponent(wholeText)}&lang=${ item.targetLang }&engine=g3&name=&pitch=0.5&rate=0.5&volume=1&key=StO3dWAU&gender=female`
      
      case this.TTS_PROVIDER.GOOGLE:
        return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${item.targetLang}&q=${encodeURIComponent(wholeText)}`;

      case this.TTS_PROVIDER.AZURE_MICROSOFT:
        const languageCode = normalizeAzureLanguage(item.targetLang);
        return buildTtsUrl(languageCode, wholeText);
    }
    new Error("Unsupported TTS Provider", this.options.ttsProvider);
  },

  get_speak_text: function (item) {
    const firstPart = this.delete_all_tags(item.context?.split("→")[0]);
    return item.front + (firstPart ? `. ` + firstPart : "");
  },

  playSound: function (item, mode = util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT) {
    if(ENABLE_DEBUG_LOGGING)console.log("playSound called with mode:", mode);
    
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
    }

    let word = {};
    switch (mode) {
        case this.SOUND_MODE.FRONT_WORD:
          word = { front: item.front, targetLang: item.targetLang };
          break;
        case this.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
          word = item;
          break;
        case this.SOUND_MODE.CONTEXT_ONLY:
          word = { front: '', context: item.context, targetLang: item.targetLang };
          break;
        default: // case this.SOUND_MODE.OFF:
          return null;
    }

    if (!word) {
      return null;
    }

    const audioUrl = this.get_sound_url(word);
    if (!audioUrl) {
      return null;
    }

    try {
      this.audioPlayer = new Audio(audioUrl);
      if(ENABLE_DEBUG_LOGGING)console.log("!!!!!!!!!!!Playing audio:", word);
      
      // Rely on browser audio playback via selected TTS provider
      this.audioPlayer.play().catch((error) => {
        console.error('Error playing audio:', error);
      });
      return this.audioPlayer;
    } catch (error) {
      console.error('Failed to create audio element:', error);
      this.audioPlayer = null;
    }

    return null;
  },

  get_course_info: function (course_id) {
    const delimiter = course_id.includes("-") ? "-" : "_";
    const [targetLang, sourceLang] = course_id.split(delimiter);
    const lang_id = targetLang.split("_")[0]?.toUpperCase();

    return { targetLang, sourceLang, lang_id };
  },

  async open_side_panel(params) {
    // Get the active tab without using await
    chrome.tabs.query(params, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  },

  getText(text, args = []) {
    return get_translated_text(text, this.options.pluginLanguage, args);
  },

  async read_options() {
    try {
      const opt = await chrome.storage.local.get("options");
      this._set_options(opt.options || {});
    } catch (e) {
      console.error(util.getText("Error loading options from localStorage:"), e);
    }
  },

  async save_options(opt) {
    this._set_options(opt);
    await chrome.storage.local.set({ options: this.options });
  },

  async _set_options(options) {
    for (let key in options) {
      if (this.options.hasOwnProperty(key)) {
        if (Array.isArray(this.options[key])) {
          this.options[key] = [...options[key]];
          continue;
        }
        this.options[key] = options[key];
      }
    }
  },

  async callMethod(context, message, sendResponse) {
    // Handle the async call and sendResponse
    try {
      // Ensure we keep the message channel open for async responses
      if (!message.action || typeof context[message.action] !== "function")
        throw new Error(`Invalid action specified: ${message.action}`);

      const result = await context[message.action](
        ...(message.action_params || [])
      );
      if (sendResponse) {
        sendResponse({ data: result });
      }
    } catch (error) {
      console.error(`Error in callMethod for action ${message.action}:`, error);
      if (sendResponse) {
        sendResponse({ error: error.message });
      }
      return false;
    }
    return true;
  },

  // Helper to open/update the image search tab
  async openImageSearchTab(word, addParam = '') {
    if (!word) return; // Don't proceed if no word is provided

    const query = encodeURIComponent(word);
    const searchUrl = `https://www.google.com/search?tbm=isch&q=${query}${addParam}`;
    try {
      // Attempt to update the existing tab if it exists
      if (this.options.imageSearchTabId) {
        await chrome.tabs.update(this.options.imageSearchTabId, { url: searchUrl, active: true });
      } else {
        throw new Error(util.getText("No tab ID stored, create a new one.")); // Jump to catch block to create
      }
    } catch (error) {
      try {
        const newTab = await chrome.tabs.create({ url: searchUrl, active: true });
        this.options.imageSearchTabId = newTab.id; // Store the new tab ID in util.options
        this.save_options({ imageSearchTabId: newTab.id }); // Save the new tab ID to options
      } catch (creationError) {
        console.error(`Failed to create new tab: ${creationError.message}`);
        this.options.imageSearchTabId = null;
        // As a fallback, use old method to open a new tab
        window.open(searchUrl, '_blank');
      }
    }
  },
};
