import { pickGeminiModel, geminiUrl } from './models.js';

const msg = document.getElementById('msg');
const key = document.getElementById('key');

chrome.storage.local.get({ geminiKey: '' }).then(({ geminiKey }) => {
  if (geminiKey) key.value = geminiKey;
});

document.getElementById('save').addEventListener('click', async () => {
  const value = key.value.trim();
  if (!value) {
    msg.textContent = 'Incolla prima la chiave.';
    msg.className = 'note ko';
    return;
  }
  msg.textContent = 'Verifico…';
  msg.className = 'note';
  try {
    const model = await pickGeminiModel(value);
    const r = await fetch(geminiUrl(model, value), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }] })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || 'Errore ' + r.status);
    await chrome.storage.local.set({ geminiKey: value, geminiModel: model, provider: 'gemini' });
    msg.textContent = `Tutto pronto ✓ modello ${model}. Puoi chiudere questa pagina.`;
    msg.className = 'note ok';
  } catch (e) {
    msg.textContent = (e.keyProblem ? 'Chiave rifiutata da Google: ' : 'Non ha funzionato: ') + String(e.message || e);
    msg.className = 'note ko';
  }
});

document.getElementById('opts').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
