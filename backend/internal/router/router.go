package router

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/cautro/inomecops/backend/internal/features/admin_panel"
	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/features/catalog"
	"github.com/cautro/inomecops/backend/internal/features/codes"
	"github.com/cautro/inomecops/backend/internal/features/gameplay"
	"github.com/cautro/inomecops/backend/internal/features/shop"
	"github.com/cautro/inomecops/backend/internal/features/subscription"
	appmetrics "github.com/cautro/inomecops/backend/internal/metrics"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Dependencies struct {
	Auth         *auth.Handler
	Codes        *codes.Handler
	Admin        *admin_panel.Handler
	Catalog      *catalog.Handler
	Gameplay     *gameplay.Handler
	Shop         *shop.Handler
	Subscription *subscription.Handler
	UploadDir    string
	DB           *sql.DB
	Log          *log.Logger
}

func New(deps Dependencies) http.Handler {
	mux := http.NewServeMux()
	metricsRegistry := appmetrics.New()
	mux.Handle("GET /metrics", metricsRegistry.Handler())
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
	mux.Handle("GET /api/v1/game/overview", protected(http.HandlerFunc(deps.Gameplay.Overview)))
	mux.Handle("POST /api/v1/game/slot", protected(http.HandlerFunc(deps.Gameplay.SpinSlot)))
	mux.Handle("GET /api/v1/game/main-creature", protected(http.HandlerFunc(deps.Gameplay.MainSlot)))
	mux.Handle("PUT /api/v1/game/main-creature", protected(http.HandlerFunc(deps.Gameplay.SetMainSlot)))
	mux.Handle("DELETE /api/v1/game/main-creature", protected(http.HandlerFunc(deps.Gameplay.ClearMainSlot)))
	mux.Handle("GET /api/v1/leaderboards", protected(http.HandlerFunc(deps.Gameplay.Leaderboards)))
	mux.Handle("GET /api/v1/shop", protected(http.HandlerFunc(deps.Shop.Overview)))
	mux.Handle("POST /api/v1/shop/eggs/buy", protected(http.HandlerFunc(deps.Shop.BuyEgg)))
	mux.Handle("POST /api/v1/shop/eggs/{id}/hatch", protected(http.HandlerFunc(deps.Shop.HatchEgg)))
	mux.Handle("POST /api/v1/shop/creatures/{id}/sell", protected(http.HandlerFunc(deps.Shop.SellCreature)))
	mux.Handle("GET /api/v1/admin/shop/eggs", protected(http.HandlerFunc(deps.Shop.ListAdminEggs)))
	mux.Handle("PUT /api/v1/admin/shop/eggs/{rarity}", protected(http.HandlerFunc(deps.Shop.UpdateAdminEgg)))
	mux.Handle("GET /api/v1/subscription", protected(http.HandlerFunc(deps.Subscription.Status)))
	mux.Handle("POST /api/v1/subscription/claim", protected(http.HandlerFunc(deps.Subscription.Claim)))
	mux.Handle("GET /api/v1/me/creatures", protected(http.HandlerFunc(deps.Codes.ListCreatures)))
	mux.Handle("POST /api/v1/codes/redeem", protected(http.HandlerFunc(deps.Codes.Redeem)))
	mux.Handle("GET /api/v1/admin/code-batches", protected(http.HandlerFunc(deps.Admin.ListBatches)))
	mux.Handle("POST /api/v1/admin/code-batches", protected(http.HandlerFunc(deps.Admin.CreateBatch)))
	mux.Handle("GET /api/v1/admin/code-batches/{id}/codes", protected(http.HandlerFunc(deps.Admin.ListBatchCodes)))
	mux.Handle("POST /api/v1/admin/code-batches/{id}/revoke", protected(http.HandlerFunc(deps.Admin.RevokeBatch)))
	mux.Handle("DELETE /api/v1/admin/code-batches/{id}", protected(http.HandlerFunc(deps.Admin.DeleteBatch)))

	// Admin catalog: species and their abilities. All mutations are checked against ADMIN_TELEGRAM_IDS.
	mux.Handle("GET /api/v1/admin/abilities", protected(http.HandlerFunc(deps.Catalog.ListAbilities)))
	mux.Handle("POST /api/v1/admin/abilities", protected(http.HandlerFunc(deps.Catalog.CreateAbility)))
	mux.Handle("PUT /api/v1/admin/abilities/{id}", protected(http.HandlerFunc(deps.Catalog.UpdateAbility)))
	mux.Handle("DELETE /api/v1/admin/abilities/{id}", protected(http.HandlerFunc(deps.Catalog.DeleteAbility)))
	mux.Handle("GET /api/v1/admin/creatures", protected(http.HandlerFunc(deps.Catalog.ListAdminSpecies)))
	mux.Handle("POST /api/v1/admin/creatures", protected(http.HandlerFunc(deps.Catalog.CreateSpecies)))
	mux.Handle("PUT /api/v1/admin/creatures/{id}", protected(http.HandlerFunc(deps.Catalog.UpdateSpecies)))
	mux.Handle("DELETE /api/v1/admin/creatures/{id}", protected(http.HandlerFunc(deps.Catalog.DeleteSpecies)))
	mux.Handle("POST /api/v1/admin/uploads/images", protected(http.HandlerFunc(deps.Catalog.UploadImage)))
	mux.Handle("GET /api/v1/catalog/creatures", protected(http.HandlerFunc(deps.Catalog.ListPublicSpecies)))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(deps.UploadDir))))

	return metricsRegistry.Middleware(requestLogger(mux, deps.Log))
}

type loggedResponseWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (w *loggedResponseWriter) WriteHeader(status int) {
	if w.wrote {
		return
	}
	w.status = status
	w.wrote = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *loggedResponseWriter) Write(body []byte) (int, error) {
	if !w.wrote {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func (w *loggedResponseWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func requestLogger(next http.Handler, logger *log.Logger) http.Handler {
	if logger == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		recorder := &loggedResponseWriter{ResponseWriter: w}
		next.ServeHTTP(recorder, r)
		status := recorder.status
		if status == 0 {
			status = http.StatusOK
		}
		duration := time.Since(start).Round(time.Millisecond)
		route := r.Pattern
		if route == "" {
			route = r.URL.Path
		} else if space := strings.IndexByte(route, ' '); space >= 0 {
			route = route[space+1:]
		}
		if status >= 400 {
			logger.Printf("HTTP ERROR method=%s route=%q status=%d duration=%s remote=%q", r.Method, route, status, duration, r.RemoteAddr)
		} else {
			logger.Printf("%s %s status=%d duration=%s", r.Method, route, status, duration)
		}
	})
}
