.PHONY: default dev-build dev-start dev-stop

default:
	@echo "No default target."

build:
	docker compose -f deployments/docker-compose.prod.yml build --no-cache

start:
	docker compose -f deployments/docker-compose.prod.yml up --force-recreate --remove-orphans

stop:
	docker compose -f deployments/docker-compose.prod.yml down

dev-build:
	docker-compose -f deployments/docker-compose.dev.yml build --no-cache

dev-start:
	docker-compose -f deployments/docker-compose.dev.yml up --force-recreate --remove-orphans

dev-stop:
	docker-compose -f deployments/docker-compose.dev.yml down