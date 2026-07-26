# API Reference

Base URL: `/api/v1`. Interactive docs at `/docs` (Swagger) when running.
Auth is **JWT bearer** — send `Authorization: Bearer <token>`. All money is
**integer cents**.

> A bet's `status` is named from the **house's** point of view: `WON` means the
> bet paid out, which grows the balance and is therefore the *bad* outcome for
> the player. See [CONTEXT.md](../CONTEXT.md).

## Auth

### `POST /auth/guest`
One-tap guest wallet, seeded with the starting balance. No body.
```json
→ 200 { "access_token": "...", "token_type": "bearer",
        "user": { "id": "...", "username": null, "is_guest": true,
                  "balance_cents": 100000, "total_lost_cents": 0,
                  "bets_count": 0, "has_won": false } }
```

### `POST /auth/register` · `POST /auth/login`
```json
← { "username": "player1", "password": "hunter2" }
→ 201/200 (same TokenOut shape as above)
```
`register` → 409 if the username is taken. `login` → 401 on bad credentials.

### `GET /me`  *(auth)*
Current wallet + active inventory.
```json
→ 200 { ...UserOut, "inventory": [
          { "item_key": "cursed_coin", "name": "Cursed Coin", "rarity": "EPIC",
            "effect_type": "LOSS_MULT", "magnitude": 0.5, "active": true } ] }
```

## Market (Bet365)

### `GET /market/tickers`
The 15 curated tickers with live prices, fetched concurrently. A failed provider
lookup returns `last_price: null` rather than failing the list. `is_open` reports
whether the ticker's **home exchange** is in its regular session — crypto is
always open; stocks are gated to weekday local hours (NYSE, Euronext Amsterdam,
LSE, ASX, HKEX). Bets on a closed ticker are rejected with 400.
```json
→ 200 [ { "symbol": "AAPL", "name": "Apple", "kind": "STOCK",
          "last_price": 224.31, "is_open": true },
        { "symbol": "BTC-USD", "name": "Bitcoin", "kind": "CRYPTO",
          "last_price": 61234.5, "is_open": true } ]
```

### `POST /market/bets`  *(auth)*
Place a timed UP/DOWN bet. Validated against `max_bet` and allowed timeframes
(60 / 300 / 3600 s). Publishes `bet.market.placed`; the worker resolves it.
```json
← { "ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 5000, "timeframe_s": 60 }
→ 201 { "id": "...", "ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 5000,
        "start_price": 61234.5, "resolve_at": "...", "status": "PENDING", ... }
```
Errors: 400 (validation — unknown ticker, **market closed**, bad timeframe, stake
outside the allowed range, or **one open bet per symbol**: a second bet on a
ticker you already have `PENDING` is rejected), 503 (market data unavailable).

### `GET /market/offers`  *(auth)*
Every curated ticker plus the **item bounty pinned to it** — one request for the
whole grid rather than one per tile. The reward is rolled and persisted *before*
the player bets, so a tile can name its prize while the stake is still a choice.

Re-reading never re-rolls: an offer the player has already seen is a promise.
It re-rolls only when a bet on that ticker resolves, so one attempt buys exactly
one reroll. `pending_bet_id` is non-null while a bet is chasing it.

`chips_cents` is the player's stake ladder, already scaled by any `STAKE_MULT`
item — the client renders this rather than keeping its own copy, because a chip
above the wallet goes **all-in** and that exemption has to be server-checked.
`reward_stake_gate_cents` is the minimum stake a losing bet must risk to
actually earn the item.
```json
→ 200 [ { "symbol": "BTC-USD", "name": "Bitcoin", "kind": "CRYPTO",
          "last_price": 61204.0, "is_open": true,
          "reward_item": { "key": "black_cat", "name": "Black Cat",
                           "rarity": "RARE", "effect_type": "ANTI_LUCK",
                           "magnitude": 0.1, "duration_s": 1800,
                           "art_key": "item_black_cat" },
          "reward_stake_gate_cents": 5000, "pending_bet_id": null,
          "chips_cents": [100, 1000, 5000, 10000] } ]
```
A ticker with no bounty this cycle returns `reward_item: null` (the client draws
an empty socket). A per-ticker price failure yields `last_price: null` rather
than failing the whole grid.

### `GET /market/bets`  *(auth)*
The caller's market bets, newest-resolving first. Optional `?status=PENDING`
filter (case-insensitive; invalid value → 400). This is the client's source of
truth for open bets — the background poll manager rehydrates from it after a
reload. Returns a list of the same shape as `GET /market/bets/{bet_id}`.
```json
→ 200 [ { "id": "...", "ticker": "BTC-USD", "status": "PENDING", "resolve_at": "...", ... } ]
```

### `GET /market/bets/{bet_id}`  *(auth)*
Poll until `status` flips to `WON`/`LOST`. `result_detail` carries the full
penalty breakdown + any item drop (great for frontend juice).
```json
→ 200 { "status": "LOST", "end_price": 60900.0, "penalty_cents": 780,
        "result_detail": { "won": false, "balance_delta_cents": -5780,
          "penalty": { "base": 500, "crowd_mult": 0.33, "chaos_mult": -0.12,
                       "mercy_mult": 0.9, "volatility_mult": 0.35 },
          "item_drop": { "key": "black_cat", "name": "Black Cat", "rarity": "RARE" } } }
```

## Casino (instant)

### `GET /casino/slots/info`
Public paytable — **no auth**. The client's slot info panel renders this rather
than hardcoding the economy. `two_of_a_kind_disabled_reel_counts` lists the reel
counts where a bare pair never pays (see the
[formula cheatsheet](formula-cheatsheet.md#slots)).
```json
→ 200 { "min_reels": 3, "max_reels": 5,
        "symbols": [ { "symbol": "CHERRY", "weight": 25.0, "three_of_a_kind_payout": 2.0 },
                     { "symbol": "SKULL",  "weight": 9.0,  "three_of_a_kind_payout": 10.0 } ],
        "two_of_a_kind_payout": 1.5,
        "two_of_a_kind_disabled_reel_counts": [5] }
```

### `POST /casino/roulette`  *(auth)*
`selection` depends on `bet_type`: `COLOR`→"RED"/"BLACK", `EVENODD`→"EVEN"/"ODD",
`DOZEN`/`COLUMN`→0|1|2, `STRAIGHT`→0..36, `GREEN`→null. The stake cap tightens as
the bet gets more specific.
```json
← { "bet_type": "STRAIGHT", "selection": 7, "stake_cents": 2000 }
→ 200 { "id": "...", "stake_cents": 2000, "status": "LOST", "payout_cents": 0,
        "result_detail": { "game": "roulette", "pocket": 22, "won": false, "net_cents": -2000 } }
```

### `POST /casino/slots/spin`  *(auth)*
```json
← { "stake_cents": 1000, "reels": 3 }
→ 200 { "status": "LOST", "payout_cents": 0,
        "result_detail": { "game": "slots", "reels": ["CHERRY","LEMON","BELL"],
                           "payout_cents": 0, "net_cents": -1000 } }
```

`POST /casino/slots/spin` takes `reels` between 3 and 5 (default 3).

Errors across casino: 400 (stake below min / above balance / above type cap).

## Beer

### `POST /beer/buy`  *(auth)*
Buy and drink one beer: a fixed-price drain with no payout and no bet row. **No
body.** The response carries the authoritative wallet, so the client merges it
instead of re-reading `/me`.

`cost_cents` is normally `ECON_BEER_COST_CENTS` ($1), but a wallet holding less
than that pays **whatever is left** — the last-call rule, so the final beer can
always finish a run at exactly $0.
```json
→ 200 { "cost_cents": 100, "balance_cents": 4300,
        "total_lost_cents": 95700, "has_won": false }
```
Errors: 400 (insufficient funds — an empty wallet has nothing left to drink to).

## Meta

- `GET /health` → `{ "status": "ok", "environment": "local" }`
