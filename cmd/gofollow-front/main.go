package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"syscall"
	"time"

	gofollowfront "gofollowfront"
	"gofollowfront/server"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	listen := env("LISTEN", "0.0.0.0:8080")
	backend, err := url.Parse(env("GOFOLLOW_URL", "http://127.0.0.1:8090"))
	if err != nil || backend.Scheme == "" || backend.Host == "" {
		log.Fatalf("GOFOLLOW_URL 不合法: %q", os.Getenv("GOFOLLOW_URL"))
	}
	assets, err := gofollowfront.Assets()
	if err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{
		Addr:              listen,
		Handler:           server.New(server.Config{Backend: backend, Assets: assets}),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		log.Printf("gofollow-front 监听 %s，后端 %s", listen, backend)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Print("已退出")
}
