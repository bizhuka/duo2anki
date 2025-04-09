# Export Duolingo Words to ANKI

## Overview
This project is a **Chrome extension** that extracts vocabulary from Duolingo and exports it to **Anki** via AnkiConnect. The extension consists of a **side panel** providing the user interface and features.

## Tech Stack 🚀
- 🖥️ **Framework:** Vue 3 (`src/App.vue`, `src/sidepanel.js`)
- 🎨 **UI Library:** Vuetify (`src/plugins/vuetify.js`)
- 🗄️ **Database:** Dexie.js (wrapping IndexedDB) (`src/lib/database.js`)
- 🔌 **Anki Integration:** AnkiConnect (`src/lib/ankiTool.js`)
- 💾 **Storage:** IndexedDB via Dexie
- 🌍 **Internationalization (i18n):** Supported via `src/lib/i18n/`

## Project Structure 📂
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
│   ├── ankiTool.js     # AnkiConnect API interaction logic
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
        - ⚙️ AnkiConnect configuration (deck, model, fields).
        - 🔄 Export selected/all words to Anki using `ankiTool.js`.
        - 📖 Basic setup guide (`AnkiSetupGuide.vue`).
        - 🚨 Error handling for AnkiConnect connection issues.
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

### 5. **Anki Export (`Anki.vue`, `lib/ankiTool.js`)** 🔄
- 🔌 Uses **AnkiConnect** API (`http://localhost:8765`) via `ankiTool.js`.
- ⚙️ Configurable deck name, note type, and field mappings.
- ✅ Checks AnkiConnect availability.

## Notes 📝
- 🏗️ Background script (`background.js`) handles core data fetching and course detection.
- 📦 Vue components (`src/components/`) manage UI interactions and presentation.
- 💾 IndexedDB (`src/lib/database.js`) ensures data persistence.
- 🌍 Internationalization supported (`src/lib/i18n/`).

---

### Privacy Policy
This extension does not collect, store, or share any user data
