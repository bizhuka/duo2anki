import htmlFormatter from 'js-beautify/js/lib/beautify-html.js';
import cssFormatter from 'js-beautify/js/lib/beautify-css.js';
import { util } from './util.js';
import { escapeAnkiHtml } from './ankiTemplates.js';
import { normalizeLanguageCode } from './i18n/translation.js';

const SPECIAL_FIELDS = ['FrontSide', 'Tags', 'Type', 'Deck', 'Subdeck', 'CardFlag', 'Card'];
const AUDIO_ICON = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3"/><path d="M26 20 L44 32 L26 44 Z" fill="currentColor"/></svg>';

export function formatAnkiCode(source, section) {
  const options = { indent_size: 2, wrap_line_length: 0, extra_liners: [], indent_handlebars: true };
  return section === 'css' ? cssFormatter.css_beautify(source, options) : htmlFormatter.html_beautify(source, options);
}

// A small parser for field replacements and nested conditional sections. Field
// values are inserted only after parsing, so HTML/text containing braces stays intact.
function parseTemplate(source, fieldNames) {
  const root = { children: [] };
  const stack = [root];
  const allowed = new Set([...fieldNames, ...SPECIAL_FIELDS]);
  const addText = text => {
    if (text.includes('{{') || text.includes('}}')) throw new Error(util.getText('anki_templateIncomplete'));
    stack.at(-1).children.push({ text });
  };
  let offset = 0;
  for (const match of source.matchAll(/{{([^{}]+)}}/g)) {
    const parent = stack.at(-1);
    addText(source.slice(offset, match.index));
    const expression = match[1].trim();
    const prefix = expression[0];
    const field = (['#', '^', '/'].includes(prefix) ? expression.slice(1) : expression).split(':').at(-1).trim();
    if (!allowed.has(field)) throw new Error(util.getText('anki_templateUnknownField', [field]));
    if (prefix === '/') {
      if (stack.length === 1 || parent.field !== field) throw new Error(util.getText('anki_templateUnbalanced', [field]));
      stack.pop();
    } else if (prefix === '#' || prefix === '^') {
      const node = { field, inverted: prefix === '^', children: [] };
      parent.children.push(node);
      stack.push(node);
    } else {
      parent.children.push({ field, expression });
    }
    offset = match.index + match[0].length;
  }
  addText(source.slice(offset));
  if (stack.length !== 1) throw new Error(util.getText('anki_templateUnbalanced', [stack.at(-1).field]));
  return root.children;
}

export function validateAnkiTemplate(template, fieldNames) {
  for (const section of ['qfmt', 'afmt']) parseTemplate(template[section], fieldNames);
}

function renderNodes(nodes, fields) {
  return nodes.map(node => {
    if ('text' in node) return node.text;
    const value = fields[node.field] || '';
    if (node.children) return (util.hasText(value) !== node.inverted) ? renderNodes(node.children, fields) : '';
    if (node.expression.startsWith('text:')) return escapeAnkiHtml(util.unescape_html(util.delete_all_tags(value)));
    if (node.expression.startsWith('tts ')) {
      const [language, ...options] = node.expression.slice(4, node.expression.lastIndexOf(':')).split(/\s+/);
      return `[anki:tts lang=${language} ${options.join(' ')}]${value}[/anki:tts]`;
    }
    if (node.expression.startsWith('hint:')) return value ? `<details><summary>${util.getText('Hint')}</summary>${value}</details>` : '';
    return value;
  }).join('');
}

function renderAudio(source) {
  return source.replace(/\[anki:tts\b([^\]]*)\]([\s\S]*?)\[\/anki:tts\]/g, (block, attributes, content) => {
    const text = util.unescape_html(util.delete_all_tags(content.replace(/<br\s*\/?>|<\/(?:p|div|li)\s*>/gi, ' ')))
      .replace(/\s+/g, ' ').trim();
    const language = attributes.match(/\blang=([^\s\]]+)/)?.[1];
    const speed = Number(attributes.match(/\bspeed=([^\s\]]+)/)?.[1] ?? 1);
    if (!text || !language) return '';
    const item = { front: text, targetLang: normalizeLanguageCode(language), speed: speed > 0 && Number.isFinite(speed) ? speed : 1 };
    const label = util.getText('Play audio');
    return `<button type="button" class="replay-button" data-anki-audio="${encodeURIComponent(JSON.stringify(item))}" title="${label}" aria-label="${label}">${AUDIO_ICON}</button>`;
  }).replace(/\[sound:[^\]]*\]/g, `<span class="replay-button">${AUDIO_ICON}</span>`);
}

export function getAnkiPreviewDocument(template, fields, side) {
  const front = renderAudio(renderNodes(parseTemplate(template.qfmt, Object.keys(fields)), { ...fields, FrontSide: '' }));
  const content = side === 'front' ? front : renderAudio(renderNodes(
    parseTemplate(template.afmt, Object.keys(fields)), { ...fields, FrontSide: front }));
  const css = template.css.replace(/<\/style/gi, '<\\/style');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline';">
    <style>body { margin: 16px; overflow-wrap: anywhere; } img { max-width: 100%; }
      .replay-button { display: inline-block; vertical-align: middle; border: 0; padding: 0; background: transparent; color: inherit; cursor: pointer; }
      .replay-button svg { width: 40px; height: 40px; }</style>
    <style>${css}</style></head><body class="card card1">${content}</body></html>`;
}
