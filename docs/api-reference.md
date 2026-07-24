# API Reference

Base URL: `/api/v1`. Interactive docs at `/docs` (Swagger) when running.
Auth is **JWT bearer** — send `Authorization: Bearer <token>`. All money is
**integer cents**.

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
Curated set with live prices (a failed provider lookup returns `last_price: null`
rather than failing the list).
```json
→ 200 [ { "symbol": "AAPL", "name": "Apple", "kind": "STOCK", "last_price": 224.31 },
        { "symbol": "BTC-USD", "name": "Bitcoin", "kind": "CRYPTO", "last_price": 61234.5 } ]
```

### `POST /market/bets`  *(auth)*
Place a timed UP/DOWN bet. Validated against `max_bet` and allowed timeframes
(60 / 300 / 3600 s). Publishes `bet.market.placed`; the worker resolves it.
```json
← { "ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 5000, "timeframe_s": 60 }
→ 201 { "id": "...", "ticker": "BTC-USD", "direction": "DOWN", "stake_cents": 5000,
        "start_price": 61234.5, "resolve_at": "...", "status": "PENDING", ... }
```
Errors: 400 (validation), 503 (market data unavailable).

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

Errors across casino: 400 (stake below min / above balance / above type cap).

## Meta

- `GET /health` → `{ "status": "ok", "environment": "local" }`
