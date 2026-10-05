# Export Duolingo Words to ANKI

## Overview
<!-- Legacy overview retained for reference:
This project is a **Chrome extension** that extracts vocabulary from Duolingo and exports it to **Anki** via AnkiConnect. The extension consists of a **side panel** providing the user interface and features.
-->
This project is a **Chrome extension** that extracts vocabulary from Duolingo and exports **Anki `.apkg` files** for import into Anki. The extension consists of a **side panel** providing the user interface and features.

## Reader Imports
The Reader Import tab accepts both databases in the same drop area and detects their format automatically:
- Kindle: `Kindle/system/vocabulary/vocab.db`
- KOReader: `Storage/koreader/settings/vocabulary_builder.sqlite3`

Each reader has a separate course. Imports populate Front, Context (with the looked-up form in bold), and Hint/Transcription (book title). Reimporting the same file skips duplicate contexts. KOReader databases have no language metadata; select the source language in the translation or context dialog.

## Google Images Autofill
Open a word's image search, then invoke the extension's toolbar button or Alt+D while the Google Images tab is active. This grants temporary access through `activeTab`, without adding Google host permissions. With the edit dialog open, the first loaded result fills and saves an empty image field, including during subsequent same-origin searches from word navigation. Existing images are never overwritten.

The current base64 image source is retained when available. Canvas conversion is attempted for remote thumbnails; if cross-origin restrictions prevent conversion, the image URL is saved instead. After closing the search tab or leaving its origin, invoke the extension again on Google Images to grant access.

## Anki Card Types and Reimports
Choose Direct, Reverse, or Listening before exporting. Each mode uses the same vocabulary list but produces its own deck and note type, with one card per word:
- Direct (Recognition): word and word audio on the question; translation, context, and context-only audio on the answer.
- Reverse: the first two translation alternatives on the question, with no audio; word, full translation, context, and combined word/context audio on the answer.
- Listening: combined word/context audio only on the question (autoplay); word, translation, context, and the question's replay button on the answer (no second autoplay).

Direct retains the original deck name, first six field positions, and deck/model IDs, and appends ContextSound and TtsLanguage. Reverse and Listening retain ReversePrompt and CombinedSound in their existing positions and append TtsLanguage. They add ` - Reverse` or ` - Listening` to the deck and note-type names, use distinct fixed ID offsets, and start new. Reverse requires a nonempty translation; Listening requires a valid word language for audio. Learning progress can be exported only in Direct mode.

All three `exportWith...` filters have checkboxes in the Anki tab and default to true: context, translations, and images. The translations filter requires both `hasTranslation === true` and a nonempty trimmed Back field. Enabled filters apply together to both Duolingo and reader courses. Uncheck any requirements you do not need; saved checkbox choices are retained.

### Built-in Anki TTS
Exports store speech text from `util.get_sound_text`, rather than audio URLs or MP3 files. Browser playback still uses `get_sound_url` and the selected provider, with Responsive Voice as the default. Azure Microsoft TTS is commented out; a saved Azure provider choice falls back to Responsive Voice when options are loaded. Other saved provider choices are retained. The `collection_media` setting and checkbox have been removed; the old `exportSound` function remains commented out in `Anki.vue` for reference.

- Sound: Direct's FRONT_WORD question text.
- ContextSound: Direct's CONTEXT_ONLY answer text, stored separately from the displayed Context.
- CombinedSound: FRONT_WORD_WITH_CONTEXT text used on Reverse's answer and Listening's question.
- ReversePrompt: the first two distinct translation alternatives, displayed on Reverse's question without sound.

Speech text uses the same selection as browser playback: the trimmed Front word, context before the first `→` with HTML tags removed, or both joined with `. `. Empty text and OFF produce no sound.

Templates use Anki's native TTS block syntax, for example:
```
{{#TtsLanguage}}{{#Sound}}[anki:tts lang={{TtsLanguage}}]{{Sound}}[/anki:tts]{{/Sound}}{{/TtsLanguage}}
```
TtsLanguage comes from each word's target language. Explicit regions are retained; bare language codes are expanded to a default locale (for example, `en` to `en_US`). This supports mixed-language reader imports without fixing the entire note type to one language. A word without a valid language remains silent in Direct/Reverse and is excluded from Listening.

This block syntax requires **Anki 2.1.50+, AnkiMobile 2.0.84+, or AnkiDroid 2.17+**. Install a suitable voice on each reviewing device; Linux needs an add-on supplying voices. To inspect installed voices, temporarily add `{{tts-voices:}}` to a template. For a fixed-language note type, the equivalent single-field syntax is `{{tts en_US:Sound}}`; voices and speed can be specified in the template if desired. See the [Anki TTS manual](https://docs.ankiweb.net/templates/fields.html#text-to-speech-for-multiple-fields-and-static-text).

Keep Anki's “Don't play audio automatically” disabled for question autoplay. Listening's answer uses `{{FrontSide}}` to retain the question replay button without queuing audio again; click it to replay. This provides replay-only behavior, rather than pausing an active utterance. The replay hotkey also depends on the deck's “Skip question when replaying answer” setting. See [Anki's audio options](https://docs.ankiweb.net/deck-options.html#audio).

New exports identify notes by mode, course, and Front word, not by editable translations, images, or context. Re-exporting the same words in the same mode retains their GUIDs, while each strategy remains independent. GUIDs use a 64-bit SHA-256 digest encoded in Anki's base91 format; the earlier experimental helper used faulty arithmetic and could produce collisions. Changing the mode, course, or Front word creates a different note identity.

After downloading the `.apkg`, use Anki's File > Import. The extension also shows these recommendations after export:
- Import any learning progress: Off for repeat imports; On for an initial import only when exported learning progress is desired.
- Import any deck presets: Off.
- Merge note types: On if Anki needs to reconcile a changed schema. Schema merging may require a one-way sync.
- Update notes: Always. This replaces field edits made in Anki with the exported values.
- Update note types: Always.

Back up your collection before migrating older exports. Their GUIDs depended on all fields, so the first import from this version can create duplicate notes. Merge note types does not merge different note GUIDs. Review duplicates and their learning history before removing any; subsequent exports from the same mode use stable identities. If you imported the earlier combined three-card export, review its extra Reverse/Listening templates in the Direct note type: importing does not reliably remove them, and deleting templates deletes their cards and learning history.

## Tech Stack 🚀
- 🖥️ **Framework:** Vue 3 (`src/App.vue`, `src/sidepanel.js`)
- 🎨 **UI Library:** Vuetify (`src/plugins/vuetify.js`)
- 🗄️ **Database:** Dexie.js (wrapping IndexedDB) (`src/lib/database.js`)
<!-- - 🔌 **Anki Integration:** AnkiConnect (`src/lib/ankiTool.js`) -->
- 🔌 **Anki Integration:** `.apkg` generation (`src/components/Anki.vue`, `src/lib/genanki.js`)
- 💾 **Storage:** IndexedDB via Dexie
- 🌍 **Internationalization (i18n):** Supported via `src/lib/i18n/`

## Browser Permissions 🔒
The extension uses the following minimal set of permissions:
- `scripting`: For injecting scripts into Duolingo pages
- `tabs`: For accessing and managing tabs
- `activeTab`: For accessing the current tab's content
- `storage`: For saving user preferences and settings
- `sidePanel`: For the extension's side panel functionality
- `webRequest`: For monitoring URL changes in Duolingo

## Project Structure 📂
<!-- Legacy tree entry: │   ├── ankiTool.js     # AnkiConnect API interaction logic -->
```
src/
├── App.vue             # Main Vue application component (Side Panel UI)
├── background.js       # Extension background script (event handling, Duolingo interaction)
├── sidepanel.js        # Entry point for the Vue side panel application
├── assets/             # Static assets (CSS)
│   └── sidepanel.css
├── components/         # Vue UI components
│   ├── Anki.vue        # Component for Anki settings and export
│   ├── ContextDialog.vue # Dialog for viewing/editing word context
│   ├── EditDialog.vue  # Dialog for editing word details
│   ├── WordsTab.vue    # Component for displaying and managing words
│   └── small/          # Smaller, reusable UI components (Buttons, Dialogs, etc.)
├── lib/                # Core logic and utilities
│   ├── genanki.js      # Anki .apkg generation
│   ├── database.js     # Dexie.js database setup and operations
│   ├── duolingo_loader.js # Logic for extracting vocabulary from Duolingo pages
│   ├── util.js         # General utility functions and options management
│   └── i18n/           # Internationalization files and translation logic
├── plugins/            # Vue plugins configuration
│   ├── index.js        # Plugin registration
│   ├── README.md       # Plugin specific readme
│   └── vuetify.js      # Vuetify framework setup
└── ... (other configuration files)
```

## Core Features ✨

### 1. **Extract Duolingo Vocabulary** 📚
- 🔍 Initiated from the side panel, executed by `background.js` using `src/lib/duolingo_loader.js`.
- 🎯 Targets Duolingo's **practice hub** (`https://www.duolingo.com/practice-hub/words`).
- 📝 Extracts words, translations, and potentially other metadata (handled by `duolingo_loader.js`).
- 💾 Stores extracted words in IndexedDB via `src/lib/database.js`.
- 🆔 Automatically detects and saves the current Duolingo course ID (`background.js`).

### 2. **Data Storage Structure (Dexie)** 🗃️
- (`src/lib/database.js`)
- 📂 **Course Table:** Stores language pair information.
- 🏷️ **Words Table:**
  - 📝 `word` (Front card)
  - 🌍 `translation` (Back card)
  - 🔊 `sound` (TTS URL - *Note: TTS fetching logic location TBC*)
  - ✏️ `context` (Sentence/context - editable via `ContextDialog.vue`)
  - 🖼️ `image` (URL - *Note: Image fetching logic location TBC*)

### 3. **Side Panel UI (`App.vue`)** 📊
- **Tabbed Interface:**
    - **Words Tab (`WordsTab.vue`):**
        - 📑 Table View (`v-data-table`) for word list.
        - 📜 Paginated display.
        - ✏️ Inline editing/actions (delete, update via `EditDialog.vue`, context via `ContextDialog.vue`).
        - 🔄 Refresh word list from DB.
    - **Anki Tab (`Anki.vue`):**
        <!-- Legacy AnkiConnect UI description retained for reference:
        - ⚙️ AnkiConnect configuration (deck, model, fields).
        - 🔄 Export selected/all words to Anki using `ankiTool.js`.
        - 📖 Basic setup guide (`AnkiSetupGuide.vue`).
        - 🚨 Error handling for AnkiConnect connection issues.
        -->
        - ⚙️ Direct, Reverse, and Listening export modes and word filters.
        - 🔄 Download an `.apkg` file with built-in Anki TTS templates.
        - 📖 Import settings guide shown after export.
    - **Hotkeys Tab (`HotkeysInfo.vue`):**
        - ⌨️ Displays available keyboard shortcuts.
- **General UI:**
    - 🌐 Language selection (`LanguageSelector.vue`).
    - 🌙🌞 Dark/Light Mode toggle.
    - ℹ️ Info/Error messages (`InfoAlert.vue`).

### 4. **Background Script (`background.js`)** 🖥️
- 📩 Handles messages between different parts of the extension.
- 🚀 Initiates vocabulary extraction (`extract_vocabulary`).
- 🆔 Detects Duolingo course changes via web requests.
- ⌨️ Manages side panel opening/closing via command/icon click.

<!-- Legacy AnkiConnect description retained for reference:
### 5. **Anki Export (`Anki.vue`, `lib/ankiTool.js`)** 🔄
- 🔌 Uses **AnkiConnect** API (`http://localhost:8765`) via `ankiTool.js`.
- ⚙️ Configurable deck name, note type, and field mappings.
- ✅ Checks AnkiConnect availability.
-->
### 5. **Anki Export (`Anki.vue`, `lib/genanki.js`)** 🔄
- Generates `.apkg` files locally using SQL.js and JSZip.
- Exports the selected mode with stable note identities and native Anki TTS.
- Direct mode can include learning progress.
- Import the downloaded file using Anki's File > Import; no AnkiConnect connection is needed.

## Notes 📝
- 🏗️ Background script (`background.js`) handles core data fetching and course detection.
- 📦 Vue components (`src/components/`) manage UI interactions and presentation.
- 💾 IndexedDB (`src/lib/database.js`) ensures data persistence.
- 🌍 Internationalization supported (`src/lib/i18n/`).

---

### Privacy Policy
This extension does not collect, store, or share any user data
