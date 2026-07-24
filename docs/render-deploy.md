# Render.com Deployment

Everything is declared in [`render.yaml`](../render.yaml) (Infrastructure-as-Code).

## Services created by the Blueprint

| Service | Type | Notes |
|---------|------|-------|
| `lose-lose-db` | Managed Postgres | connection string injected via `fromDatabase` |
| `lose-lose-rabbitmq` | Private service (Docker) | `rabbitmq:3-management`, persistent 1GB disk at `/var/lib/rabbitmq` |
| `lose-lose-api` | Web service (Docker) | `backend/Dockerfile`, health check `/health` |
| `lose-lose-worker` | Background worker (Docker) | `backend/Dockerfile.worker` |

## Environment wiring

- **Shared group `lose-lose-shared`**: `JWT_SECRET` (generated), `ENVIRONMENT`,
  `MARKET_PROVIDER`. Imported by both api and worker.
- **Database**: `DATABASE_URL` from `fromDatabase` (a bare `postgresql://` URL).
  `settings.py` rewrites the driver to `postgresql+asyncpg://` at load.
- **RabbitMQ**: the stock image doesn't export a connection URL, so consumers get
  the parts and assemble the AMQP URL in `settings.py`:
  - `RABBITMQ_HOST` ← broker `hostport` (`.internal`)
  - `RABBITMQ_USER` ← broker `RABBITMQ_DEFAULT_USER`
  - `RABBITMQ_PASSWORD` ← broker `RABBITMQ_DEFAULT_PASS` (generated)
- **CORS**: set `CORS_ORIGINS` on `lose-lose-api` to your deployed frontend origin
  (`sync: false`, so you set it in the dashboard).

All of the above stays on Render's private network.

## First deploy

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo. It reads `render.yaml`.
3. Approve the plan; Render provisions db, rabbitmq, api, worker.
4. **Run migrations** once: from the `lose-lose-api` shell (or a one-off job):
   ```bash
   alembic upgrade head
   python -m app.scripts.seed
   ```
5. Hit `https://<api>.onrender.com/health` → `{"status":"ok"}`.

## Validating the Blueprint locally

```bash
make render-validate     # needs the Render CLI
```

## Free-tier notes

- The `free` Postgres/web plans sleep on inactivity — fine for a jam demo; the
  worker (`starter`) stays warm so timed bets keep resolving.
- yfinance needs no API key. To switch to Finnhub, set `MARKET_PROVIDER=finnhub`
  and add `FINNHUB_API_KEY` to the shared env group.
