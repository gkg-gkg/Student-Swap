// Modal and bottom Sheet on top of the native <dialog>: focus trap, Esc to close and
// focus restore come for free. variant "sheet" slides up from the bottom on phones.
import { html, mount } from '../lib/html.js';

/**
 * @param {{ title: string, body: ReturnType<typeof html>, variant?: 'modal' | 'sheet', onOpen?: (dialog: HTMLDialogElement, close: () => void) => void }} o
 * @returns {{ dialog: HTMLDialogElement, close: () => void }}
 */
export function openModal({ title, body, variant = 'modal', onOpen }) {
  const dialog = document.createElement('dialog');
  dialog.className = `dialog dialog--${variant}`;
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  mount(
    dialog,
    html`<div class="dialog__head"><h2 id="dialog-title">${title}</h2><button class="dialog__close" type="button" aria-label="Close" data-close>×</button></div><div class="dialog__body">${body}</div>`,
  );
  document.body.appendChild(dialog);
  const close = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(); // backdrop click
  });
  dialog.querySelector('[data-close]')?.addEventListener('click', close);
  dialog.showModal();
  onOpen?.(dialog, close);
  return { dialog, close };
}
