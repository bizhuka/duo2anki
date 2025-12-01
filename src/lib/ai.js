export const ENABLE_DEBUG_LOGGING = false;
export const DEFAULT_AZURE_LANGUAGE = "en";

function getApiHost(isLocal) {
  return isLocal ? "http://localhost:3000" : "https://duo2anki.fly.dev";
}

export function isLocalExtension() {
  try {    
    extension_id = chrome?.runtime?.id || "";
    return extension_id !== "ilcpcjkfnmgmjknmoclnlelkcaiibnkf" &&
           extension_id !== "lbmmipgdkklfhencdebpjjnpenifehle";
  } catch (error) {
    return false;
  }
}

export function getTranslateUrl(isLocal = isLocalExtension()) {
  return `${getApiHost(isLocal)}/translate`;
}

export function buildTtsUrl(language, text, isLocal = isLocalExtension()) {
  const host = getApiHost(isLocal);
  return `${host}/tts?language=${language}&text=${encodeURIComponent(text)}`;
}

export function normalizeAzureLanguage(targetLang) {
  const raw = (targetLang || "").trim();
  if (!raw) {
    return DEFAULT_AZURE_LANGUAGE;
  }

  const normalized = raw.replace(/_/g, "-").toLowerCase();
  const [language, region] = normalized.split("-");

  if (!language) {
    return DEFAULT_AZURE_LANGUAGE;
  }

  return region ? `${language}-${region}` : language;
}

export async function process_with_gpt4mini(wordsToProcess, optionsData) {
  const translateUrl = getTranslateUrl(isLocalExtension());

  async function call_api(prompt) {
    const response = await fetch(translateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || `API call failed with status: ${response.status}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    return await response.json();
  }

  const prompt_prefix = optionsData.prompt_prefix.trim();
  if (!prompt_prefix) return null;

  const formattedWords = wordsToProcess
    .map(word => `${word.id} - ${word.front}`)
    .join('\n');

  const fullContextText = `${prompt_prefix}\n\n${formattedWords}`;

  const apiResult = await call_api(fullContextText);

  return apiResult && apiResult.results ? apiResult.results : null;
}
