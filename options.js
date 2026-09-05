import { pickGeminiModel, geminiUrl } from './models.js';

// L'interfaccia espone solo Google: è l'unico motore davvero alla portata di tutti.
// Ollama e Anthropic restano implementati in background.js e si riattivano
// scrivendo "provider" in chrome.storage.local, ma non li mettiamo davanti all'utente.
const DEFAULTS = {
  geminiKey: '',
  geminiModel: '',
  style: 'naturale',
  lang: 'en'
};

const $ = (id) => document.getElementById(id);
const FIELDS = ['geminiKey', 'geminiModel', 'style', 'lang'];
const msg = $('msg');

(async function init() {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  for (const f of FIELDS) $(f).value = cfg[f];
})();

function collect() {
  const out = { provider: 'gemini' };
  for (const f of FIELDS) out[f] = $(f).value.trim();
  return out;
}

$('save').addEventListener('click', async () => {
  await chrome.storage.local.set(collect());
  msg.textContent = 'Salvato ✓';
  msg.className = 'note ok';
  setTimeout(() => { msg.textContent = ''; }, 2000);
});

$('test').addEventListener('click', async () => {
  const cfg = collect();
  await chrome.storage.local.set(cfg);
  msg.textContent = 'Provo…';
  msg.className = 'note';
  try {
    if (!cfg.geminiKey) throw new Error('Incolla prima la chiave.');
    const model = cfg.geminiModel || await pickGeminiModel(cfg.geminiKey);
    const r = await fetch(geminiUrl(model, cfg.geminiKey), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }] })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || 'Errore ' + r.status);
    if (!cfg.geminiModel) {
      await chrome.storage.local.set({ geminiModel: model });
      $('geminiModel').value = model;
    }
    msg.textContent = `Funziona ✓ modello ${model}`;
    msg.className = 'note ok';
  } catch (e) {
    msg.textContent = String(e.message || e);
    msg.className = 'note ko';
  }
});

// La pagina si apre in una scheda nuova, quindi il tasto Indietro del browser
// non ha dove tornare: serve una via d uscita esplicita.
$("close").addEventListener("click", async () => {
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id) { await chrome.tabs.remove(tab.id); return; }
  } catch (_) { /* niente permesso tabs qui: proviamo le alternative */ }
  window.close();
  if (history.length > 1) history.back();
});
