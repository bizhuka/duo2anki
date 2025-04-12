const duolingoCourses = [
    { code: "ES", language: "Spanish" },
    { code: "FR", language: "French" },
    { code: "DE", language: "German" },
    { code: "IT", language: "Italian" },
    { code: "PT", language: "Portuguese" },
    { code: "JA", language: "Japanese" },
    { code: "KO", language: "Korean" },
    { code: "ZH", language: "Chinese (Mandarin)" },
    { code: "RU", language: "Russian" },
    { code: "AR", language: "Arabic" },
    { code: "NL", language: "Dutch" },
    { code: "SV", language: "Swedish" },
    { code: "GA", language: "Irish (Gaelic)" },
    { code: "TR", language: "Turkish" },
    { code: "NO", language: "Norwegian (Bokmål)" },
    { code: "DA", language: "Danish" },
    { code: "PL", language: "Polish" },
    { code: "HI", language: "Hindi" },
    { code: "EL", language: "Greek" },
    { code: "CS", language: "Czech" },
    { code: "HE", language: "Hebrew" },
    { code: "VI", language: "Vietnamese" },
    { code: "CY", language: "Welsh" },
    { code: "UK", language: "Ukrainian" },
    { code: "HU", language: "Hungarian" },
    { code: "RO", language: "Romanian" },
    { code: "SW", language: "Swahili" },
    { code: "ID", language: "Indonesian" },
    { code: "FI", language: "Finnish" },
    { code: "NV", language: "Navajo" },
    { code: "YI", language: "Yiddish" },
    { code: "GD", language: "Scottish Gaelic" },
    { code: "EO", language: "Esperanto" },
    { code: "TLH", language: "Klingon" },
    { code: "HV", language: "High Valyrian" },
    { code: "HT", language: "Haitian Creole" },
    { code: "ZU", language: "Zulu" }
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