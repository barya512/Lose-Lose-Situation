import { css, font, outcomeCss } from '../core/theme';
import { dollars } from '../core/money';
import type { MarketBet } from '../core/types';

/**
 * Top-right stack announcing bets that settled while the player was elsewhere.
 *
 * Mounted once for the whole app rather than per-scene: the whole point is that
 * a resolution reaches you in the casino, or the hub, or mid-navigation. Juice
 * stays scene-bound (it needs a Phaser.Scene); this is the part that doesn't.
 */

/** Beyond this the stack stops being information and starts being a wall. */
const MAX_CARDS = 3;
const DISMISS_MS = 6_000;

export interface NotificationLayer {
  show(bet: MarketBet): void;
  teardown(): void;
}

export function mountNotificationLayer(): NotificationLayer {
  const stack = document.createElement('div');
  stack.style.cssText =
    'position:fixed;top:16px;right:16px;z-index:20;display:flex;flex-direction:column;' +
    // The container spans a big empty region, so it must not eat clicks meant
    // for the game. Only the cards themselves are interactive.
    `gap:10px;align-items:flex-end;pointer-events:none;font-family:${font.ui};`;
  document.body.appendChild(stack);

  const timers = new Set<ReturnType<typeof setTimeout>>();

  function dismiss(card: HTMLElement): void {
    card.remove();
  }

  function show(bet: MarketBet): void {
    // LOST means the balance went DOWN, which in this game is the good one.
    const rewarded = bet.status === 'LOST';
    const accent = rewarded ? outcomeCss.reward : outcomeCss.punish;

    const card = document.createElement('div');
    card.dataset.notification = bet.id;
    card.style.cssText =
      `pointer-events:auto;cursor:pointer;min-width:240px;max-width:320px;` +
      `padding:12px 14px;border-radius:10px;border:1px solid ${accent};` +
      `background:${css.cardFace};color:${css.ink};box-shadow:0 6px 18px rgba(0,0,0,0.45);`;

    // Same trap as the auth form: Phaser's listeners live on `window`, so a
    // click here would otherwise be hit-tested against the scene behind us.
    card.addEventListener('mousedown', (e) => e.stopPropagation());
    card.addEventListener('mouseup', (e) => e.stopPropagation());
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss(card);
    });

    const heading = document.createElement('div');
    heading.textContent = `${bet.ticker ?? ''} ${bet.direction ?? ''} — ${
      rewarded ? 'LOST' : 'WON'
    }`;
    heading.style.cssText =
      `color:${accent};font-family:${font.display};font-size:18px;font-weight:700;`;

    const delta = document.createElement('div');
    const detail = (bet.result_detail ?? {}) as Record<string, unknown>;
    const deltaCents = Number(detail.balance_delta_cents ?? 0);
    delta.textContent = `${deltaCents >= 0 ? '+' : '-'}${dollars(Math.abs(deltaCents))}`;
    delta.style.cssText = `color:${accent};font-size:16px;margin-top:2px;`;

    card.append(heading, delta);

    const drop = detail.item_drop as { name?: string } | null | undefined;
    if (drop?.name) {
      const item = document.createElement('div');
      item.textContent = `got: ${drop.name}`;
      item.style.cssText = `color:${css.gold};font-size:14px;margin-top:6px;`;
      card.appendChild(item);
    }

    // Explains a result that would otherwise look like a broken price feed:
    // the price DID move your way, the charm just ate it.
    const antiLuck = detail.anti_luck as { flipped?: boolean } | undefined;
    if (antiLuck?.flipped) {
      const note = document.createElement('div');
      note.textContent = 'your charm swallowed the win';
      note.style.cssText = `color:${css.cream};font-size:13px;margin-top:6px;opacity:0.85;`;
      card.appendChild(note);
    }

    stack.appendChild(card);
    while (stack.childElementCount > MAX_CARDS) stack.firstElementChild?.remove();

    const timer = setTimeout(() => {
      timers.delete(timer);
      dismiss(card);
    }, DISMISS_MS);
    timers.add(timer);
  }

  return {
    show,
    teardown() {
      timers.forEach(clearTimeout);
      timers.clear();
      stack.remove();
    },
  };
}
