# Lose-Lose Situation

A game where the objective is to **lose all your money**. Every mechanic is
inverted: "winning" a bet grows your balance (bad), losing feels great, and
reaching **$0 wins the game**.

> **Read this before touching the code.** A bet's `status` is named from the
> **house's** point of view — `WON` means the bet paid out, so `WON` is the
> *punishing* outcome for the player. The juice is named from the *player's*:
> `reward` marks a balance that went **down**. Getting this backwards is the
> single most common bug in the project. The full vocabulary is pinned in
> [CONTEXT.md](CONTEXT.md).

## Stack

| Piece | What |
|-------|------|
| Backend | FastAPI modular monolith + one async worker, Python 3.12 |
| Data | PostgreSQL (SQLAlchemy v2 async, Alembic), RabbitMQ (topic exchange) |
| Client | Phaser 3 + Vite + TypeScript, HTML5-only (itch.io target) |
| Deploy | Render.com Blueprint (`render.yaml`); local via docker-compose |

Modules live under `backend/app/modules/` — **market** (timed UP/DOWN bets on real
yfinance prices, resolved by the worker), **casino** (slots + roulette, instant),
**beer** (a pure thematic drain). Polls and sports are stretch modules with the
schema already in place.

## Quickstart

```bash
# 1. Backend — api + worker + postgres + rabbitmq
make up-local
make migrate                    # apply the DB schema (Alembic)
make seed                       # load the droppable item catalog
#    API docs   http://localhost:8000/docs
#    RabbitMQ   http://localhost:15672  (guest/guest)

# 2. Client
cd client
npm install                     # first run only
npm run dev                     # http://localhost:5173
```

Then **PLAY AS GUEST** for a fresh $1,000 wallet and start losing it. Full walk-
through, build and troubleshooting steps: [docs/getting-started.md](docs/getting-started.md).

```bash
make test                       # backend suite (pytest)
cd client && npm run test       # client suite (vitest)
```

## Documentation

| | Doc | What's inside |
|---|-----|---------------|
| **Start here** | [CONTEXT.md](CONTEXT.md) | The domain glossary — bet vs machine, reward vs punish, run, stake, last call |
| | [docs/getting-started.md](docs/getting-started.md) | Run the stack and the client, play, test, build for itch, shut down |
| **Architecture** | [docs/architecture.md](docs/architecture.md) | Backend topology, RabbitMQ queues, worker resolution |
| | [docs/client-architecture.md](docs/client-architecture.md) | Scene flow, theme tokens, module map, art pipeline |
| | [docs/db-schema.md](docs/db-schema.md) | Tables, columns, indexes |
| **Reference** | [docs/api-reference.md](docs/api-reference.md) | Every endpoint with example payloads |
| | [docs/formula-cheatsheet.md](docs/formula-cheatsheet.md) | Every economy knob, in plain English |
| | [docs/asset-list.md](docs/asset-list.md) | Art + audio production checklist |
| **Development** | [docs/deployment.md](docs/deployment.md) | Deploying the Blueprint to Render.com |
| | [docs/roadmap.md](docs/roadmap.md) | Phased delivery plan + current status |
| | [docs/adr/](docs/adr/) | Architecture Decision Records |

The full index, including the archive of superseded design records, is in
[docs/README.md](docs/README.md).
