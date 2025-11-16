const LOCAL_EXTENSION_ID = "poafjilkhgdgdilghljbpdepnimbldam";
export const DEFAULT_AZURE_LANGUAGE = "en";

function getApiHost(isLocal) {
  return isLocal ? "http://localhost:3000" : "https://duo2anki.fly.dev";
}

export function isLocalExtension() {
  try {
    return typeof chrome !== "undefined" && chrome.runtime?.id === LOCAL_EXTENSION_ID;
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
