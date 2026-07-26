import { css, font } from '../core/theme';

// Minimal DOM overlay for username/password entry over the Phaser canvas.
// onSubmit resolves to an error string to display in-modal (form stays open),
// or null on success (onSubmit is responsible for tearing the form down).
// Returns a teardown function that removes the overlay.
export function showAuthForm(
  title: string,
  onSubmit: (username: string, password: string) => Promise<string | null>,
  onCancel: () => void,
): () => void {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    `background:rgba(6,26,18,0.88);z-index:10;font-family:${font.ui};`; // theme.color.shadow
  // The overlay covers the whole viewport over a live Phaser scene. Phaser
  // attaches its mouse listeners to `window`, so trap the modal's own mouse
  // events here to stop them bubbling through to the buttons behind the form.
  wrap.addEventListener('mousedown', (e) => e.stopPropagation());
  wrap.addEventListener('mouseup', (e) => e.stopPropagation());

  const card = document.createElement('div');
  card.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:280px;';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText =
    `color:${css.gold};font-family:${font.display};font-size:28px;font-weight:700;` +
    'text-align:center;';

  const userInput = document.createElement('input');
  userInput.placeholder = 'username';
  const passInput = document.createElement('input');
  passInput.placeholder = 'password';
  passInput.type = 'password';
  for (const el of [userInput, passInput]) {
    el.style.cssText =
      `padding:12px;font-family:${font.ui};font-size:16px;border-radius:8px;` +
      `border:1px solid ${css.goldDim};background:${css.cardFace};color:${css.ink};`;
  }

  const submit = document.createElement('button');
  submit.textContent = 'GO';
  submit.style.cssText =
    `padding:12px;font-family:${font.ui};font-size:18px;font-weight:600;letter-spacing:3px;` +
    `border:1px solid ${css.goldDim};border-radius:8px;` +
    `background:${css.panel};color:${css.cream};cursor:pointer;`;

  const cancel = document.createElement('button');
  cancel.textContent = 'CANCEL';
  cancel.style.cssText =
    `padding:8px;font-family:${font.ui};font-size:14px;border:none;border-radius:8px;` +
    `background:transparent;color:${css.creamDim};cursor:pointer;`;

  const error = document.createElement('div');
  error.style.cssText =
    `color:${css.redBright};font-family:${font.ui};font-size:14px;min-height:18px;` +
    'text-align:center;';

  const teardown = () => {
    document.removeEventListener('keydown', onKey);
    wrap.remove();
  };

  let busy = false;
  const fire = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    submit.disabled = true;
    error.textContent = '';
    const msg = await onSubmit(userInput.value.trim(), passInput.value);
    // Non-null => an error to show; keep the form open and re-enable.
    // Null => success; onSubmit already tore the form down.
    if (msg !== null) {
      error.textContent = msg;
      submit.disabled = false;
      busy = false;
    }
  };

  const dismiss = () => { teardown(); onCancel(); };

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') void fire();
    else if (e.key === 'Escape') dismiss();
  }

  submit.addEventListener('click', () => void fire());
  cancel.addEventListener('click', dismiss);
  document.addEventListener('keydown', onKey);

  card.append(heading, userInput, passInput, submit, cancel, error);
  wrap.append(card);
  document.body.append(wrap);
  userInput.focus();

  return teardown;
}
