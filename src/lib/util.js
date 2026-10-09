import { get_translated_text, getDuolingoCourseLanguage } from "./i18n/translation.js";
import { reactive } from "vue";
import { ENABLE_DEBUG_LOGGING } from "./ai.js";

export const util = {
  options: reactive({
    lightTheme: true,
    current_course_id: null,
    // Context
    ai_model: 'chatgpt',
    prompt_prefix: "",
    include_transcription: false,
    replace_context_for_reader: false,
    transcription_prompt: "",
    request_count: 1,
    words_per_request: 10,
    add_2_back: true,
    translation_to: 'en',
    ttsProvider: "Responsive Voice",
    ttsSpeed: 1,

    // Image Search
    imageSearchTabId: null, // Store the ID of the image search tab

    // Anki export options
    ankiExportMode: 'direct',
    ankiTemplates: {},
    exportWithContextOnly: true,
    exportWithImagesOnly: true,

    // Game Notification
    gameNotificationInterval: 0, // in minutes. 0 means 'off'.
  }),

  audioPlayer: null,

  readerCourses: {
    kindle: { name: 'Kindle', ankiIdOffset: 1000000 },
    koreader: { name: 'KOReader', ankiIdOffset: 2000000 },
  },

  getReaderCourseInfo(courseId) {
    const [targetLang, reader, extra] = (courseId || '').split('_');
    if (extra || !/^[a-z]{2,3}$/.test(targetLang) || !Object.hasOwn(this.readerCourses, reader)) return null;
    return { ...this.readerCourses[reader], reader, targetLang, lang_id: targetLang.toUpperCase() };
  },

  createReaderCourseId(reader, language) {
    if (!Object.hasOwn(this.readerCourses, reader) || !/^[a-z]{2,3}$/.test(language)) return '';
    return `${language}_${reader}`;
  },

  isReaderCourse(courseId) {
    return Object.hasOwn(this.readerCourses, courseId) || !!this.getReaderCourseInfo(courseId);
  },

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
    GROQ: 'oss_120b',
  },

  TTS_PROVIDER: {
    RESPONSIVE_VOICE: 'Responsive Voice',
    GOOGLE: 'Google',
  },

  getCurrentCourse() {
    return this.getCourseName(this.options.current_course_id);
  },

  getCourseName(course_id) {
    const reader = this.getReaderCourseInfo(course_id);
    if (reader) {
      return `${reader.name} - ${getDuolingoCourseLanguage(reader.targetLang) || reader.targetLang}`;
    }
    if (this.isReaderCourse(course_id)) return this.readerCourses[course_id].name;
    return course_id ? getDuolingoCourseLanguage(this.get_course_info(course_id).lang_id) || course_id : '';
  },

  delete_all_linebreaks: function (text) {
    if (!text) return "";
    return text.replace(/<\/?p>|<br\/?>/g, "").trim();
  },

  unescape_html: function (text) {
    if (typeof document !== 'undefined' && document.createElement) {
      const decoder = document.createElement('textarea');
      decoder.innerHTML = text;
      return decoder.value;
    }
    return text.
        replace(/&nbsp;|&#160;/gi, ' ')
        .replaceAll('&apos;', "'")
        .replaceAll('&quot;', '"')
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
  },

  normalizeTranscription(text) {
    return (text || '').replace(/\[[^\]\r\n]+\]/g, transcription => this.unescape_html(transcription)
      .replace(/<\/?(?:b|strong)(?:\s[^>]*)?>/gi, '**')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>'));
  },

  delete_all_tags: function (text) {
    if (!text) return "";
    // Or   /<[^>]*>/g  ?
    return text.replace(/<\/?[^>]+(>|$)/g, "").trim();
  },

  hasText(text) {
    return !!this.unescape_html(this.delete_all_tags(text)).trim();
  },

  mergeWithReturn(existingText, addition, deleteBrackets = false, separator = ' ⏎ ') {
    const trimmed_existingText = (existingText || '').trim();
    const trimmed_addition = (addition || '').trim();

    if (!trimmed_addition) {
      return trimmed_existingText;
    }
    if (!trimmed_existingText) {
      return trimmed_addition;
    }

    const big = trimmed_existingText.length > trimmed_addition.length ? trimmed_existingText : trimmed_addition;
    const small = trimmed_existingText.length > trimmed_addition.length ? trimmed_addition : trimmed_existingText;
    let _big = big.replace(/\s/g, '');
    let _small = small.replace(/\s/g, '');

    if (deleteBrackets) {
      _big = _big.replace(/^\[.*?\]/, '');
      _small = _small.replace(/^\[.*?\]/, '');
    }

    return _big.includes(_small) ? big : `${trimmed_existingText}${separator}${trimmed_addition}`;
  },

  mergeTranslationBack(existingText, translation, addToBack) {
    return addToBack ? this.mergeWithReturn(existingText, translation, false, ' → ') : translation;
  },

  getTranslationAlternatives(text) {
    const withLines = (text || '').replace(/<br\s*\/?>|<\/p\s*>|<\/div\s*>/gi, '\n');
    const plainText = this.unescape_html(this.delete_all_tags(withLines));
    return [...new Set(plainText.split(/[⏎,→;\r\n]+/)
      .map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean))];
  },

  get_sound_text: function (item, mode = util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT) {
    if (!item) {
      return null;
    }

    if (mode === this.SOUND_MODE.OFF) {
      return null;
    }

    const front = (item.front || "").trim();
    const cleanedContext = item.context
      ? this.delete_all_tags(item.context.split('→')[0] || "").trim()
      : "";

    let wholeText = "";
    switch (mode) {
      case this.SOUND_MODE.FRONT_WORD:
        wholeText = front;
        break;
      case this.SOUND_MODE.CONTEXT_ONLY:
        wholeText = cleanedContext;
        break;
      case this.SOUND_MODE.FRONT_WORD_WITH_CONTEXT:
      default:
        wholeText = front;
        if (cleanedContext) {
          wholeText = wholeText ? `${wholeText}. ${cleanedContext}` : cleanedContext;
        }
        break;
    }

    return wholeText || null;
  },

  get_sound_url: function (item, mode = util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT) {
    if (!item || !item.targetLang) {
      return null;
    }
    const wholeText = this.get_sound_text(item, mode);
    if (!wholeText) {
      return null;
    }

    switch (this.options.ttsProvider) {
      case this.TTS_PROVIDER.RESPONSIVE_VOICE:
        return `https://texttospeech.responsivevoice.org/v1/text:synthesize?text=${encodeURIComponent(wholeText)}&lang=${ item.targetLang }&engine=g3&name=&pitch=0.5&rate=0.5&volume=1&key=StO3dWAU&gender=female`
      
      case this.TTS_PROVIDER.GOOGLE:
        return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${item.targetLang}&q=${encodeURIComponent(wholeText)}`;

    }
    return null;
  },

  playSound: function (item, mode = util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT, { speed = this.options.ttsSpeed } = {}) {
    if(ENABLE_DEBUG_LOGGING)console.log("playSound called with mode:", mode);
    
    if (this.audioPlayer) {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
      this.audioPlayer = null;
    }

    const audioUrl = this.get_sound_url(item, mode);
    if (!audioUrl) {
      return null;
    }

    try {
      const player = new Audio(audioUrl);
      this.audioPlayer = player;
      player.playbackRate = speed;
      const playbackContext = `provider=${this.options.ttsProvider}, language=${item.targetLang}, speed=${speed}`;
      if(ENABLE_DEBUG_LOGGING)console.log("!!!!!!!!!!!Playing audio:", { item, mode });
      
      // Rely on browser audio playback via selected TTS provider
      player.play().catch((error) => {
        // Replacing/stopping a pending sound intentionally rejects its play promise.
        if (error.name === 'AbortError' && this.audioPlayer !== player) return;
        console.error(`Error playing audio: ${error.name}: ${error.message} (${playbackContext}, mediaError=${player.error?.code ?? 'none'})`);
      });
      return player;
    } catch (error) {
      console.error(`Failed to create audio element: ${error.name}: ${error.message}`);
      this.audioPlayer = null;
    }

    return null;
  },

  get_course_info: function (course_id) {
    const reader = this.getReaderCourseInfo(course_id);
    if (reader) return reader;
    if (!course_id || this.isReaderCourse(course_id)) return {};
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
    return get_translated_text(text, args);
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
        if (key === 'ttsProvider' && !Object.values(this.TTS_PROVIDER).includes(options[key])) {
          this.options[key] = this.TTS_PROVIDER.RESPONSIVE_VOICE;
          continue;
        }
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

  maxBase64ImageLength: 10 * 1000,

  getImageTooLargeMessage(key = 'image_base64TooLarge') {
    return this.getText(key, [this.maxBase64ImageLength / 1000]);
  },

  getBase64ImageSize(src) {
    return typeof src === 'string' && src.startsWith('data:image/') && src.includes(';base64,')
      ? src.length : 0;
  },

  isImageTooLarge(src) {
    return this.getBase64ImageSize(src) > this.maxBase64ImageLength;
  },

  // Validate image source URL or data URI
  isValidImageSource(src) {
    if (!src || typeof src !== 'string') return false;
    if (src.startsWith('data:image/')) return true;
    try {
      const url = new URL(src);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(src);
    }
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
