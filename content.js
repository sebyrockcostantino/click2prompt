(() => {
  if (window.__click2prompt) return;
  window.__click2prompt = true;

  const STYLE_LABELS = {
    naturale: 'Linguaggio naturale',
    json: 'JSON strutturato'
  };

  const host = document.createElement('div');
  host.id = 'click2prompt-host';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

      .selector {
        position: fixed; inset: 0; pointer-events: auto; cursor: crosshair;
        background: rgba(0,0,0,.35); display: none;
      }
      .selector.on { display: block; }
      /* Durante il trascinamento a oscurare è l'ombra del riquadro, così l'area
         scelta resta l'unica parte luminosa dello schermo. */
      .selector.drag { background: transparent; }
      .hint {
        position: absolute; top: 24px; left: 50%; transform: translateX(-50%);
        background: #0b0b0d; color: #fff; padding: 10px 16px; border-radius: 999px;
        font-size: 13px; letter-spacing: .02em; border: 1px solid #1ee3d3;
      }
      .marquee {
        position: absolute; border: 2px solid #1ee3d3; background: rgba(30,227,211,.12);
        box-shadow: 0 0 0 9999px rgba(0,0,0,.35); display: none;
      }
      .confirm {
        position: absolute; display: none; align-items: center; gap: 8px;
        background: #0b0b0d; border: 1px solid #23252b; border-radius: 10px;
        padding: 8px 10px; box-shadow: 0 12px 34px rgba(0,0,0,.55); pointer-events: auto;
      }
      .conf-txt { color: #c8ccd2; font-size: 12.5px; margin-right: 2px; white-space: nowrap; }
      .confirm button {
        border-radius: 7px; padding: 7px 14px; font-size: 12.5px; font-weight: 600;
        cursor: pointer; border: 1px solid #2a2d34; background: #16181d; color: #e6e8ec;
        font-family: inherit; white-space: nowrap;
      }
      .confirm button:hover { border-color: #3a3d45; }
      .conf-go { background: #1ee3d3 !important; border-color: #1ee3d3 !important; color: #04211f !important; }
      .conf-go:hover { background: #35ede0 !important; }
      .confirm button:focus-visible { outline: 2px solid #1ee3d3; outline-offset: 2px; }

      .panel {
        position: fixed; right: 20px; bottom: 20px; width: 400px; max-height: 80vh;
        background: #0b0b0d; color: #f2f2f2; border: 1px solid #23252b; border-radius: 14px;
        box-shadow: 0 24px 60px rgba(0,0,0,.55); pointer-events: auto;
        display: none; flex-direction: column; overflow: hidden;
      }
      .panel.on { display: flex; }

      .head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #1c1e23; cursor: move; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #1ee3d3; flex: none; }
      .title { font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; flex: 1; }
      .x { background: none; border: 0; color: #8b8f98; font-size: 18px; line-height: 1; cursor: pointer; padding: 2px 4px; }
      .x:hover { color: #fff; }

      .body { padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
      .thumb { width: 100%; max-height: 130px; object-fit: contain; background: #141519; border-radius: 8px; display: none; }
      .thumb.on { display: block; }

      .row { display: flex; gap: 8px; }
      select {
        flex: 1; background: #141519; color: #f2f2f2; border: 1px solid #26282f;
        border-radius: 8px; padding: 7px 8px; font-size: 12px; cursor: pointer;
      }
      textarea {
        width: 100%; min-height: 190px; resize: vertical; background: #141519; color: #f2f2f2;
        border: 1px solid #26282f; border-radius: 8px; padding: 11px; font-size: 13px; line-height: 1.55;
      }
      textarea:focus, select:focus { outline: 1px solid #1ee3d3; }

      .status { font-size: 12.5px; color: #9aa0aa; display: flex; align-items: center; gap: 8px; }
      .spin { width: 13px; height: 13px; border: 2px solid #2a2d34; border-top-color: #1ee3d3; border-radius: 50%; animation: sp .7s linear infinite; }
      @keyframes sp { to { transform: rotate(360deg); } }
      .err { font-size: 13px; color: #ff8b8b; line-height: 1.5; }

      .actions { display: flex; gap: 8px; }
      button.act {
        flex: 1; border-radius: 8px; padding: 9px 10px; font-size: 12.5px; font-weight: 600; cursor: pointer;
        border: 1px solid #2a2d34; background: #16181d; color: #e6e8ec;
      }
      button.act:hover { border-color: #3a3d45; }
      button.act.primary { background: #1ee3d3; border-color: #1ee3d3; color: #04211f; }
      button.act.primary:hover { background: #35ede0; }
      .foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; color: #6c717a; padding-top: 2px; }
      .sign { color: #8b8f98; letter-spacing: .04em; }
      .sign b { color: #1ee3d3; font-weight: 600; }
      .meta { text-align: right; }
      .hide { display: none !important; }
    </style>

    <div class="selector" id="sel">
      <div class="hint" id="hint">Trascina per selezionare l'area. ESC per annullare</div>
      <div class="marquee" id="mq"></div>
      <div class="confirm" id="confirm">
        <span class="conf-txt">Analizzo questa area?</span>
        <button class="conf-go" id="go">Analizza</button>
        <button class="conf-redo" id="redo">Rifai</button>
      </div>
    </div>

    <div class="panel" id="panel">
      <div class="head" id="head">
        <span class="dot"></span>
        <span class="title">Click2Prompt</span>
        <button class="x" id="close">×</button>
      </div>
      <div class="body">
        <img class="thumb" id="thumb" alt="">
        <div class="status" id="status"><span class="spin"></span><span id="statusText">Analisi in corso…</span></div>
        <div class="err hide" id="err"></div>
        <div class="row hide" id="controls">
          <select id="style"></select>
          <select id="lang">
            <option value="en">Inglese</option>
            <option value="it">Italiano</option>
          </select>
        </div>
        <textarea id="out" class="hide" spellcheck="false" placeholder="Il prompt comparirà qui…"></textarea>
        <div class="actions hide" id="actions">
          <button class="act primary" id="copy">Copia prompt</button>
          <button class="act" id="regen">Rigenera</button>
        </div>
        <button class="act hide" id="openOpts">Apri le impostazioni</button>
        <div class="foot">
          <span class="sign">di <b>SebyRock</b></span>
          <span class="meta" id="meta"></span>
        </div>
      </div>
    </div>
  `;
  (document.body || document.documentElement).appendChild(host);

  const $ = (id) => root.getElementById(id);
  const el = {
    sel: $('sel'), mq: $('mq'), hint: $('hint'), confirm: $('confirm'), go: $('go'), redo: $('redo'), panel: $('panel'), head: $('head'), close: $('close'),
    thumb: $('thumb'), status: $('status'), statusText: $('statusText'), err: $('err'),
    controls: $('controls'), style: $('style'), lang: $('lang'), out: $('out'),
    actions: $('actions'), copy: $('copy'), regen: $('regen'), openOpts: $('openOpts'), meta: $('meta')
  };

  for (const [value, label] of Object.entries(STYLE_LABELS)) {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    el.style.appendChild(o);
  }

  const show = (node, on) => node.classList.toggle('hide', !on);

  el.close.onclick = () => el.panel.classList.remove('on');
  el.openOpts.onclick = () => chrome.runtime.sendMessage({ type: 'c2p:open-options' });
  el.copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(el.out.value);
      el.copy.textContent = 'Copiato ✓';
    } catch (_) {
      el.out.select();
      document.execCommand('copy');
      el.copy.textContent = 'Copiato ✓';
    }
    setTimeout(() => { el.copy.textContent = 'Copia prompt'; }, 1600);
  };
  const rerun = () => chrome.runtime.sendMessage({
    type: 'c2p:regenerate', style: el.style.value, lang: el.lang.value
  });
  el.regen.onclick = rerun;
  el.style.onchange = rerun;
  el.lang.onchange = rerun;

  // Trascinamento del pannello dalla barra del titolo.
  let drag = null;
  el.head.addEventListener('mousedown', (e) => {
    if (e.target === el.close) return;
    const r = el.panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - drag.w);
    const y = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - drag.h);
    el.panel.style.left = x + 'px';
    el.panel.style.top = y + 'px';
    el.panel.style.right = 'auto';
    el.panel.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', () => { drag = null; });

  // --- Selezione area ---
  let start = null;
  let pending = null;

  const hideConfirm = () => {
    el.confirm.style.display = 'none';
    el.hint.style.display = '';
    pending = null;
  };
  const stopSelect = () => {
    el.sel.classList.remove('on', 'drag');
    el.mq.style.display = 'none';
    start = null;
    hideConfirm();
  };

  // La selezione non parte da sola: un riquadro sbagliato costerebbe due chiamate
  // e una quindicina di secondi, senza modo di fermarla.
  function askConfirm(rect) {
    pending = rect;
    el.hint.style.display = 'none';
    el.confirm.style.display = 'flex';
    const box = el.confirm.getBoundingClientRect();
    let top = rect.y + rect.h + 12;
    if (top + box.height > innerHeight - 8) top = Math.max(8, rect.y - box.height - 12);
    let left = rect.x + rect.w / 2 - box.width / 2;
    left = Math.min(Math.max(8, left), innerWidth - box.width - 8);
    el.confirm.style.top = top + 'px';
    el.confirm.style.left = left + 'px';
    el.go.focus();
  }

  function runSelection() {
    if (!pending) return;
    const rect = pending;
    stopSelect();
    // Aspetto due frame perché l'overlay sparisca prima dello screenshot.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ type: 'c2p:area-selected', rect, dpr: devicePixelRatio || 1 });
    }));
  }

  el.confirm.addEventListener('mousedown', (e) => e.stopPropagation());
  el.go.addEventListener('click', runSelection);
  el.redo.addEventListener('click', () => {
    hideConfirm();
    el.mq.style.display = 'none';
    el.sel.classList.remove('drag');
  });

  el.sel.addEventListener('mousedown', (e) => {
    hideConfirm();
    start = { x: e.clientX, y: e.clientY };
    el.sel.classList.add('drag');
    Object.assign(el.mq.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px', width: '0px', height: '0px' });
  });
  el.sel.addEventListener('mousemove', (e) => {
    if (!start) return;
    Object.assign(el.mq.style, {
      left: Math.min(start.x, e.clientX) + 'px',
      top: Math.min(start.y, e.clientY) + 'px',
      width: Math.abs(e.clientX - start.x) + 'px',
      height: Math.abs(e.clientY - start.y) + 'px'
    });
  });
  el.sel.addEventListener('mouseup', (e) => {
    if (!start) return;
    const rect = {
      x: Math.min(start.x, e.clientX),
      y: Math.min(start.y, e.clientY),
      w: Math.abs(e.clientX - start.x),
      h: Math.abs(e.clientY - start.y)
    };
    start = null;
    // Sotto i 12 pixel è un click involontario, non una selezione.
    if (rect.w < 12 || rect.h < 12) {
      el.mq.style.display = 'none';
      el.sel.classList.remove('drag');
      return;
    }
    askConfirm(rect);
  });
  window.addEventListener('keydown', (e) => {
    if (!el.sel.classList.contains('on')) return;
    if (e.key === 'Escape') { e.preventDefault(); stopSelect(); }
    else if (e.key === 'Enter' && pending) { e.preventDefault(); runSelection(); }
  }, true);

  function openPanel(preview) {
    el.panel.classList.add('on');
    el.thumb.classList.toggle('on', !!preview);
    if (preview) el.thumb.src = preview;
    el.out.value = '';
    show(el.out, false);
    show(el.actions, false);
    show(el.err, false);
    show(el.openOpts, false);
    show(el.meta, false);
    el.status.style.display = 'flex';
    el.statusText.textContent = 'Scarico l\'immagine…';
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'c2p:open') {
      openPanel(msg.preview);
    } else if (msg.type === 'c2p:area-start') {
      el.sel.classList.add('on');
    } else if (msg.type === 'c2p:loading') {
      el.style.value = msg.style;
      el.lang.value = msg.lang;
      show(el.controls, true);
      el.status.style.display = 'flex';
      el.statusText.textContent = 'Analisi in corso…';
      show(el.err, false);
      show(el.openOpts, false);
    } else if (msg.type === 'c2p:note') {
      el.status.style.display = 'flex';
      el.statusText.textContent = msg.note;
    } else if (msg.type === 'c2p:result') {
      el.status.style.display = 'none';
      el.out.value = msg.text;
      show(el.out, true);
      show(el.actions, true);
      show(el.controls, true);
      if (msg.meta) {
        el.meta.textContent = `${msg.meta.provider} · ${msg.meta.model}${msg.meta.cost ? ' · ' + msg.meta.cost : ''}`;
        show(el.meta, true);
      }
      navigator.clipboard.writeText(msg.text).then(
        () => { el.copy.textContent = 'Copiato ✓'; setTimeout(() => { el.copy.textContent = 'Copia prompt'; }, 1600); },
        () => {}
      );
    } else if (msg.type === 'c2p:error') {
      el.status.style.display = 'none';
      el.err.textContent = msg.needsKey
        ? 'Manca la chiave API. È gratuita: apri le impostazioni e segui i 3 passaggi.'
        : msg.message;
      show(el.err, true);
      show(el.openOpts, !!msg.needsKey);
      el.panel.classList.add('on');
    } else if (msg.type === 'c2p:crop') {
      cropShot(msg).then((dataUrl) => sendResponse({ dataUrl })).catch(() => sendResponse({}));
      return true;
    } else if (msg.type === 'c2p:fetch') {
      fetchAsDataUrl(msg.url).then((dataUrl) => sendResponse({ dataUrl })).catch(() => sendResponse({}));
      return true;
    }
    return false;
  });

  function cropShot({ dataUrl, rect, dpr }) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = img.width / (innerWidth * dpr) * dpr; // corregge eventuale scala dello screenshot
        const c = document.createElement('canvas');
        c.width = Math.round(rect.w * s);
        c.height = Math.round(rect.h * s);
        c.getContext('2d').drawImage(
          img,
          Math.round(rect.x * s), Math.round(rect.y * s),
          Math.round(rect.w * s), Math.round(rect.h * s),
          0, 0, c.width, c.height
        );
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function fetchAsDataUrl(url) {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }
})();
