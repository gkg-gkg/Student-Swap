import { html, raw } from '../lib/html.js';

/** Drag-and-drop file target. The real <input> covers the box, so click and keyboard just work.
 * @param {{ id: string, accept: string, label: string, hint?: string, multiple?: boolean }} o */
export const dropzone = ({ id, accept, label, hint, multiple }) => html`<div class="dropzone" data-dropzone>
  <input type="file" id="${id}" name="${id}" accept="${accept}" ${multiple ? raw('multiple') : ''} aria-label="${label}" aria-describedby="${id}-hint" />
  <div class="dropzone__inner">
    <span class="dropzone__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg></span>
    <strong>${label}</strong>
    <span id="${id}-hint">${hint ?? ''}</span>
  </div>
</div>`;

/** @param {HTMLElement} root @param {(files: File[], input: HTMLInputElement) => void} onFiles */
export function initDropzone(root, onFiles) {
  const input = /** @type {HTMLInputElement | null} */ (root.querySelector('input[type=file]'));
  if (!input) return;
  const over = (/** @type {boolean} */ on) => root.classList.toggle('is-over', on);
  root.addEventListener('dragenter', () => over(true));
  root.addEventListener('dragover', (e) => {
    e.preventDefault();
    over(true);
  });
  root.addEventListener('dragleave', () => over(false));
  root.addEventListener('drop', () => over(false));
  input.addEventListener('change', () => {
    over(false);
    if (input.files?.length) onFiles([...input.files], input);
  });
}
