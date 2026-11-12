.PHONY: setup init-prompts up down restart logs pull-model status

MODEL ?= qwen3.5:9b

setup:
	@test -f .env || cp .env.example .env
	@./scripts/init-prompts.sh

init-prompts:
	@./scripts/init-prompts.sh

up: setup
	docker compose up -d --build

pull-model:
	docker compose exec ollama ollama pull $(MODEL)

down:
	docker compose down

restart:
	docker compose up -d --build --force-recreate

logs:
	docker compose logs -f --tail=150

status:
	docker compose ps
	docker compose exec ollama ollama ps
