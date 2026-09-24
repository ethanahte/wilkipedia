// Page translation for English learners, powered by Google Translate's
// website widget. Nothing loads until someone picks a language: then the
// choice lives in Google's own "googtrans" cookie, and every page load after
// that fetches the widget and translates the page, including content drawn
// later (the widget watches the page for changes).
//
// Privacy: while a language is on, page text is sent to Google to translate.
// The Privacy page says so.

import { $, $$, esc } from './ui.js';

// Languages common among Wilcox / Santa Clara families, in their own names
export const LANGS = [
  ['en', 'English'], ['es', 'Español'], ['vi', 'Tiếng Việt'], ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'],
  ['ko', '한국어'], ['ja', '日本語'], ['tl', 'Tagalog'], ['hi', 'हिन्दी'], ['pa', 'ਪੰਜਾਬੀ'], ['te', 'తెలుగు'],
  ['ta', 'தமிழ்'], ['ar', 'العربية'], ['fa', 'فارسی'], ['ru', 'Русский'], ['pt', 'Português'],
];

export function currentLang() {
  const m = document.cookie.match(/(?:^|;\s*)googtrans=\/[^/]+\/([^;]+)/);
  return m ? decodeURIComponent(m[1]) : 'en';
}

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
    // Google "corrects" our name to Wikipedia in the tab title; put it back
    new MutationObserver(() => {
      if (/Wikipedia/.test(document.title)) document.title = document.title.replace(/Wikipedia/g, 'Wilkipedia');
    }).observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
  };
  const s = document.createElement('script');
  s.id = 'gt-script';
  s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  s.onerror = () => { document.documentElement.classList.add('translate-failed'); };
  document.head.append(s);
}

export function initTranslate() {
  const btn = $('#lang-btn');
  const menu = $('#lang-menu');
  if (!btn || !menu) return;
  const cur = currentLang();
  // Leave <html lang="en">: Google skips pages already tagged with the target language.
  btn.querySelector('.lang-code').textContent = cur === 'en' ? '' : cur.split('-')[0].toUpperCase();
  menu.innerHTML = `<div class="lang-head">Language · Idioma · Ngôn ngữ · 语言</div>`
    + LANGS.map(([code, name]) => `<button type="button" role="menuitemradio" aria-checked="${code === cur}" data-lang="${code}" translate="no">${esc(name)}</button>`).join('')
    + '<p class="lang-note">Translated by Google. Student writing is translated too, so it may not be perfect.</p>';
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', !menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b || b.dataset.lang === cur) return;
    setCookie(b.dataset.lang);
    location.reload();
  });
  if (cur !== 'en') loadWidget();
}
