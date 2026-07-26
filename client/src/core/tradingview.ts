// Purely decorative price charts, embedded via TradingView's free widget (no
// API key, no backend involvement). Each mapped symbol is the exact instrument
// the backend prices from — never a different exchange/ADR — so the chart
// never shows a number that disagrees with the price a bet actually resolves
// against. Anything unmapped (or that fails to load) falls back to plain text
// instead of a broken iframe.

import { css, font } from './theme';

const SYMBOL_MAP: Record<string, string> = {
  AAPL: 'NASDAQ:AAPL',
  MSFT: 'NASDAQ:MSFT',
  GOOGL: 'NASDAQ:GOOGL',
  AMZN: 'NASDAQ:AMZN',
  NVDA: 'NASDAQ:NVDA',
  META: 'NASDAQ:META',
  TSLA: 'NASDAQ:TSLA',
  SPY: 'AMEX:SPY',
  QQQ: 'NASDAQ:QQQ',
  'ASML.AS': 'EURONEXT:ASML',
  'AZN.L': 'LSE:AZN',
  'BHP.AX': 'ASX:BHP',
  '9988.HK': 'HKEX:9988',
  'BTC-USD': 'COINBASE:BTCUSD',
  'ETH-USD': 'COINBASE:ETHUSD',
};

const WIDGET_SRC = 'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js';
// Generous — with a dozen-plus widgets mounting around the same time, each one
// queues behind the browser's per-host connection limit, so "hasn't finished
// yet" is normal, not a failure. This is a ceiling for genuinely stuck loads,
// not a deadline for a healthy one.
const LOAD_TIMEOUT_MS = 15_000;
// Spread simultaneous mounts out so they don't all fight over the same
// connection slots at once (the actual cause of every chart timing out
// together rather than loading a little slower).
const MOUNT_STAGGER_MS = 150;

function showFallback(container: HTMLElement): void {
  const div = document.createElement('div');
  div.textContent = 'chart unavailable';
  div.style.cssText =
    'width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
    `color:${css.creamDim};font-family:${font.ui};font-size:11px;font-style:italic;`;
  container.appendChild(div);
}

// Mounts a mini chart into `container` for `ourSymbol`. `slot` staggers the
// start time across many simultaneous rows (see MOUNT_STAGGER_MS). Returns a
// teardown function that removes whatever got mounted (widget or fallback).
export function mountMiniChart(container: HTMLElement, ourSymbol: string, slot = 0): () => void {
  const tvSymbol = SYMBOL_MAP[ourSymbol];
  if (!tvSymbol) {
    showFallback(container);
    return () => { container.innerHTML = ''; };
  }

  let disposed = false;
  const startTimer = window.setTimeout(() => {
    if (disposed) return;
    startWidget(container, tvSymbol);
  }, slot * MOUNT_STAGGER_MS);

  let innerTeardown: (() => void) | null = null;
  return () => {
    disposed = true;
    window.clearTimeout(startTimer);
    innerTeardown?.();
  };

  function startWidget(target: HTMLElement, symbol: string): void {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;';
    target.appendChild(wrap);

    let settled = false;
    const observer = new MutationObserver(() => {
      if (settled || !wrap.querySelector('iframe')) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
    });
    observer.observe(wrap, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      wrap.remove();
      showFallback(target);
    }, LOAD_TIMEOUT_MS);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = WIDGET_SRC;
    script.async = true;
    script.onerror = () => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      wrap.remove();
      showFallback(target);
    };
    script.text = JSON.stringify({
      symbol,
      width: '100%',
      height: '100%',
      locale: 'en',
      dateRange: '1D',
      colorTheme: 'dark',
      isTransparent: true,
      autosize: true,
    });
    wrap.appendChild(script);

    innerTeardown = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      wrap.remove();
    };
  }
}
