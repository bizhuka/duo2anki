export const duolingoCourses = [
    {
        "code": "ES",
        "language": "Spanish",
        "voices": [
            "Spanish Female",
            "Spanish Male",
            "Spanish Latin American Female",
            "Spanish Latin American Male"
        ]
    },
    {
        "code": "FR",
        "language": "French",
        "voices": [
            "French Female",
            "French Male",
            "French Canadian Female",
            "French Canadian Male"
        ]
    },
    {
        "code": "DE",
        "language": "German",
        "voices": [
            "Deutsch Female",
            "Deutsch Male"
        ]
    },
    {
        "code": "IT",
        "language": "Italian",
        "voices": [
            "Italian Female",
            "Italian Male"
        ]
    },
    {
        "code": "PT",
        "language": "Portuguese",
        "voices": [
            "Brazilian Portuguese Female",
            "Brazilian Portuguese Male",
            "Portuguese Female",
            "Portuguese Male"
        ]
    },
    {
        "code": "JA",
        "language": "Japanese",
        "voices": [
            "Japanese Female",
            "Japanese Male"
        ]
    },
    {
        "code": "KO",
        "language": "Korean",
        "voices": [
            "Korean Female",
            "Korean Male"
        ]
    },
    {
        "code": "ZH",
        "language": "Chinese (Mandarin)",
        "voices": [
            "Chinese Female",
            "Chinese Male",
            "Chinese (Hong Kong) Female",
            "Chinese (Hong Kong) Male",
            "Chinese Taiwan Female",
            "Chinese Taiwan Male"
        ]
    },
    {
        "code": "RU",
        "language": "Russian",
        "voices": [
            "Russian Female",
            "Russian Male"
        ]
    },
    {
        "code": "AR",
        "language": "Arabic",
        "voices": [
            "Arabic Male",
            "Arabic Female"
        ]
    },
    {
        "code": "NL",
        "language": "Dutch",
        "voices": [
            "Dutch Female",
            "Dutch Male"
        ]
    },
    {
        "code": "SV",
        "language": "Swedish",
        "voices": [
            "Swedish Female",
            "Swedish Male"
        ]
    },
    {
        "code": "GA",
        "language": "Irish (Gaelic)",
        "voices": []
    },
    {
        "code": "TR",
        "language": "Turkish",
        "voices": [
            "Turkish Female",
            "Turkish Male"
        ]
    },
    {
        "code": "NO",
        "language": "Norwegian (Bokmål)",
        "voices": [
            "Norwegian Female",
            "Norwegian Male"
        ]
    },
    {
        "code": "DA",
        "language": "Danish",
        "voices": [
            "Danish Female",
            "Danish Male"
        ]
    },
    {
        "code": "PL",
        "language": "Polish",
        "voices": [
            "Polish Female",
            "Polish Male"
        ]
    },
    {
        "code": "HI",
        "language": "Hindi",
        "voices": [
            "Hindi Female",
            "Hindi Male",
            "Tamil Female",
            "Tamil Male"
        ]
    },
    {
        "code": "EL",
        "language": "Greek",
        "voices": [
            "Greek Female",
            "Greek Male"
        ]
    },
    {
        "code": "CS",
        "language": "Czech",
        "voices": [
            "Czech Female",
            "Czech Male"
        ]
    },
    {
        "code": "HE",
        "language": "Hebrew",
        "voices": []
    },
    {
        "code": "VI",
        "language": "Vietnamese",
        "voices": [
            "Vietnamese Female",
            "Vietnamese Male"
        ]
    },
    {
        "code": "CY",
        "language": "Welsh",
        "voices": [
            "Welsh Male"
        ]
    },
    {
        "code": "UA",
        "language": "Ukrainian",
        "voices": [
            "Ukrainian Female"
        ]
    },
    {
        "code": "HU",
        "language": "Hungarian",
        "voices": [
            "Hungarian Female",
            "Hungarian Male"
        ]
    },
    {
        "code": "RO",
        "language": "Romanian",
        "voices": [
            "Romanian Female"
        ]
    },
    {
        "code": "SW",
        "language": "Swahili",
        "voices": [
            "Swahili Male"
        ]
    },
    {
        "code": "ID",
        "language": "Indonesian",
        "voices": [
            "Indonesian Female",
            "Indonesian Male"
        ]
    },
    {
        "code": "FI",
        "language": "Finnish",
        "voices": [
            "Finnish Female",
            "Finnish Male"
        ]
    },
    {
        "code": "NV",
        "language": "Navajo",
        "voices": []
    },
    {
        "code": "YI",
        "language": "Yiddish",
        "voices": []
    },
    {
        "code": "GD",
        "language": "Scottish Gaelic",
        "voices": []
    },
    {
        "code": "EO",
        "language": "Esperanto",
        "voices": [
            "Esperanto Male"
        ]
    },
    {
        "code": "TLH",
        "language": "Klingon",
        "voices": []
    },
    {
        "code": "HV",
        "language": "High Valyrian",
        "voices": []
    },
    {
        "code": "HT",
        "language": "Haitian Creole",
        "voices": []
    },
    {
        "code": "ZU",
        "language": "Zulu",
        "voices": []
    }
];

export function getDuolingoCourseLanguage(lang_id) {
    const course = duolingoCourses.find(course => course.code === lang_id);
    return course ? course.language : null;
}

// No separate languageFlags export needed

// Import language files (Sorted Alphabetically)
import arTranslations from './ar.js'; // Arabic
import deTranslations from './de.js'; // German
import enTranslations from './en.js'; // English
import esTranslations from './es.js'; // Spanish
import frTranslations from './fr.js'; // French
import hiTranslations from './hi.js'; // Hindi
import itTranslations from './it.js'; // Italian
import jaTranslations from './ja.js'; // Japanese
import kkTranslations from './kk.js'; // Kazakh
import koTranslations from './ko.js'; // Korean
import ptTranslations from './pt.js'; // Portuguese
import ruTranslations from './ru.js'; // Russian
import trTranslations from './tr.js'; // Turkish
import uaTranslations from './ua.js'; // Ukrainian
import zhTranslations from './zh.js'; // Chinese

export const pluginsTranslations = {
    AR: { flag: '/images/flags/sa.png', native: 'العربية', translations: arTranslations }, // Saudi Arabia
    DE: { flag: '/images/flags/de.png', native: 'Deutsch', translations: deTranslations }, // Germany
    EN: { flag: '/images/flags/us.png', native: 'English', translations: enTranslations }, // USA
    ES: { flag: '/images/flags/es.png', native: 'Español', translations: esTranslations }, // Spain
    FR: { flag: '/images/flags/fr.png', native: 'Français', translations: frTranslations }, // France
    HI: { flag: '/images/flags/in.png', native: 'हिन्दी', translations: hiTranslations }, // India
    IT: { flag: '/images/flags/it.png', native: 'Italiano', translations: itTranslations }, // Italy
    JA: { flag: '/images/flags/jp.png', native: '日本語', translations: jaTranslations }, // Japan
    KK: { flag: '/images/flags/kz.png', native: 'Қазақша', translations: kkTranslations }, // Kazakhstan
    KO: { flag: '/images/flags/kr.png', native: '한국어', translations: koTranslations }, // South Korea
    PT: { flag: '/images/flags/br.png', native: 'Português', translations: ptTranslations }, // Brazil
    RU: { flag: '/images/flags/ru.png', native: 'Русский', translations: ruTranslations }, // Russia
    TR: { flag: '/images/flags/tr.png', native: 'Türkçe', translations: trTranslations }, // Turkey
    UA: { flag: '/images/flags/ua.png', native: 'Українська', translations: uaTranslations }, // Ukraine
    ZH: { flag: '/images/flags/cn.png', native: '中文', translations: zhTranslations }, // China
};
export function get_translated_text(text, language, args = []){
  const translation = pluginsTranslations[language]?.translations?.[text] || '!!! ' + text; // Access nested translations object

  // Replace placeholders with arguments if provided
  if (args && args.length > 0) {
    return translation.replace(/{(\d+)}/g, (match, index) => {
      const argIndex = parseInt(index, 10);
      return argIndex < args.length ? args[argIndex] : match;
    });
  }
  
  return translation;
}