.PHONY: build web-build go-build test clean

build: web-build go-build

web-build:
	cd web && npm ci && npm run build

go-build:
	go build -tags embeddist -o bin/gofollow-front ./cmd/gofollow-front

test:
	cd web && npm run typecheck && npm test -- --run
	go vet ./... && go test ./...

clean:
	rm -rf web/dist bin
