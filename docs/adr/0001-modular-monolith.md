# ADR 0001 — Modular monolith + one worker (not microservices)

**Status:** Accepted · **Date:** 2026-07-24

## Context

The brief described a fleet of microservices (per-concern services) on Render
with RabbitMQ. This is a game-jam project where velocity and easy iteration
matter more than independent scaling.

## Decision

Ship a **modular monolith**: one FastAPI web service + one background worker +
Postgres + RabbitMQ. Each game module lives in its own package
(`app/modules/<name>`) with its own router/service/schemas, so the code reads
like microservices and can be split later — but there's one deployable to run,
debug, and reason about.

## Consequences

- **+** Far less infra to babysit during the jam; one image to build, one log
  stream per role, trivial local `docker compose up`.
- **+** RabbitMQ is still real (async bet resolution runs in a true worker), so
  we keep the architecture the brief wanted without the operational tax.
- **+** Module boundaries are preserved, so extraction into separate services
  later is mechanical.
- **−** No independent per-module scaling. Acceptable at jam scale; revisit if a
  single module becomes a hotspot.
