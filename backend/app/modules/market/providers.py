"""Market price providers behind a small protocol.

``yfinance`` is the primary (no API key); ``Finnhub`` is an adapter selected via
``MARKET_PROVIDER``. A short-TTL in-memory cache shields us from provider rate
limits when a playtest crowd hammers the same tickers.

yfinance is a synchronous library, so its calls run in a thread executor to
avoid blocking the FastAPI event loop.
"""

from __future__ import annotations

import asyncio
import time
from typing import Protocol

import httpx

from app.settings import settings


class PriceProvider(Protocol):
    async def get_price(self, symbol: str) -> float: ...


# --- tiny TTL cache ---------------------------------------------------------

_cache: dict[str, tuple[float, float]] = {}  # symbol -> (price, fetched_at)


def _cache_get(symbol: str) -> float | None:
    entry = _cache.get(symbol)
    if entry is None:
        return None
    price, fetched_at = entry
    if time.monotonic() - fetched_at > settings.market_cache_ttl_s:
        return None
    return price


def _cache_put(symbol: str, price: float) -> None:
    _cache[symbol] = (price, time.monotonic())


# --- providers --------------------------------------------------------------


class YFinanceProvider:
    """Primary provider. Uses yfinance in a thread to stay non-blocking."""

    async def get_price(self, symbol: str) -> float:
        cached = _cache_get(symbol)
        if cached is not None:
            return cached
        price = await asyncio.to_thread(self._fetch_sync, symbol)
        _cache_put(symbol, price)
        return price

    @staticmethod
    def _fetch_sync(symbol: str) -> float:
        import yfinance as yf  # imported lazily so tests/imports don't need it

        ticker = yf.Ticker(symbol)
        # fast_info is the lightest call; fall back to recent history if needed.
        price = getattr(ticker.fast_info, "last_price", None)
        if price is None:
            hist = ticker.history(period="1d", interval="1m")
            if hist.empty:
                raise ProviderError(f"no price data for {symbol}")
            price = float(hist["Close"].iloc[-1])
        return float(price)


class FinnhubProvider:
    """Adapter for Finnhub's free quote endpoint (requires FINNHUB_API_KEY)."""

    _URL = "https://finnhub.io/api/v1/quote"

    async def get_price(self, symbol: str) -> float:
        cached = _cache_get(symbol)
        if cached is not None:
            return cached
        if not settings.finnhub_api_key:
            raise ProviderError("FINNHUB_API_KEY not configured")
        # Finnhub uses e.g. BINANCE:BTCUSDT for crypto; map curated symbols as needed.
        params = {"symbol": symbol.replace("-USD", "USDT"), "token": settings.finnhub_api_key}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(self._URL, params=params)
            resp.raise_for_status()
            price = float(resp.json()["c"])  # current price
        if price <= 0:
            raise ProviderError(f"no price data for {symbol}")
        _cache_put(symbol, price)
        return price


class ProviderError(RuntimeError):
    pass


def get_provider() -> PriceProvider:
    if settings.market_provider == "finnhub":
        return FinnhubProvider()
    return YFinanceProvider()
