import { normalizeAzureLanguage } from './ai.js';
import { duolingoCourses } from './i18n/translation.js';
import { util } from './util.js';

export function translationLanguage(language) {
    if (!language) return '';
    const code = normalizeAzureLanguage(language).split('-')[0];
    return ({ ua: 'uk', no: 'nb' })[code] || code;
}

export const translationLanguages = duolingoCourses.map(course => ({
    title: course.language,
    value: translationLanguage(course.code),
}));

export function translationLanguageName(language) {
    return translationLanguages.find(item => item.value === translationLanguage(language))?.title || '';
}

function mostCommonLanguage(words) {
    const counts = new Map();
    for (const word of words) {
        const language = translationLanguage(word.targetLang);
        if (language) counts.set(language, (counts.get(language) || 0) + 1);
    }
    return [...counts].sort((first, second) => second[1] - first[1])[0]?.[0] || '';
}

export function wordLanguage(word) {
    return translationLanguage(word.targetLang || util.get_course_info(word.course_id).targetLang);
}

export function inferTranslationSource(courseId, words) {
    const activeWords = words.filter(word => word.course_id === courseId && !word.archived && word.front?.trim());
    return translationLanguage(util.get_course_info(courseId).targetLang) ||
        mostCommonLanguage(activeWords.filter(word => word.hasTranslation !== true)) ||
        mostCommonLanguage(activeWords);
}