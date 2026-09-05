import { STYLES, LANGS, REFINE, describeAspect, normaliseStyle } from './prompts.js';
import {
  pickGeminiModel, geminiUrl, isModelProblem, isOverload, isRateLimit, wait, FALLBACK_MODELS
} from './models.js';

const DEFAULTS = {
  provider: 'gemini',
  geminiKey: '',
  geminiModel: '',
  anthropicKey: '',
  anthropicModel: 'claude-sonnet-5',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5vl:7b',
  style: 'naturale',
  lang: 'en'
};
const MAX_SIDE = 2048; // piu pixel = piu dettaglio leggibile: la quota conta le richieste, non i token

// Ultima immagine analizzata per tab, per rigenerare con un altro stile.
const lastImage = new Map();

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'click2prompt-image',
      title: 'Click2Prompt: prompt di questa immagine',
      contexts: ['image']
    });
    // Deve esserci sempre, immagini comprese: prima dipendeva dal punto in cui
    // si cliccava e su un'immagine non linkata spariva, sembrando un difetto.
    chrome.contextMenus.create({
      id: 'click2prompt-area',
      title: "Click2Prompt: cattura un'area…",
      contexts: ['all']
    });
  });
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
  // Google ha ritirato gemini-2.5-flash per i nuovi account: chi lo aveva salvato
  // torna alla scelta automatica invece di restare bloccato su un modello morto.
  chrome.storage.local.get({ geminiModel: '', style: 'naturale' }).then(({ geminiModel, style }) => {
    const fix = {};
    if (geminiModel === 'gemini-2.5-flash') fix.geminiModel = '';
    // I formati erano tre e legati a prodotti specifici: ora sono prosa o JSON.
    if (!STYLES[style]) fix.style = normaliseStyle(style);
    if (Object.keys(fix).length) chrome.storage.local.set(fix);
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'click2prompt-image') {
    await ensureContent(tab.id);
    send(tab.id, { type: 'c2p:open', preview: info.srcUrl });
    runFromUrl(tab.id, info.srcUrl);
  } else if (info.menuItemId === 'click2prompt-area') {
    await startArea(tab.id);
  }
});

chrome.commands?.onCommand?.addListener(async (cmd) => {
  if (cmd !== 'capture-area') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) await startArea(tab.id);
});

async function startArea(tabId) {
  await ensureContent(tabId);
  send(tabId, { type: 'c2p:area-start' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? msg.tabId;

  if (msg.type === 'c2p:area-selected') {
    (async () => {
      try {
        const shot = await chrome.tabs.captureVisibleTab({ format: 'png' });
        const cropped = await chrome.tabs.sendMessage(tabId, {
          type: 'c2p:crop', dataUrl: shot, rect: msg.rect, dpr: msg.dpr
        });
        if (!cropped?.dataUrl) throw new Error('Ritaglio non riuscito.');
        send(tabId, { type: 'c2p:open', preview: cropped.dataUrl });
        const blob = await (await fetch(cropped.dataUrl)).blob();
        const { b64, mediaType, width, height } = await downscale(blob);
        analyze(tabId, b64, mediaType, { width, height });
      } catch (e) {
        send(tabId, { type: 'c2p:error', message: String(e.message || e) });
      }
    })();
    return false;
  }

  if (msg.type === 'c2p:regenerate') {
    const img = lastImage.get(tabId);
    if (!img) {
      send(tabId, { type: 'c2p:error', message: "Nessuna immagine in memoria: rilancia l'analisi." });
      return false;
    }
    analyze(tabId, img.b64, img.mediaType, img.size, msg.style, msg.lang);
    return false;
  }

  if (msg.type === 'c2p:open-options') {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (msg.type === 'c2p:area-from-popup') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await startArea(tab.id);
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

async function ensureContent(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId }, func: () => !!window.__click2prompt
    });
    if (result) return;
  } catch (_) { /* pagina non ispezionabile: proviamo comunque a iniettare */ }
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

function send(tabId, payload) {
  chrome.tabs.sendMessage(tabId, payload).catch(() => {});
}

async function runFromUrl(tabId, url) {
  try {
    let blob;
    try {
      blob = await (await fetch(url)).blob();
    } catch (_) {
      // blob:/data: locali alla pagina, oppure CORS: recupero dal content script
      const r = await chrome.tabs.sendMessage(tabId, { type: 'c2p:fetch', url });
      if (!r?.dataUrl) throw new Error('Immagine non scaricabile da questa pagina.');
      blob = await (await fetch(r.dataUrl)).blob();
    }
    const { b64, mediaType, width, height } = await downscale(blob);
    analyze(tabId, b64, mediaType, { width, height });
  } catch (e) {
    send(tabId, { type: 'c2p:error', message: String(e.message || e) });
  }
}

async function downscale(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return { b64: await blobToB64(out), mediaType: 'image/jpeg', width: w, height: h };
}

async function blobToB64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Metodo nativo dove esiste. La conversione manuale a blocchi funzionava,
  // ma somiglia alle tecniche di offuscamento e faceva scattare gli antivirus.
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function analyze(tabId, b64, mediaType, size, styleOverride, langOverride) {
  const cfg = { ...DEFAULTS, ...(await chrome.storage.local.get(DEFAULTS)) };
  const style = normaliseStyle(styleOverride || cfg.style);
  const lang = langOverride || cfg.lang;
  lastImage.set(tabId, { b64, mediaType, size });

  const langLine = LANGS[lang] || LANGS.en;
  // Il rapporto d'aspetto glielo diciamo noi invece di farglielo stimare a occhio:
  // era la ragione per cui l'immagine rigenerata usciva con un formato diverso.
  const aspect = size ? describeAspect(size.width, size.height) : null;
  const aspectLine = aspect
    ? `\nThe source image aspect ratio is exactly ${aspect}. Use this value, do not estimate it.`
    : '';

  send(tabId, { type: 'c2p:loading', style, lang, provider: cfg.provider });

  const onNote = (note) => send(tabId, { type: 'c2p:note', note });
  const ask = (system, user) => {
    if (cfg.provider === 'gemini') return callGemini(cfg, system, user, b64, mediaType, onNote);
    if (cfg.provider === 'ollama') return callOllama(cfg, system, user, b64);
    return callAnthropic(cfg, system, user, b64, mediaType);
  };

  try {
    const draft = await ask(
      STYLES[style].system + '\n' + langLine,
      'Reverse-engineer this image into a prompt, following your instructions exactly.' + aspectLine
    );

    // Secondo passaggio: rileggere l'immagine con la bozza davanti recupera i dettagli
    // persi alla prima passata. Costa una richiesta in più su 1.500 al giorno.
    let text = draft.text;
    try {
      onNote('Confronto la bozza con l’immagine…');
      const checked = await ask(
        REFINE + '\n' + langLine,
        `Here is the draft to audit against the image:\n\n${draft.text}${aspectLine}`
      );
      if (checked.text.trim().length > draft.text.trim().length * 0.5) text = checked.text;
    } catch (_) {
      // La verifica è un miglioramento, non un requisito: se fallisce si consegna la bozza.
    }

    send(tabId, { type: 'c2p:result', text: text.trim(), style, lang, meta: draft.meta });
  } catch (e) {
    const message = String(e.message || e);
    send(tabId, { type: 'c2p:error', message, needsKey: message === 'NO_KEY' });
  }
}

export async function callGemini(cfg, system, user, b64, mediaType, onNote = () => {}) {
  if (!cfg.geminiKey) throw new Error('NO_KEY');

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mediaType, data: b64 } }, { text: user }] }],
    // Tetto alto: la copia fedele è lunga e questi modelli spendono token anche per ragionare.
    // Temperatura bassa perché qui serve precisione, non fantasia.
    generationConfig: { temperature: 0.25, maxOutputTokens: 3000 }
  });

  const tried = new Set();
  let model = cfg.geminiModel || await resolveModel(cfg.geminiKey);
  let retired = false;   // il modello salvato non esiste più: il sostituto va memorizzato
  let stalls = 0;        // tentativi bruciati su server sovraccarichi
  let lastError = 'Errore Google';

  for (let attempt = 0; attempt < 6; attempt++) {
    tried.add(model);
    const res = await fetch(geminiUrl(model, cfg.geminiKey), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body
    });
    const data = await res.json();

    if (res.ok) {
      const candidate = data?.candidates?.[0];
      const text = (candidate?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) {
        const why = candidate?.finishReason;
        if (why === 'MAX_TOKENS') throw new Error('Risposta troppo lunga per il limite impostato: riprova, o scegli un formato più breve.');
        if (why === 'SAFETY' || why === 'PROHIBITED_CONTENT') throw new Error("Google ha bloccato l'analisi di questa immagine per i suoi filtri di sicurezza.");
        throw new Error('Nessuna risposta dal modello. Se si ripete, la quota giornaliera potrebbe essere esaurita.');
      }
      // Salviamo il nuovo modello solo se il precedente era davvero morto: un semplice
      // sovraccarico è passeggero e non deve declassare la scelta per sempre.
      if (retired && model !== cfg.geminiModel) chrome.storage.local.set({ geminiModel: model });
      return { text, meta: { provider: 'Google', model, cost: 'gratis' } };
    }

    lastError = data?.error?.message || 'Errore Google ' + res.status;

    if (isModelProblem(res.status, lastError)) {
      retired = true;
      const next = (await resolveModel(cfg.geminiKey, tried)) || FALLBACK_MODELS.find((m) => !tried.has(m));
      if (!next) throw new Error(lastError);
      model = next;
      continue;
    }

    if (isOverload(res.status, lastError) || isRateLimit(res.status, lastError)) {
      stalls++;
      if (stalls <= 2) {
        onNote(`Server Google occupati, riprovo tra ${stalls * 2} secondi…`);
        await wait(stalls * 2000);
        continue;
      }
      // Insiste: proviamo un modello meno gettonato, senza però renderlo permanente.
      const next = FALLBACK_MODELS.find((m) => !tried.has(m));
      if (!next) {
        throw new Error('I server di Google sono sovraccarichi in questo momento. Riprova fra un minuto.');
      }
      onNote(`Provo con un modello meno affollato (${next})…`);
      model = next;
      continue;
    }

    throw new Error(lastError);
  }
  throw new Error(lastError);
}

async function resolveModel(key, exclude = new Set()) {
  try {
    const best = await pickGeminiModel(key);
    if (!exclude.has(best)) return best;
  } catch (e) {
    if (e.keyProblem) throw new Error(e.message);
  }
  return FALLBACK_MODELS.find((m) => !exclude.has(m)) || null;
}

async function callOllama(cfg, system, user, b64) {
  const base = (cfg.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.ollamaModel,
        stream: false,
        options: { temperature: 0.4 },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user, images: [b64] }
        ]
      })
    });
  } catch (_) {
    throw new Error('Ollama non raggiungibile. Va avviato con OLLAMA_ORIGINS=chrome-extension://* (istruzioni nelle opzioni).');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Errore Ollama ' + res.status);
  const text = data?.message?.content || '';
  if (!text) throw new Error('Ollama non ha restituito testo.');
  return { text, meta: { provider: 'Ollama', model: cfg.ollamaModel, cost: 'gratis, in locale' } };
}

async function callAnthropic(cfg, system, user, b64, mediaType) {
  if (!cfg.anthropicKey) throw new Error('NO_KEY');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: cfg.anthropicModel,
      max_tokens: 3000,
      system,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: user }
        ]
      }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Errore Anthropic ' + res.status);
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  const u = data.usage;
  return {
    text,
    meta: {
      provider: 'Anthropic',
      model: cfg.anthropicModel,
      cost: u ? u.input_tokens + ' in / ' + u.output_tokens + ' out' : ''
    }
  };
}
