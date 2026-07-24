# Lose-Lose Situation — Documentation

A game where the objective is to **lose all your money**. Every mechanic is
inverted: "winning" a bet grows your balance (bad), losing feels great, and
reaching **$0 wins the game**.

## Index

| Doc | What's inside |
|-----|---------------|
| [architecture.md](architecture.md) | Service topology, RabbitMQ queues, worker loop |
| [render-deploy.md](render-deploy.md) | Deploying the Blueprint to Render.com |
| [db-schema.md](db-schema.md) | Tables, columns, relationships |
| [api-reference.md](api-reference.md) | Every endpoint with example payloads |
| [formula-cheatsheet.md](formula-cheatsheet.md) | ★ Every economy knob for playtesters |
| [asset-list.md](asset-list.md) | Art + audio production checklist |
| [roadmap.md](roadmap.md) | Phased delivery plan + current status |
| [adr/](adr/) | Architecture Decision Records |

## Quickstart (local)

```bash
cp .env.example .env         # optional; compose injects its own env
make up-local                # api + worker + postgres + rabbitmq
make migrate                 # apply DB schema
make seed                    # load the droppable item catalog
# API docs: http://localhost:8000/docs
# RabbitMQ UI: http://localhost:15672  (guest/guest)
make test                    # run the backend test suite
```

## What's built

- **Backend (Phases 1–3):** FastAPI monolith + RabbitMQ worker, JWT + guest auth,
  the Bet365 market module (real yfinance prices, async worker resolution, dynamic
  penalty stack, item drops) and the Casino module (roulette + slots, instant).
  24 tests passing (formulas, economy simulation, HTTP integration).
- **Frontend (Phase 4):** engine deferred — see [adr/0003](adr/0003-frontend-engine.md).
