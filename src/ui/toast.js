import { el } from './dom.js';

let host = null;

export function initToast(node) {
  host = node;
}

export function toast(message, kind = 'info', ms = 2200) {
  if (!host) return;
  const item = el('div', { class: `toast-item ${kind}`, text: message });
  host.appendChild(item);
  setTimeout(() => {
    item.style.opacity = '0';
    setTimeout(() => item.remove(), 200);
  }, ms);
}
