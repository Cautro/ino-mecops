package main

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cautro/inomecops/backend/internal/config"
	"github.com/cautro/inomecops/backend/internal/features/admin_panel"
	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/features/codes"
	"github.com/cautro/inomecops/backend/internal/router"
	"github.com/cautro/inomecops/backend/internal/telegram"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func main() {
	logger := log.New(os.Stdout, "inomecops ", log.LstdFlags|log.LUTC|log.Lshortfile)

	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("configuration: %v", err)
	}

	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		logger.Fatalf("open database: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, cancelPing := context.WithTimeout(context.Background(), 10*time.Second)
	err = db.PingContext(pingCtx)
	cancelPing()
	if err != nil {
		logger.Fatalf("connect to PostgreSQL: %v", err)
	}

	authRepo := auth.NewPostgresRepository(db)
	authUseCase := auth.NewUseCase(cfg.BotToken, authRepo)
	authHandler := auth.NewHandler(authUseCase)

	codesRepo := codes.NewPostgresRepository(db)
	codesUseCase := codes.NewUseCase(codesRepo)
	codesHandler := codes.NewHandler(codesUseCase)

	adminRepo := admin_panel.NewPostgresRepository(db)
	adminUseCase := admin_panel.NewUseCase(adminRepo)
	adminHandler := admin_panel.NewHandler(adminUseCase, cfg.AdminIDs)

	handler := router.New(router.Dependencies{
		Auth:  authHandler,
		Codes: codesHandler,
		Admin: adminHandler,
		DB:    db,
		Log:   logger,
	})

	rootCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.WebAppURL == "" {
		logger.Printf("WEBAPP_URL is empty; the bot will respond to /start without an app button")
	}
	go telegram.RunPollingBot(rootCtx, cfg.BotToken, cfg.WebAppURL, logger)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Printf("HTTP server listening on :%s", cfg.Port)
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Fatalf("HTTP server: %v", err)
		}
	case <-rootCtx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Printf("HTTP shutdown: %v", err)
		}
	}
}
