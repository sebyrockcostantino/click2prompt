const state = document.getElementById('state');

(async () => {
  const cfg = await chrome.storage.local.get({ provider: 'gemini', geminiKey: '' });
  const names = { gemini: 'Google (gratis)', ollama: 'Ollama locale', anthropic: 'Claude' };
  const ready = cfg.provider !== 'gemini' || !!cfg.geminiKey;
  state.textContent = ready ? 'Pronto · ' + names[cfg.provider] : 'Manca la chiave: apri le impostazioni';
  state.className = 'state ' + (ready ? 'ok' : 'ko');
})();

document.getElementById('area').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'c2p:area-from-popup' });
  window.close();
});

document.getElementById('opts').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
