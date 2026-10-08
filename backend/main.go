package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata"

	"online-shop/backend/internal/api"
	"online-shop/backend/internal/delivery"
	"online-shop/backend/internal/shop"
	"online-shop/backend/internal/store"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
func main() {
	if err := run(); err != nil {
		slog.Error("server stopped", "error", err)
		os.Exit(1)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	secret := os.Getenv("CURSOR_SECRET")
	if len(secret) < 32 {
		return errors.New("CURSOR_SECRET must contain at least 32 characters")
	}
	db, err := store.Open(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer db.Pool.Close()
	if err = db.Migrate(ctx); err != nil {
		return err
	}
	service := &shop.Service{DB: db, CursorKey: []byte(secret), PublicURL: strings.TrimRight(env("PUBLIC_URL", "http://localhost:8080"), "/")}
	if err = service.Bootstrap(ctx, shop.Bootstrap{ShopID: os.Getenv("BOOTSTRAP_SHOP_ID"), ShopName: os.Getenv("BOOTSTRAP_SHOP_NAME"), OwnerName: os.Getenv("BOOTSTRAP_OWNER_NAME"), Phone: os.Getenv("BOOTSTRAP_PHONE"), Password: os.Getenv("BOOTSTRAP_PASSWORD"), ChatbotKey: os.Getenv("BOOTSTRAP_CHATBOT_KEY"), BankKey: os.Getenv("BOOTSTRAP_BANK_KEY"), WebhookURL: os.Getenv("BOOTSTRAP_WEBHOOK_URL"), WebhookSecret: os.Getenv("BOOTSTRAP_WEBHOOK_SECRET"), SMSURL: os.Getenv("BOOTSTRAP_SMS_URL"), SMSSecret: os.Getenv("BOOTSTRAP_SMS_SECRET")}); err != nil {
		return err
	}
	if len(os.Args) > 1 && os.Args[1] == "provision" {
		return nil
	}
	app := api.New(service, strings.Split(env("CORS_ORIGINS", "http://localhost:8081"), ","))
	maintenanceDone := make(chan struct{})
	go func() { defer close(maintenanceDone); service.Maintain(ctx) }()
	workerDone := make(chan struct{})
	go func() { defer close(workerDone); (&delivery.Worker{DB: db, HTTP: delivery.Client()}).Run(ctx) }()
	server := &http.Server{Addr: ":" + env("PORT", "8080"), Handler: app.Echo, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	errs := make(chan error, 1)
	go func() { slog.Info("backend listening", "address", server.Addr); errs <- server.ListenAndServe() }()
	select {
	case err = <-errs:
		stop()
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if e := server.Shutdown(shutdown); e != nil {
		return e
	}
	<-workerDone
	<-maintenanceDone
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
