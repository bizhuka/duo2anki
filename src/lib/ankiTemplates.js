import { util } from './util.js';
import { normalizeLanguageCode } from './i18n/translation.js';

export const EXPORT_MODES = {
  direct: { key: 'direct', label: 'Direct', suffix: '', idOffset: 0, fields: ['Sound', 'ContextSound'], required: [0] },
  reverse: { key: 'reverse', label: 'Reverse', suffix: ' - Reverse', idOffset: 10000000, fields: ['CombinedSound'], required: [0, 6] },
  listening: { key: 'listening', label: 'Listening', suffix: ' - Listening', idOffset: 20000000, fields: ['CombinedSound'], required: [0, 7] },
};

export function getAnkiFieldNames(mode) {
  return ['Front', 'Back', 'Sound', 'Image', 'Context', 'Transcription'].concat(
    mode === 'direct' ? ['ContextSound'] : ['ReversePrompt', 'CombinedSound'], ['Hint']);
}

export function getTtsLanguage(targetLang) {
  if (!targetLang?.trim()) return '';
  try {
    const locale = new Intl.Locale(normalizeLanguageCode(targetLang)).maximize();
    return [locale.language, locale.region].filter(Boolean).join('_');
  } catch {
    return '';
  }
}

export function getAnkiTtsSettings(options) {
  return {
    language: getTtsLanguage(util.get_course_info(options.current_course_id).targetLang),
    speed: options.ttsSpeed ?? 1,
  };
}

export function getDefaultAnkiTemplate(mode, options) {
  const { language, speed } = getAnkiTtsSettings(options);
  const question = '<div>{{Front}}</div>{{#Transcription}}<div class="transcription">{{Transcription}}</div>{{/Transcription}}';
  const hint = '{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}';
  const preloadImage = '{{#Image}}<img src="{{Image}}" loading="eager" style="display:none" alt="">{{/Image}}';
  const answer = (audio = '', hintContent = '') => `${question}${hintContent}<hr id=answer><div>{{Back}}</div>{{#Image}}<div><img src="{{Image}}"></div>{{/Image}}${audio}<div class="context">{{Context}}</div>`;
  const audio = field => language ? `{{#${field}}}[anki:tts lang=${language} speed=${speed}]{{${field}}}[/anki:tts]{{/${field}}}` : '';
  const templates = {
    direct: { name: util.getText('mainTemplate'), qfmt: `${question}${hint}${audio('Sound')}${preloadImage}`,
      afmt: answer(audio('ContextSound'), hint) },
    reverse: { name: util.getText('Reverse'), qfmt: `{{#ReversePrompt}}<div>{{ReversePrompt}}</div>{{/ReversePrompt}}${hint}${preloadImage}`,
      afmt: answer(audio('CombinedSound'), hint) },
    listening: { name: util.getText('Listening'), qfmt: `${audio('CombinedSound')}${hint}${preloadImage}`,
      // FrontSide retains the question replay button without queuing answer audio.
      afmt: `{{FrontSide}}${answer()}` },
  };
  return {
    ...templates[mode],
    css: `.card { font-family: arial; font-size: 1.5rem; text-align: center; color: black; background-color: white; }
            .hint { font-size: 1rem; opacity: 0.7; margin: 0.5rem 0; overflow-wrap: anywhere; }`,
  };
}

export function hasSameAnkiFields(savedFields, currentFields) {
  const sortedFields = [...currentFields].sort();
  return Array.isArray(savedFields) && savedFields.length === currentFields.length &&
    [...savedFields].sort().every((field, index) => field === sortedFields[index]);
}

// Keep the application's original voice/speed dynamic, while retaining values
// the user explicitly changed in an audio tag.
function updateTemplateTts(source, previous, current) {
  if (!previous) return source;
  return source.replace(/\[anki:tts\b([^\]]*)\]([\s\S]*?)\[\/anki:tts\]/g, (block, attributes, text) => {
    let missingLanguage = false;
    const updated = attributes.replace(/\b(lang|speed)=([^\s\]]+)/g, (attribute, key, value) => {
      const setting = key === 'lang' ? 'language' : 'speed';
      if (value !== String(previous[setting])) return attribute;
      if (setting === 'language' && !current.language) missingLanguage = true;
      return `${key}=${current[setting]}`;
    });
    return missingLanguage ? '' : `[anki:tts${updated}]${text}[/anki:tts]`;
  });
}

export function getAnkiTemplate(mode, options) {
  const defaults = getDefaultAnkiTemplate(mode, options);
  const saved = options.ankiTemplates?.[mode];
  if (!saved || !hasSameAnkiFields(saved.fieldNames, getAnkiFieldNames(mode)) ||
    !['qfmt', 'afmt', 'css'].every(section => typeof saved[section] === 'string')) return defaults;
  const tts = getAnkiTtsSettings(options);
  return { name: defaults.name, qfmt: updateTemplateTts(saved.qfmt, saved.tts, tts),
    afmt: updateTemplateTts(saved.afmt, saved.tts, tts), css: saved.css };
}

export function escapeAnkiHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function getAnkiNoteFields(item, mode) {
  const fields = {
    Front: item.front, Back: item.back || '', Image: item.image || '', Context: item.context || '',
    Transcription: item.transcription || '', Hint: item.hint || '',
    ReversePrompt: escapeAnkiHtml(util.getTranslationAlternatives(item.back).slice(0, 2).join('; ')),
  };
  const audioModes = { Sound: util.SOUND_MODE.FRONT_WORD, ContextSound: util.SOUND_MODE.CONTEXT_ONLY,
    CombinedSound: util.SOUND_MODE.FRONT_WORD_WITH_CONTEXT };
  for (const field of EXPORT_MODES[mode].fields) {
    fields[field] = escapeAnkiHtml(util.get_sound_text(item, audioModes[field]) || '');
  }
  return getAnkiFieldNames(mode).map(field => fields[field] || '');
}
