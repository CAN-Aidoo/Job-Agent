.PHONY: up down migrate test-e2e build clean

up:
	docker compose up -d

down:
	docker compose down

migrate:
	npx ts-node services/api/src/migrations/runner.ts

build:
	npm run build --workspaces

clean:
	npm run clean --workspaces

test-e2e:
	npx ts-node tests/e2e/full-pipeline.test.ts

typecheck:
	npx tsc --noEmit

dev-api:
	npx ts-node services/api/src/app.ts

dev-orchestrator:
	npx ts-node services/orchestrator/src/index.ts
