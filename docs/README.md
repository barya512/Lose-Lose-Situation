# Documentation Index

A game where the objective is to **lose all your money**. Every mechanic is
inverted: "winning" a bet grows your balance (bad), losing feels great, and
reaching **$0 wins the game**.

Project overview and quickstart: [../README.md](../README.md).
The vocabulary for everything below — bet vs machine, reward vs punish, run,
stake, last call — is pinned in [CONTEXT.md](../CONTEXT.md).

## Getting Started

| Doc | What's inside |
|-----|---------------|
| [getting-started.md](getting-started.md) | ★ Run the backend + Phaser client, play every screen, test, build for itch, shut down, troubleshoot |

## Architecture

| Doc | What's inside |
|-----|---------------|
| [architecture.md](architecture.md) | Backend: modules, service topology, RabbitMQ queues, worker resolution |
| [client-architecture.md](client-architecture.md) | Client: scene flow, coordinate space, theme tokens, module map, art pipeline |
| [db-schema.md](db-schema.md) | Tables, columns, indexes, relationships |
| [adr/](adr/) | Architecture Decision Records — the immutable "why" behind the big calls |

## Reference

| Doc | What's inside |
|-----|---------------|
| [api-reference.md](api-reference.md) | Every endpoint with example payloads |
| [formula-cheatsheet.md](formula-cheatsheet.md) | ★ Every economy knob, in plain English, for playtesters |
| [asset-list.md](asset-list.md) | Art + audio production checklist |

## Development

| Doc | What's inside |
|-----|---------------|
| [deployment.md](deployment.md) | Deploying the Blueprint to Render.com |
| [roadmap.md](roadmap.md) | Phased delivery plan + current status |
| [archive/](archive/) | Superseded design records — implemented, kept for their decision rationale |

## Decision records

| ADR | Decision |
|-----|----------|
| [0001](adr/0001-modular-monolith.md) | Modular monolith + one worker, not microservices |
| [0002](adr/0002-money-as-cents.md) | Money is integer cents everywhere |
| [0003](adr/0003-frontend-engine.md) | Phaser 3, HTML5-only, hosted backend |
| [0004](adr/0004-click-requires-matching-press.md) | A click requires a matching press |
| [0005](adr/0005-canvas-baked-token-driven-theme.md) | Canvas-baked art + a boot-time font gate |
| [0006](adr/0006-2x-render-scale.md) | Render at 2×, author at 720p |
