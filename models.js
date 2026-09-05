// Scelta automatica del modello Google.
// Google ritira i modelli vecchi per i nuovi account (gemini-2.5-flash lo è già),
// quindi non ne fissiamo uno: chiediamo alla chiave dell'utente cosa ha disponibile.

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Rete di sicurezza se la lista non è raggiungibile. Dal più recente al più vecchio.
export const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash-lite'
];

export function geminiUrl(model, key) {
  return `${BASE}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
}

// Un modello ritirato o inesistente: ha senso riprovare con un altro.
// Chiave sbagliata o quota esaurita: cambiare modello non risolverebbe nulla.
export function isModelProblem(status, message) {
  if (status === 404) return true;
  return status === 400 && /model|no longer available|not found|not supported|unsupported/i.test(message || '');
}

// Sovraccarico temporaneo dei server Google: si riprova, non è un errore dell'utente.
export function isOverload(status, message) {
  if (status === 503 || status === 500) return true;
  return /high demand|overload|unavailable|try again later/i.test(message || '');
}

// Limite di richieste al minuto: una pausa breve di solito basta.
export function isRateLimit(status, message) {
  return status === 429 || /rate limit|too many requests/i.test(message || '');
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Punteggio: Flash normale meglio di Flash-Lite, versione più alta meglio di una più bassa.
function score(id) {
  if (!/flash/.test(id)) return -1;
  if (/image|tts|audio|live|embedding|native|preview|exp/.test(id)) return -1;
  const v = /gemini-(\d+)(?:\.(\d+))?/.exec(id);
  if (!v) return -1;
  const version = Number(v[1]) * 100 + Number(v[2] || 0);
  return version * 10 + (/lite/.test(id) ? 0 : 5);
}

// Restituisce il miglior modello con visione disponibile per questa chiave.
// Lancia un errore se la chiave stessa non va: così distinguiamo i due casi.
export async function pickGeminiModel(key) {
  const res = await fetch(`${BASE}/models?key=${encodeURIComponent(key)}&pageSize=200`);
  const data = await res.json();
  if (!res.ok) {
    const e = new Error(data?.error?.message || `Errore ${res.status}`);
    e.status = res.status;
    e.keyProblem = res.status === 400 || res.status === 401 || res.status === 403;
    throw e;
  }
  const usable = (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .map((id) => ({ id, s: score(id) }))
    .filter((m) => m.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!usable.length) throw new Error('Nessun modello con visione disponibile per questa chiave.');
  return usable[0].id;
}
