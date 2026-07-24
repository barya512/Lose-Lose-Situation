// Minimal DOM overlay for username/password entry over the Phaser canvas.
// Returns a teardown function that removes the overlay.
export function showAuthForm(
  title: string,
  onSubmit: (username: string, password: string) => void,
): () => void {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(10,4,16,0.85);z-index:10;font-family:sans-serif;';

  const card = document.createElement('div');
  card.style.cssText = 'display:flex;flex-direction:column;gap:12px;min-width:280px;';

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'color:#ff3ea5;font-size:24px;font-weight:bold;text-align:center;';

  const userInput = document.createElement('input');
  userInput.placeholder = 'username';
  const passInput = document.createElement('input');
  passInput.placeholder = 'password';
  passInput.type = 'password';
  for (const el of [userInput, passInput]) {
    el.style.cssText = 'padding:12px;font-size:16px;border-radius:8px;border:none;';
  }

  const submit = document.createElement('button');
  submit.textContent = 'GO';
  submit.style.cssText =
    'padding:12px;font-size:18px;font-weight:bold;border:none;border-radius:8px;' +
    'background:#3a2456;color:#fff;cursor:pointer;';

  const error = document.createElement('div');
  error.style.cssText = 'color:#ff6b6b;font-size:14px;min-height:18px;text-align:center;';

  const fire = () => onSubmit(userInput.value.trim(), passInput.value);
  submit.addEventListener('click', fire);
  passInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') fire(); });

  card.append(heading, userInput, passInput, submit, error);
  wrap.append(card);
  document.body.append(wrap);
  userInput.focus();

  (wrap as any).__setError = (msg: string) => { error.textContent = msg; };
  return () => wrap.remove();
}
