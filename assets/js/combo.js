// Every <select> on the site can be typed in (Jonathan: "cannot type in drop-down"). Each one gets a
// text box with a filtered list, and the real <select> stays in the page underneath as the source of
// truth: code keeps reading and setting select.value and listening for 'change' exactly as before.
// Picking fires 'input' and 'change' on the select. Opt out with data-native.

let n = 0;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);
// "tieng" finds "Tiếng Việt", "GANDARA" finds "Velia Gandara Solis"
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const INDEX = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

export function enhance(sel) {
  if (sel.dataset.combo || sel.multiple || sel.size > 1 || 'native' in sel.dataset) return;
  sel.dataset.combo = '1';
  const id = `combo${++n}`;
  const wrap = document.createElement('span');
  wrap.className = 'combo';
  const input = document.createElement('input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, className: `combo-in ${sel.className}`.trim() });
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', `${id}-list`);
  if (sel.getAttribute('aria-label')) input.setAttribute('aria-label', sel.getAttribute('aria-label'));
  if (sel.id) {                                                  // <label for> now names the text box
    input.id = `${sel.id}-combo`;
    document.querySelectorAll(`label[for="${CSS.escape(sel.id)}"]`).forEach((l) => { l.htmlFor = input.id; });
  }
  const list = document.createElement('ul');
  Object.assign(list, { id: `${id}-list`, className: 'combo-list', hidden: true });
  list.setAttribute('role', 'listbox');
  sel.before(wrap);
  wrap.append(input, sel, list);
  sel.classList.add('combo-src');
  sel.tabIndex = -1;
  sel.setAttribute('aria-hidden', 'true');

  const opts = () => [...sel.options].filter((o) => !o.hidden);
  const current = () => sel.options[INDEX.get.call(sel)];
  const show = () => {
    const o = current();
    input.value = o ? o.text.trim() : '';
    input.disabled = sel.disabled;
    wrap.hidden = sel.hidden;
  };

  let shown = [], active = -1;
  const mark = () => {
    [...list.children].forEach((li, i) => li.classList.toggle('on', i === active));
    const li = list.children[active];
    if (li && shown.length) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const render = (q) => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    shown = opts().filter((o) => words.every((w) => norm(o.text).includes(w)));
    list.innerHTML = shown.length
      ? shown.map((o, i) => `<li role="option" id="${id}-${i}" aria-selected="${o === current()}"${o.disabled ? ' aria-disabled="true"' : ''}>${esc(o.text.trim())}</li>`).join('')
      : '<li class="combo-none">No matches</li>';
    active = words.length ? shown.findIndex((o) => !o.disabled) : shown.indexOf(current());
    mark();
  };
  // fixed, so a modal or a scrolling card can't clip it; opens upward when there's no room below
  const place = () => {
    const r = input.getBoundingClientRect();
    const below = innerHeight - r.bottom, up = below < 220 && r.top > below;
    Object.assign(list.style, {
      left: `${Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 200) - 8))}px`,
      width: `${Math.max(r.width, 200)}px`,
      top: up ? '' : `${r.bottom + 4}px`,
      bottom: up ? `${innerHeight - r.top + 4}px` : '',
      maxHeight: `${Math.max(140, Math.min(300, (up ? r.top : below) - 16))}px`,
    });
  };
  const open = (q = '') => {
    render(q); place();
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const pick = (o) => {
    if (!o || o.disabled) return;
    const changed = o !== current();
    o.selected = true;
    show(); close();
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const step = (d) => {
    if (list.hidden) return open();
    for (let i = active + d; i >= 0 && i < shown.length; i += d) if (!shown[i].disabled) { active = i; break; }
    mark();
  };

  input.addEventListener('focus', () => input.select());
  input.addEventListener('mousedown', () => { if (document.activeElement === input && list.hidden) open(); });
  input.addEventListener('click', () => { if (list.hidden) { open(); input.select(); } });
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (list.hidden) open(); else pick(shown[active]); }
    else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); show(); }
    else if (e.key === 'Tab' && !list.hidden) { if (norm(input.value) !== norm(current()?.text || '')) pick(shown[active]); close(); show(); }
  });
  input.addEventListener('blur', () => {
    if (list.hidden) return show();
    close();
    const typed = norm(input.value);                             // typed a whole name and clicked away
    const exact = typed && opts().find((o) => norm(o.text) === typed);
    if (exact) pick(exact); else show();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the box
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[role="option"]');
    if (li) pick(shown[[...list.children].indexOf(li)]);
  });
  addEventListener('scroll', (e) => { if (!list.hidden && e.target !== list) place(); }, true);
  addEventListener('resize', () => { if (!list.hidden) place(); });

  // Keep the box in step with the select, however the page changes it
  Object.defineProperty(sel, 'value', { configurable: true, get() { return VALUE.get.call(this); }, set(v) { VALUE.set.call(this, v); show(); } });
  Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return INDEX.get.call(this); }, set(v) { INDEX.set.call(this, v); show(); } });
  new MutationObserver(show).observe(sel, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'selected'] });
  sel.addEventListener('change', show);
  sel.addEventListener('focus', () => input.focus());            // form validation focuses the select
  sel.form?.addEventListener('reset', () => setTimeout(show));
  show();
}

export function init() {
  document.querySelectorAll('select').forEach(enhance);
  new MutationObserver((recs) => {
    for (const r of recs) for (const node of r.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.tagName === 'SELECT') enhance(node);
      else node.querySelectorAll('select').forEach(enhance);
    }
  }).observe(document.body, { childList: true, subtree: true });
}
