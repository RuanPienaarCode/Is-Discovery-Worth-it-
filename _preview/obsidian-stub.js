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
  /* the page's own icons, near enough to lucide's for the layout */
  menu: 'M4 6h16M4 12h16M4 18h16',
  x: 'M18 6 6 18M6 6l12 12',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
  'triangle-alert': 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  scale: 'M16 16l3-8 3 8c-2 1.5-4 1.5-6 0M2 16l3-8 3 8c-2 1.5-4 1.5-6 0M7 21h10M12 3v18M3 7h18',
  receipt: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM8 8h8M8 12h8M8 16h5',
  'layout-grid': 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'arrow-left-right': 'M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4',
  gift: 'M3 8h18v4H3zM12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5',
  waypoints: 'M12 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM19.5 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM10.4 6.6 6 14.6M13.6 6.6 18 14.6M7 17h10',
  'sliders-horizontal': 'M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4',
  calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  anchor: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 22V8M5 12H2a10 10 0 0 0 20 0h-3',
  shuffle: 'M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22M18 2l4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M12 3v18',
  'arrow-up-right': 'M7 17 17 7M7 7h10v10',
  'arrow-down-left': 'M17 7 7 17M17 17H7V7',
  'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
  check: 'M20 6 9 17l-5-5',
  landmark: 'M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z',
  'heart-pulse': 'M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7zM3.2 12H9l.5-1 2 4.5 2-7 1.5 3.5h5.3',
  'shield-check': 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  car: 'M19 17h2v-4l-2-5H5L3 13v4h2M7 17h10M7 17a2 2 0 1 0 0 .1M17 17a2 2 0 1 0 0 .1',
  umbrella: 'M22 12a10 10 0 0 0-20 0zM12 12v8a2 2 0 0 0 4 0M12 2v1',
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
