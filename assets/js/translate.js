// Page translation for English learners, powered by Google Translate's
// website widget. Nothing loads until someone picks a language: then the
// choice lives in Google's own "googtrans" cookie, and every page load after
// that fetches the widget and translates the page, including content drawn
// later (the widget watches the page for changes).
//
// Privacy: while a language is on, page text is sent to Google to translate.
// The Privacy page says so.

import { $, $$, esc } from './ui.js';
import { LANGS, currentLang, watchGlossary } from './i18n.js';

export { LANGS, currentLang };

function setCookie(lang) {
  const host = location.hostname;
  const domains = [host, host.split('.').slice(-2).join('.')].filter((d, i, a) => a.indexOf(d) === i && d.includes('.'));
  const expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  for (const d of ['', ...domains.map((x) => `;domain=.${x}`)]) {
    document.cookie = lang === 'en' ? `googtrans=;path=/${d};${expire}` : `googtrans=/en/${lang};path=/${d}`;
  }
}

function loadWidget() {
  if (window.google?.translate || $('#gt-script')) return;
  const holder = document.createElement('div');
  holder.id = 'google_translate_element';
  holder.hidden = true;
  document.body.append(holder);
  window.googleTranslateElementInit = () => {
    // eslint-disable-next-line no-new
    new window.google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'google_translate_element');
    // The cookie alone doesn't always start it (it doesn't on some hosts), so
    // pick the language in the widget's own hidden dropdown once it exists.
    // Google only translates a page while it's visible; retry a few times in
    // case the first request lands before the widget has finished loading.
    const lang = currentLang();
    let tries = 0;
    const translated = () => document.querySelector('font') !== null;
    const kick = () => {
      const combo = $('.goog-te-combo');
      if (translated() || tries > 60) return;
      if (document.hidden) return;              // resumes on visibilitychange
      if (!combo || ![...combo.options].some((o) => o.value === lang)) { tries++; setTimeout(kick, 250); return; }
      combo.value = lang;
      combo.dispatchEvent(new Event('change'));
      tries += 8;
      setTimeout(kick, 2500);                 // no <font> yet? ask again
    };
    kick();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    // Google turns our name into "Wikipedia" (维基百科, Wikipedia…) in the tab
    // title, so the title keeps its original English text.
    const title = document.title;
    new MutationObserver(() => { if (document.title !== title) document.title = title; })
      .observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
  };
  const s = document.createElement('script');
  s.id = 'gt-script';
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  s.onerror = () => { document.documentElement.classList.add('translate-failed'); };
  document.head.append(s);
}

// Switch language from anywhere (the Settings page uses this); reloads the page.
export function setLanguage(code) {
  if (code === currentLang()) return;
  setCookie(code);
  location.reload();
}

export function initTranslate() {
  const btn = $('#lang-btn');
  const sheet = $('#lang-menu');
  if (!btn || !sheet) return;
  const cur = currentLang();
  btn.querySelector('.lang-code').textContent = cur === 'en' ? '' : cur.split('-')[0].toUpperCase();

  // A centred panel of language cards: native name big, English name small
  sheet.innerHTML = `<div class="lang-card" role="dialog" aria-modal="true" aria-labelledby="lang-title" translate="no">
      <div class="lang-top"><div><h2 id="lang-title">Choose your language</h2>
        <p class="meta">Elige tu idioma · Chọn ngôn ngữ · 选择语言 · 언어 선택</p></div>
        <button type="button" class="icon-btn lang-x" aria-label="Close">✕</button></div>
      <div class="lang-grid">${LANGS.map(([code, native, english]) => `<button type="button" data-lang="${code}" aria-pressed="${code === cur}">
        <b>${esc(native)}</b><span>${esc(english)}</span></button>`).join('')}</div>
      <p class="lang-note">Menus and buttons use our own translations. Everything else, including what students write, is translated by Google and may not be perfect.</p>
    </div>`;
  const open = (v) => { sheet.hidden = !v; btn.setAttribute('aria-expanded', v); if (v) $('[aria-pressed="true"]', sheet)?.focus(); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); open(sheet.hidden); });
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('.lang-x')) return open(false);
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    if (b.dataset.lang === cur) return open(false);
    setCookie(b.dataset.lang);
    location.reload();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) open(false); });

  if (cur !== 'en') {
    watchGlossary();   // our translations first, and fenced off from Google
    loadWidget();
  }
}
