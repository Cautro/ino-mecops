package router

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/cautro/inomecops/backend/internal/features/admin_panel"
	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/features/codes"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Dependencies struct {
	Auth  *auth.Handler
	Codes *codes.Handler
	Admin *admin_panel.Handler
	DB    *sql.DB
	Log   *log.Logger
}

func New(deps Dependencies) http.Handler {
	mux := http.NewServeMux()
	protected := func(handler http.Handler) http.Handler {
		return deps.Auth.Middleware(handler)
	}

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		services.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := deps.DB.PingContext(ctx); err != nil {
			services.WriteError(w, http.StatusServiceUnavailable, "database_unavailable", "База данных недоступна.")
			return
		}
		services.WriteJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	mux.Handle("GET /api/v1/me", protected(http.HandlerFunc(deps.Auth.Me)))
	mux.Handle("GET /api/v1/me/creatures", protected(http.HandlerFunc(deps.Codes.ListCreatures)))
	mux.Handle("POST /api/v1/codes/redeem", protected(http.HandlerFunc(deps.Codes.Redeem)))
	mux.Handle("GET /api/v1/admin/code-batches", protected(http.HandlerFunc(deps.Admin.ListBatches)))
	mux.Handle("POST /api/v1/admin/code-batches", protected(http.HandlerFunc(deps.Admin.CreateBatch)))
	mux.Handle("POST /api/v1/admin/code-batches/{id}/revoke", protected(http.HandlerFunc(deps.Admin.RevokeBatch)))

	return requestLogger(mux, deps.Log)
}

func requestLogger(next http.Handler, logger *log.Logger) http.Handler {
	if logger == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		logger.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
	})
}
