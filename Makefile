.PHONY: install dev build test lint start docker-up docker-down clean

install:
	npm ci

dev:
	npm run start:dev

build:
	npm run build

test:
	npm test

lint:
	npm run lint

start:
	npm run start:prod

docker-up:
	docker compose up --build

docker-down:
	docker compose down

clean:
	rm -rf dist coverage node_modules data/evzone.sqlite
