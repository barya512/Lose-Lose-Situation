# Lose-Lose Situation — developer entrypoints.
# Local orchestration uses docker-compose; Render uses render.yaml.

.PHONY: help up-local down-local logs build migrate revision seed test lint fmt render-validate

help:
	@echo "Targets:"
	@echo "  up-local        Build & start the full local stack (api, worker, db, rabbitmq)"
	@echo "  down-local      Stop the stack (keep volumes)"
	@echo "  logs            Tail all service logs"
	@echo "  build           Rebuild images"
	@echo "  migrate         Apply Alembic migrations inside the api container"
	@echo "  revision m=msg  Autogenerate a new Alembic revision"
	@echo "  seed            Seed reference data (market items, demo polls)"
	@echo "  test            Run the pytest suite"
	@echo "  lint / fmt      Ruff check / format"
	@echo "  render-validate Validate render.yaml with the Render CLI"

up-local:
	docker compose up --build -d

down-local:
	docker compose down

logs:
	docker compose logs -f

build:
	docker compose build

migrate:
	docker compose run --rm api alembic upgrade head

revision:
	docker compose run --rm api alembic revision --autogenerate -m "$(m)"

seed:
	docker compose run --rm api python -m app.scripts.seed

test:
	pytest

lint:
	ruff check backend

fmt:
	ruff format backend

# Requires the Render CLI: https://render.com/docs/cli
render-validate:
	render blueprint validate render.yaml
