"""★ CENTRAL ECONOMY & FORMULA MODULE ★

The single source of truth for EVERY economic constant and formula in the game.
The whole point of the game is inverted: the player WANTS to reach $0, so
"winning" a bet is bad (it grows the balance) and losing feels great.

Design rules for this module:
  * Constants live in ``Economy`` (a BaseSettings) so any of them can be
    overridden with an environment variable during a playtest WITHOUT a redeploy
    or code change. Example: ``ECON_STARTING_BALANCE_CENTS=50000``.
  * Formulas are small, pure, well-documented functions. No DB access, no I/O.
    This keeps them trivially unit-testable and safe to tweak mid-jam.
  * Money is ALWAYS integer cents. Never floats for balances.

Playtesters: see docs/formula-cheatsheet.md for a plain-English guide.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime, time, timezone
from enum import Enum
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

# ---------------------------------------------------------------------------
# Enums shared across modules
# ---------------------------------------------------------------------------


class Direction(str, Enum):
    UP = "UP"
    DOWN = "DOWN"


class TickerKind(str, Enum):
    STOCK = "STOCK"
    CRYPTO = "CRYPTO"


class ItemRarity(str, Enum):
    COMMON = "COMMON"
    RARE = "RARE"
    EPIC = "EPIC"
    LEGENDARY = "LEGENDARY"


# ---------------------------------------------------------------------------
# Tunable constants (env-overridable, prefix ECON_)
# ---------------------------------------------------------------------------


class Economy(BaseSettings):
    """Every knob a playtester might want to turn. Override via ECON_* env vars."""

    model_config = SettingsConfigDict(env_prefix="ECON_", extra="ignore")

    # --- Wallet ---
    STARTING_BALANCE_CENTS: int = 1_000_00  # $X — money each new player starts with
    WIN_TARGET_CENTS: int = 0  # reaching this = you WIN the game (lose all money)

    # --- Beer (consumable: costs money, does nothing — a pure, thematic drain) ---
    BEER_COST_CENTS: int = 1_00  # $1 — price to buy/drink one beer

    # --- Bet sizing ---
    MAX_BET_FRACTION: float = 0.25  # $Y — a single bet may stake at most 25% of balance
    MIN_BET_CENTS: int = 1_00  # smallest allowed stake ($1)

    # --- Market bet outcomes ---
    WIN_MULTIPLIER: float = 2.0  # a "win" doubles the stake (BAD: balance grows)
    BASE_LOSS_PENALTY: float = 0.10  # extra % of stake skimmed on a loss (before the stack)

    # --- Dynamic penalty stack tuning (all multipliers on the base loss) ---
    CROWD_PENALTY_MAX: float = 0.50  # up to +50% when everyone bet your direction
    CHAOS_PENALTY_MAX: float = 0.40  # random chaos adds/removes up to ±40%
    MERCY_PENALTY_MAX: float = 1.00  # catch-up: up to +100% when player is "too rich"
    CRYPTO_VOLATILITY_PENALTY: float = 0.35  # volatile crypto punishes harder than stocks
    STOCK_VOLATILITY_PENALTY: float = 0.10

    # --- Item drops ---
    ITEM_DROP_BASE_RATE: float = 0.03  # base chance per qualifying (losing) market bet
    ITEM_DROP_RISK_BONUS: float = 0.12  # extra chance scaled by how big the bet was

    # --- Casino: roulette max-bet limits scale INVERSELY with bet specificity ---
    # Fraction-of-balance cap per bet type. Specific bets => tiny caps (anti-abuse).
    ROULETTE_LIMIT_COLOR: float = 1.00  # red/black — loosest
    ROULETTE_LIMIT_EVENODD: float = 1.00
    ROULETTE_LIMIT_DOZEN: float = 0.60
    ROULETTE_LIMIT_COLUMN: float = 0.60
    ROULETTE_LIMIT_GREEN: float = 0.20  # betting the single green 0
    ROULETTE_LIMIT_STRAIGHT: float = 0.10  # exact number — tightest cap

    # --- Casino: roulette payouts (house-favoured so player tends to LOSE = stay rich) ---
    # NOTE: because the player wants to lose money, "house edge" here keeps money AWAY
    # from the player over time only on the paradoxical winning side; losing a spin is
    # the desired outcome and simply removes the stake.
    ROULETTE_PAYOUT_COLOR: float = 2.0
    ROULETTE_PAYOUT_DOZEN: float = 3.0
    ROULETTE_PAYOUT_GREEN: float = 36.0
    ROULETTE_PAYOUT_STRAIGHT: float = 36.0


econ = Economy()


# ---------------------------------------------------------------------------
# Curated tickers (the only markets we expose)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MarketHours:
    """Regular trading session for one exchange, in its own local time.

    No holiday calendar (good enough for jam pacing) — just weekday + local
    clock-time gating. ``None`` on a ``TickerSpec`` means "always open" (crypto).
    """

    tz: str  # IANA zone, e.g. "America/New_York"
    open_time: time
    close_time: time


# Reused across tickers that share an exchange.
US_MARKET_HOURS = MarketHours("America/New_York", time(9, 30), time(16, 0))
EURONEXT_AMSTERDAM_HOURS = MarketHours("Europe/Amsterdam", time(9, 0), time(17, 30))
LONDON_STOCK_EXCHANGE_HOURS = MarketHours("Europe/London", time(8, 0), time(16, 30))
ASX_HOURS = MarketHours("Australia/Sydney", time(10, 0), time(16, 0))
HONG_KONG_HOURS = MarketHours("Asia/Hong_Kong", time(9, 30), time(16, 0))


@dataclass(frozen=True)
class TickerSpec:
    symbol: str  # yfinance symbol
    name: str
    kind: TickerKind
    market_hours: MarketHours | None = None  # None = always open (crypto)


CURATED_TICKERS: tuple[TickerSpec, ...] = (
    # --- "Magnificent 7" ---
    TickerSpec("AAPL", "Apple", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("MSFT", "Microsoft", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("GOOGL", "Alphabet", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("AMZN", "Amazon", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("NVDA", "Nvidia", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("META", "Meta Platforms", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("TSLA", "Tesla", TickerKind.STOCK, US_MARKET_HOURS),
    # --- Index ETFs ---
    TickerSpec("SPY", "S&P 500 ETF", TickerKind.STOCK, US_MARKET_HOURS),
    TickerSpec("QQQ", "Nasdaq-100 ETF", TickerKind.STOCK, US_MARKET_HOURS),
    # --- International blue chips (each gated to its home exchange's hours) ---
    TickerSpec("ASML.AS", "ASML Holding", TickerKind.STOCK, EURONEXT_AMSTERDAM_HOURS),
    TickerSpec("AZN.L", "AstraZeneca", TickerKind.STOCK, LONDON_STOCK_EXCHANGE_HOURS),
    TickerSpec("BHP.AX", "BHP Group", TickerKind.STOCK, ASX_HOURS),
    TickerSpec("9988.HK", "Alibaba Group", TickerKind.STOCK, HONG_KONG_HOURS),
    # --- Crypto: always open ---
    TickerSpec("BTC-USD", "Bitcoin", TickerKind.CRYPTO),
    TickerSpec("ETH-USD", "Ethereum", TickerKind.CRYPTO),
)

TICKER_BY_SYMBOL = {t.symbol: t for t in CURATED_TICKERS}


def is_market_open(spec: TickerSpec, now: datetime | None = None) -> bool:
    """Is this ticker's home exchange currently in its regular trading session?

    Crypto (``market_hours is None``) is always open. Everything else is gated
    to Mon-Fri, local-exchange-time regular hours.
    """
    hours = spec.market_hours
    if hours is None:
        return True
    moment = now or datetime.now(timezone.utc)
    local = moment.astimezone(ZoneInfo(hours.tz))
    if local.weekday() >= 5:  # Saturday, Sunday
        return False
    return hours.open_time <= local.time() < hours.close_time

# Allowed bet timeframes in seconds (kept short for jam-paced iteration).
ALLOWED_TIMEFRAMES_S: tuple[int, ...] = (60, 300, 3600)


# ---------------------------------------------------------------------------
# Bet sizing formulas
# ---------------------------------------------------------------------------


def max_bet_cents(balance_cents: int) -> int:
    """Largest stake ($Y) allowed for the current balance."""
    return max(econ.MIN_BET_CENTS, int(balance_cents * econ.MAX_BET_FRACTION))


def is_valid_stake(stake_cents: int, balance_cents: int) -> bool:
    return econ.MIN_BET_CENTS <= stake_cents <= min(balance_cents, max_bet_cents(balance_cents))


# ---------------------------------------------------------------------------
# Dynamic penalty stack — each piece is a small, documented, pure function.
# Every function returns a MULTIPLIER applied on top of the base loss penalty.
# ---------------------------------------------------------------------------


def crowd_penalty(same_direction_ratio: float) -> float:
    """Popularity penalty: the more players bet YOUR way, the harsher the loss.

    ``same_direction_ratio`` in [0, 1] — fraction of recent players who bet the
    same direction. Returns 0..CROWD_PENALTY_MAX.
    """
    ratio = min(max(same_direction_ratio, 0.0), 1.0)
    return ratio * econ.CROWD_PENALTY_MAX


def chaos_penalty(rng: random.Random | None = None) -> float:
    """Random chaos: an unpredictable spike (or occasional relief) on the loss.

    Returns a value in [-CHAOS_PENALTY_MAX, +CHAOS_PENALTY_MAX].
    """
    r = rng or random
    return r.uniform(-econ.CHAOS_PENALTY_MAX, econ.CHAOS_PENALTY_MAX)


def mercy_multiplier(balance_cents: int, starting_cents: int | None = None) -> float:
    """Catch-up mechanic: the richer the player, the harder the loss hits.

    Helps a stuck-with-too-much player drain toward $0 faster. Scales linearly
    from 0 (broke) to MERCY_PENALTY_MAX (at/above the starting balance).
    """
    start = starting_cents if starting_cents is not None else econ.STARTING_BALANCE_CENTS
    if start <= 0:
        return 0.0
    richness = min(max(balance_cents / start, 0.0), 1.0)
    return richness * econ.MERCY_PENALTY_MAX


def volatility_penalty(kind: TickerKind) -> float:
    """Market-cap/volatility scaling: crypto punishes harder than blue-chip stocks."""
    return (
        econ.CRYPTO_VOLATILITY_PENALTY
        if kind == TickerKind.CRYPTO
        else econ.STOCK_VOLATILITY_PENALTY
    )


@dataclass
class PenaltyBreakdown:
    """Transparent record of how a loss penalty was computed (great for UI juice)."""

    base_penalty_cents: int
    crowd_mult: float
    chaos_mult: float
    mercy_mult: float
    volatility_mult: float
    total_penalty_cents: int


def compute_loss_penalty(
    stake_cents: int,
    balance_cents: int,
    kind: TickerKind,
    same_direction_ratio: float,
    rng: random.Random | None = None,
) -> PenaltyBreakdown:
    """Compose the full dynamic penalty stack for a LOST market bet.

    The player loses the stake (handled by the caller) PLUS this extra penalty.
    Extra penalty = base_penalty * (1 + crowd + chaos + mercy + volatility),
    floored at 0 so chaos relief can't turn a loss into a gain.
    """
    base = int(stake_cents * econ.BASE_LOSS_PENALTY)
    crowd = crowd_penalty(same_direction_ratio)
    chaos = chaos_penalty(rng)
    mercy = mercy_multiplier(balance_cents)
    vol = volatility_penalty(kind)

    multiplier = max(0.0, 1.0 + crowd + chaos + mercy + vol)
    total = int(base * multiplier)
    return PenaltyBreakdown(
        base_penalty_cents=base,
        crowd_mult=crowd,
        chaos_mult=chaos,
        mercy_mult=mercy,
        volatility_mult=vol,
        total_penalty_cents=total,
    )


# ---------------------------------------------------------------------------
# Market bet resolution
# ---------------------------------------------------------------------------


@dataclass
class MarketResolution:
    won: bool  # did the player's direction match? (winning is BAD for them)
    balance_delta_cents: int  # signed change to apply to the wallet
    payout_cents: int  # gross credited on a win (0 on loss)
    penalty_cents: int  # extra skimmed on a loss (0 on win)
    penalty: PenaltyBreakdown | None


def direction_from_prices(start_price: float, end_price: float) -> Direction:
    """UP if the price rose (or was flat), else DOWN."""
    return Direction.UP if end_price >= start_price else Direction.DOWN


def resolve_market_bet(
    *,
    stake_cents: int,
    balance_cents: int,
    direction: Direction,
    start_price: float,
    end_price: float,
    kind: TickerKind,
    same_direction_ratio: float,
    rng: random.Random | None = None,
) -> MarketResolution:
    """Resolve a timed market bet into a signed wallet delta.

    WIN  (direction matches actual move): balance += stake * (WIN_MULTIPLIER - 1)
         i.e. the stake doubles. This is the *undesirable* outcome.
    LOSS (direction wrong): balance -= stake + dynamic penalty.
    """
    actual = direction_from_prices(start_price, end_price)
    won = direction == actual

    if won:
        gain = int(stake_cents * (econ.WIN_MULTIPLIER - 1.0))
        return MarketResolution(
            won=True,
            balance_delta_cents=+gain,
            payout_cents=stake_cents + gain,
            penalty_cents=0,
            penalty=None,
        )

    breakdown = compute_loss_penalty(
        stake_cents=stake_cents,
        balance_cents=balance_cents,
        kind=kind,
        same_direction_ratio=same_direction_ratio,
        rng=rng,
    )
    total_loss = stake_cents + breakdown.total_penalty_cents
    return MarketResolution(
        won=False,
        balance_delta_cents=-total_loss,
        payout_cents=0,
        penalty_cents=breakdown.total_penalty_cents,
        penalty=breakdown,
    )


# ---------------------------------------------------------------------------
# Item drops
# ---------------------------------------------------------------------------


def item_drop_chance(stake_cents: int, balance_cents: int) -> float:
    """Chance a losing bet drops a rare item, scaled by how risky the bet was."""
    risk = min(max(stake_cents / max(balance_cents, 1), 0.0), 1.0)
    return min(1.0, econ.ITEM_DROP_BASE_RATE + risk * econ.ITEM_DROP_RISK_BONUS)


def roll_item_drop(
    stake_cents: int, balance_cents: int, rng: random.Random | None = None
) -> bool:
    r = rng or random
    return r.random() < item_drop_chance(stake_cents, balance_cents)


# Rarity weights used when a drop occurs (higher = more common).
ITEM_RARITY_WEIGHTS: dict[ItemRarity, float] = {
    ItemRarity.COMMON: 60.0,
    ItemRarity.RARE: 28.0,
    ItemRarity.EPIC: 10.0,
    ItemRarity.LEGENDARY: 2.0,
}


def roll_item_rarity(rng: random.Random | None = None) -> ItemRarity:
    r = rng or random
    rarities = list(ITEM_RARITY_WEIGHTS.keys())
    weights = list(ITEM_RARITY_WEIGHTS.values())
    return r.choices(rarities, weights=weights, k=1)[0]


# ---------------------------------------------------------------------------
# Casino: Roulette
# ---------------------------------------------------------------------------


class RouletteBetType(str, Enum):
    COLOR = "COLOR"  # red / black
    EVENODD = "EVENODD"
    DOZEN = "DOZEN"  # 1-12 / 13-24 / 25-36
    COLUMN = "COLUMN"
    GREEN = "GREEN"  # the single 0
    STRAIGHT = "STRAIGHT"  # exact number


_ROULETTE_LIMIT_MAP = {
    RouletteBetType.COLOR: "ROULETTE_LIMIT_COLOR",
    RouletteBetType.EVENODD: "ROULETTE_LIMIT_EVENODD",
    RouletteBetType.DOZEN: "ROULETTE_LIMIT_DOZEN",
    RouletteBetType.COLUMN: "ROULETTE_LIMIT_COLUMN",
    RouletteBetType.GREEN: "ROULETTE_LIMIT_GREEN",
    RouletteBetType.STRAIGHT: "ROULETTE_LIMIT_STRAIGHT",
}

_ROULETTE_PAYOUT_MAP = {
    RouletteBetType.COLOR: "ROULETTE_PAYOUT_COLOR",
    RouletteBetType.EVENODD: "ROULETTE_PAYOUT_COLOR",
    RouletteBetType.DOZEN: "ROULETTE_PAYOUT_DOZEN",
    RouletteBetType.COLUMN: "ROULETTE_PAYOUT_DOZEN",
    RouletteBetType.GREEN: "ROULETTE_PAYOUT_GREEN",
    RouletteBetType.STRAIGHT: "ROULETTE_PAYOUT_STRAIGHT",
}


def roulette_max_bet_cents(bet_type: RouletteBetType, balance_cents: int) -> int:
    """Anti-abuse: the more specific the bet, the lower the max stake allowed."""
    fraction = getattr(econ, _ROULETTE_LIMIT_MAP[bet_type])
    return max(econ.MIN_BET_CENTS, int(balance_cents * fraction))


def roulette_payout_multiplier(bet_type: RouletteBetType) -> float:
    return getattr(econ, _ROULETTE_PAYOUT_MAP[bet_type])


# European wheel: 0 green, reds are the standard set.
RED_NUMBERS = frozenset(
    {1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36}
)


def spin_roulette(rng: random.Random | None = None) -> int:
    r = rng or random
    return r.randint(0, 36)


def roulette_is_win(bet_type: RouletteBetType, pocket: int, selection: int | str | None) -> bool:
    """Did this bet hit? (Hitting pays out = balance grows = bad for the player.)"""
    if bet_type == RouletteBetType.GREEN:
        return pocket == 0
    if pocket == 0:
        return False  # green swallows all outside bets
    if bet_type == RouletteBetType.STRAIGHT:
        return isinstance(selection, int) and pocket == selection
    if bet_type == RouletteBetType.COLOR:
        is_red = pocket in RED_NUMBERS
        return (selection == "RED" and is_red) or (selection == "BLACK" and not is_red)
    if bet_type == RouletteBetType.EVENODD:
        return (selection == "EVEN" and pocket % 2 == 0) or (
            selection == "ODD" and pocket % 2 == 1
        )
    if bet_type == RouletteBetType.DOZEN:
        dozen = (pocket - 1) // 12  # 0,1,2
        return selection == dozen
    if bet_type == RouletteBetType.COLUMN:
        column = (pocket - 1) % 3  # 0,1,2
        return selection == column
    return False


# ---------------------------------------------------------------------------
# Casino: Slots (3-reel, tuned for juice)
# ---------------------------------------------------------------------------


class SlotSymbol(str, Enum):
    CHERRY = "CHERRY"
    LEMON = "LEMON"
    BELL = "BELL"
    STAR = "STAR"
    SEVEN = "SEVEN"
    SKULL = "SKULL"  # the "jackpot" — pays the most (worst, since you gain money)


# Weights: higher = appears more often. Skull is rare so the big (bad) win is rare.
SLOT_REEL_WEIGHTS: dict[SlotSymbol, float] = {
    SlotSymbol.CHERRY: 25.0,
    SlotSymbol.LEMON: 25.0,
    SlotSymbol.BELL: 20.0,
    SlotSymbol.STAR: 20.0,
    SlotSymbol.SEVEN: 5.0,
    SlotSymbol.SKULL: 5.0,
}

# Payout multiplier for three-of-a-kind (applied to the stake). Winning grows balance.
SLOT_THREE_OF_A_KIND_PAYOUT: dict[SlotSymbol, float] = {
    SlotSymbol.CHERRY: 2.0,
    SlotSymbol.LEMON: 2.0,
    SlotSymbol.BELL: 4.0,
    SlotSymbol.STAR: 4.0,
    SlotSymbol.SEVEN: 10.0,
    SlotSymbol.SKULL: 10.0,
}
SLOT_TWO_OF_A_KIND_PAYOUT: float = 1.5  # any pair returns a small multiple

SLOT_MIN_REELS = 3
SLOT_MAX_REELS = 5

# On 5 reels a pair is nearly guaranteed by the birthday paradox, so the
# two-of-a-kind payout is dropped there to keep it a genuine loss.
SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS: frozenset[int] = frozenset({5})


def spin_slots(reels: int = 3, rng: random.Random | None = None) -> list[SlotSymbol]:
    r = rng or random
    symbols = list(SLOT_REEL_WEIGHTS.keys())
    weights = list(SLOT_REEL_WEIGHTS.values())
    return r.choices(symbols, weights=weights, k=reels)


def slots_payout_cents(reels: list[SlotSymbol], stake_cents: int) -> int:
    """Gross payout for a spin (0 = the desired losing outcome).

    Three of a kind pays the symbol multiple; any pair pays the small multiple
    (except on reel counts in ``SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS``).
    """
    counts: dict[SlotSymbol, int] = {}
    for s in reels:
        counts[s] = counts.get(s, 0) + 1
    top = max(counts.values())
    if top >= 3:
        symbol = next(s for s, c in counts.items() if c >= 3)
        return int(stake_cents * SLOT_THREE_OF_A_KIND_PAYOUT[symbol])
    if top == 2 and len(reels) not in SLOT_TWO_OF_A_KIND_DISABLED_REEL_COUNTS:
        return int(stake_cents * SLOT_TWO_OF_A_KIND_PAYOUT)
    return 0


@dataclass(frozen=True)
class SlotSymbolInfo:
    """One row of the slots paytable, for describing the game to the player."""

    symbol: SlotSymbol
    weight: float
    three_of_a_kind_payout: float


def slots_paytable() -> list[SlotSymbolInfo]:
    """Full paytable, symbol-by-symbol, in enum declaration order."""
    return [
        SlotSymbolInfo(
            symbol=symbol,
            weight=SLOT_REEL_WEIGHTS[symbol],
            three_of_a_kind_payout=SLOT_THREE_OF_A_KIND_PAYOUT[symbol],
        )
        for symbol in SlotSymbol
    ]
