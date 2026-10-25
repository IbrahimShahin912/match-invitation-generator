(() => {
  'use strict';

  const POSTER_W = 800;
  const POSTER_H = 1000; // 4:5, the tallest shape Facebook/Instagram feeds show uncropped
  const GOOGLE_FONTS_URL =
    'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap';

  const DEFAULTS = {
    org: 'ތިލަދުންމަތީ އުތުރުބުރީ ދިއްދޫ ކައުންސިލްގެ އިދާރާ',
    address: 'ހއ. ދިއްދޫ، ދިވެހިރާއްޖެ',
    title: 'ދަޢުވަތު',
    message:
      'މި ކައުންސިލުން އިންތިޒާމުކުރާ ވެޓެރަންސް ފުޓްބޯޅަ މުބާރާތުގެ ފުރަތަމަ މެޗް ބައްލަވައިލެއްވުން އެދި ދަޢުވަތު އަރުވަމެވެ.',
    date: 'ބުރާސްފަތި، 12 ނޮވެމްބަރު 2026',
    time: 'ރޭގަނޑު 8:30',
    venue: 'ކައުންސިލް އިދާރާގެ ހޯލް',
  };

  const $ = (sel) => document.querySelector(sel);
  const poster = $('#poster');
  const stage = $('#stage');
  const preview = $('#preview');
  const fields = [...document.querySelectorAll('[data-field]')];
  const outputs = [...document.querySelectorAll('[data-out]')];
  const status = $('#status');

  const text = { ...DEFAULTS };

  // ── Embedded assets (lets export work from file://) ──
  const EMB = window.EMBEDDED || null;
  if (EMB) {
    document.querySelectorAll('[data-asset]').forEach((img) => {
      img.src = EMB[img.dataset.asset];
    });
    const style = document.createElement('style');
    style.textContent = `@font-face{font-family:"Faruma";src:url(${EMB.faruma}) format("truetype");}`;
    document.head.appendChild(style);
  }

  // ── Render text into poster ──
  function render() {
    outputs.forEach((el) => {
      el.textContent = (text[el.dataset.out] || '').trim();
    });
    fitAll();
  }

  // Shrink single-line text until it fits its max width (data-fit), and
  // wrapping text until it fits its max height (data-fit-h).
  function fitAll() {
    poster.querySelectorAll('[data-fit], [data-fit-h]').forEach((el) => {
      el.style.fontSize = '';
      const maxW = Number(el.dataset.fit) || Infinity;
      const maxH = Number(el.dataset.fitH) || Infinity;
      let size = parseFloat(getComputedStyle(el).fontSize);
      while ((el.scrollWidth > maxW || el.scrollHeight > maxH) && size > 10) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  }

  // ── Scale preview to fit ──
  function fitStage() {
    const cs = getComputedStyle(preview);
    const availW = preview.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const narrow = window.matchMedia('(max-width: 860px)').matches;
    const availH = narrow
      ? Infinity
      : preview.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const s = Math.min(availW / POSTER_W, availH / POSTER_H, 1);
    stage.style.width = POSTER_W * s + 'px';
    stage.style.height = POSTER_H * s + 'px';
    poster.style.transform = `scale(${s})`;
    poster.style.transformOrigin = 'top left';
  }

  // ── Inputs ──
  fields.forEach((el) => {
    el.value = text[el.dataset.field];
    el.addEventListener('input', () => {
      text[el.dataset.field] = el.value;
      render();
    });
  });

  // ── PNG export ──
  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  // html-to-image cannot read local font files over file://, so build the
  // @font-face CSS ourselves: embedded Faruma + inlined Google Fonts.
  let fontCssPromise = null;
  function getFontEmbedCSS() {
    if (fontCssPromise) return fontCssPromise;
    fontCssPromise = (async () => {
      let css = EMB ? `@font-face{font-family:"Faruma";src:url(${EMB.faruma}) format("truetype");}` : '';
      try {
        let gcss = await (await fetch(GOOGLE_FONTS_URL)).text();
        const urls = [...new Set([...gcss.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
        const inlined = await Promise.all(
          urls.map(async (u) => [u, await blobToDataUrl(await (await fetch(u)).blob())])
        );
        inlined.forEach(([u, d]) => { gcss = gcss.split(u).join(d); });
        css += gcss;
      } catch (err) {
        console.warn('Could not inline Google Fonts (offline?)', err);
      }
      return css;
    })();
    return fontCssPromise;
  }

  function safeFileName(name) {
    const cleaned = (name || 'event').replace(/[\\/:*?"<>|]+/g, '').trim().replace(/\s+/g, '-');
    return `invitation-${cleaned || 'event'}.png`;
  }

  async function renderPng() {
    if (!window.htmlToImage) {
      const err = new Error('html-to-image not loaded');
      err.userMessage = 'Export library failed to load. Check your internet connection and reload.';
      throw err;
    }
    await document.fonts.ready;
    const width = Number($('#size').value);
    const options = {
      width: POSTER_W,
      height: POSTER_H,
      pixelRatio: width / POSTER_W,
      canvasWidth: POSTER_W,
      canvasHeight: POSTER_H,
      backgroundColor: '#ffffff',
      style: { transform: 'none', boxShadow: 'none', margin: '0' },
      fontEmbedCSS: await getFontEmbedCSS(),
    };
    // First pass warms up image decoding (avoids blank images in Safari).
    await htmlToImage.toBlob(poster, options);
    const blob = await htmlToImage.toBlob(poster, options);
    return new File([blob], safeFileName(text.date), { type: 'image/png' });
  }

  // Runs an export action with button/status handling shared by Download and Share.
  async function withExport(busyText, action) {
    const buttons = [$('#download'), $('#share')];
    buttons.forEach((b) => { b.disabled = true; });
    status.classList.remove('error');
    status.textContent = busyText;
    try {
      status.textContent = await action(await renderPng());
    } catch (err) {
      if (err.name === 'AbortError') {
        status.textContent = ''; // user closed the share sheet
      } else {
        console.error(err);
        status.textContent =
          err.userMessage || 'Could not create the PNG. Please reload the page and try again.';
        status.classList.add('error');
      }
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  $('#download').addEventListener('click', () =>
    withExport('Preparing image…', async (file) => {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return 'Downloaded. Ready to post on Facebook.';
    })
  );

  // Phones: hand the PNG straight to the share sheet (Facebook, WhatsApp, Viber…).
  const canShareFiles = (() => {
    try {
      return !!(navigator.canShare &&
        navigator.canShare({ files: [new File([''], 'test.png', { type: 'image/png' })] }));
    } catch {
      return false;
    }
  })();
  $('#share').hidden = !canShareFiles;
  $('#share').addEventListener('click', () =>
    withExport('Preparing image…', async (file) => {
      await navigator.share({ files: [file] });
      return 'Shared.';
    })
  );

  // ── Boot ──
  window.addEventListener('resize', fitStage);
  render();
  fitStage();
  document.fonts.ready.then(fitAll);
  getFontEmbedCSS(); // warm the cache so the first download is quick
})();
