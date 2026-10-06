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

Every import opens an inline book-language panel at the bottom of the tab. Kindle defaults come from `BOOK_INFO.lang`; KOReader books require language selection. Use Skip book to exclude an entire book, or edit its title to shorten the hint for new words. Skipped books do not require a language. All pending data stays in JavaScript memory until at least one book is included, every included book has a valid language, and Import is pressed. Cancel saves nothing.

Courses are grouped by language and reader, for example `fr_kindle`, `en_kindle`, and `fr_koreader`. Identical words merge only within the same course. New entries contain Front, Context (with the looked-up form in bold), and a separate Hint field containing the edited book names. Transcription is reserved for pronunciation and starts empty. Book IDs and language assignments are not retained. Reimports merge **Context** and replace **Hint** with the current imported book names; existing transcription, translations, images, language fields, and review progress remain unchanged. Identical contexts are not duplicated. Previously imported book names stored in Transcription are not automatically moved or cleared.

`targetLang` is the fixed book/word language (`FROM_LANGUAGE`); `sourceLang` records the destination of a successful translation (`TO_LANGUAGE`). The generation dialog locks From to the course language while To remains editable. Reader imports require only the book language, not a translation destination. Database version 2 and its indexes are unchanged; word plus course is the logical unique key enforced by the importer.

Readers and Duolingo use the same generation dialog. Reader requests include words missing a marked translation, context, or enabled transcription. `replace_context_for_reader` defaults to false: existing book examples and their HTML are preserved while translations/transcriptions are generated. Enable Overwrite existing context to replace book examples, including already completed words. Missing reader contexts are always filled; Duolingo generation always replaces the selected words' contexts. The retired Azure button, dialog component, and API implementations have been removed.

ChatGPT and Grok responses are imported only after the expected rows contain five nonempty fields, the first and last IDs match, and the final translated sentence ends with punctuation. The response must remain unchanged for two seconds with no active generation indicator. This prevents the last arrow from triggering an import while its translation is still streaming; the existing two-minute timeout remains in place.

## Google Images Autofill
Open a word's image search, then invoke the extension's toolbar button or Alt+D while the Google Images tab is active. This grants temporary access through `activeTab`, without adding Google host permissions. With the edit dialog open, the first loaded result fills and saves an empty image field, including during subsequent same-origin searches from word navigation. Existing images are never overwritten.

The current base64 image source is retained when available. Canvas conversion is attempted for remote thumbnails; if cross-origin restrictions prevent conversion, the image URL is saved instead. After closing the search tab or leaving its origin, invoke the extension again on Google Images to grant access.

## Anki Card Types and Reimports
Choose Direct, Reverse, or Listening before exporting. Each mode uses the same vocabulary list but produces its own deck and note type, with one card per word:
- Direct (Recognition): word, transcription, book-name hint, and word audio on the question; translation, context, and context-only audio on the answer.
- Reverse: the first two translation alternatives and book-name hint on the question, with no audio or transcription; Front followed by Transcription, hint, full translation, context, and combined word/context audio on the answer.
- Listening: combined word/context audio first (autoplay), followed by the book-name hint on the question; word, transcription, translation, context, and the question's replay button/hint on the answer (no second autoplay).

All modes append a separate Hint field. The obsolete TtsLanguage field is no longer exported: the locale is written directly into the audio templates. Note GUIDs and deck/model identities remain stable, but the field layout changes. Back up before reimporting and use Update note types: Always for the revised templates. Hint is editable in the word editor; Transcription is a read-only HTML preview beside Front. Generated pronunciation updates only Transcription.

For existing Duolingo courses, Direct retains the original deck name, first six field positions, and deck/model IDs, and appends ContextSound and Hint. Reverse and Listening retain ReversePrompt and CombinedSound in their existing positions, followed by Hint. They add ` - Reverse` or ` - Listening` to the deck and note-type names, use distinct fixed ID offsets, and start new. New language-specific reader courses have separate reader/language/mode deck names, note types, and stable hashed deck/model IDs. Their GUIDs include the full course ID, so Kindle and KOReader notes do not merge. Reverse requires a nonempty translation; Listening requires a valid course language for audio. Learning progress can be exported only in Direct mode.

Context and image export filters have checkboxes and default to true. Translations are mandatory in every mode and course: `hasTranslation === true` and meaningful nonempty Back text are required. The translation checkbox is permanently checked/disabled with an explanatory hint; the old `exportWithTranslationsOnly` option is removed and old saved false values cannot bypass the requirement. Export is disabled when no eligible words remain. Context and image requirements can still be unchecked; saved choices are retained.

### Built-in Anki TTS
Exports store speech text from `util.get_sound_text`, rather than audio URLs or MP3 files. Browser playback still uses `get_sound_url` and the selected provider, with Responsive Voice as the default. Retired Azure TTS and legacy media-export implementations have been removed. Unsupported saved provider choices fall back to Responsive Voice when options are loaded. Other saved provider choices are retained.

- Sound: Direct's FRONT_WORD question text.
- ContextSound: Direct's CONTEXT_ONLY answer text, stored separately from the displayed Context.
- CombinedSound: FRONT_WORD_WITH_CONTEXT text used on Reverse's answer and Listening's question.
- ReversePrompt: the first two distinct translation alternatives, displayed on Reverse's question without sound.

Speech text uses the same selection as browser playback: the trimmed Front word, context before the first `→` with HTML tags removed, or both joined with `. `. Empty text and OFF produce no sound.

Templates use Anki's native TTS block syntax, for example:
```
{{#Sound}}[anki:tts lang=fr_FR speed=1]{{Sound}}[/anki:tts]{{/Sound}}
```
The inline locale is shared by the note type and comes only from the selected `course_id`: `fr_en` and `fr_kindle` use `fr_FR`, while `en_koreader` uses `en_US`. Individual word languages and regional variants do not override the course voice. A course with no valid locale remains silent in Direct/Reverse and cannot produce a Listening export. The locale precedes the saved speech speed in every relevant question/answer TTS block.

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
