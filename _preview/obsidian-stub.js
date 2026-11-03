/* Minimal `obsidian` stand-in for the browser harness. setIcon draws a plain
   24x24 stroke path per name so the layout matches what lucide occupies. */
const PATHS = {
  'book-open': 'M2 5.5C4.5 4 8 4 12 6c4-2 7.5-2 10-.5V20c-2.5-1.5-6-1.5-10 .5-4-2-7.5-2-10-.5ZM12 6v14.5',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'external-link': 'M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  'chevron-right': 'M9 18l6-6-6-6',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-up': 'M18 15l-6-6-6 6',
  plus: 'M12 5v14M5 12h14',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
};
export function setIcon(node, name) {
  const d = PATHS[name];
  if (!d) { node.textContent = '□'; return; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  svg.append(p);
  node.append(svg);
}
export class Notice {
  constructor(msg) {
    const n = document.createElement('div');
    n.className = 'stub-notice';
    n.textContent = msg;
    document.body.append(n);
    setTimeout(() => n.remove(), 4000);
    console.log('[Notice]', msg);
  }
}
export class Modal {
  constructor(app) {
    this.app = app;
    this.modalEl = document.createElement('div');
    this.modalEl.className = 'modal stub-modal';
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'modal-content';
    this.modalEl.append(this.contentEl);
    this.bg = document.createElement('div');
    this.bg.className = 'stub-modal-bg';
    this.bg.addEventListener('click', () => this.close());
  }
  open() { document.body.append(this.bg, this.modalEl); this.onOpen && this.onOpen(); }
  close() { this.onClose && this.onClose(); this.modalEl.remove(); this.bg.remove(); }
}
export class Plugin {}
export class ItemView {}
export class MarkdownView {}
export class PluginSettingTab {}
export class Setting {}
export class TFile {}
export class TFolder {}
export const editorInfoField = {};
export const Platform = { isMobile: document.body.classList.contains('is-mobile') };
export const normalizePath = p => String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
