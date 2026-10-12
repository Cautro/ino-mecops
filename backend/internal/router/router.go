package router

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/cautro/inomecops/backend/internal/features/admin_panel"
	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/features/catalog"
	"github.com/cautro/inomecops/backend/internal/features/codes"
	"github.com/cautro/inomecops/backend/internal/features/gameplay"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Dependencies struct {
	Auth      *auth.Handler
	Codes     *codes.Handler
	Admin     *admin_panel.Handler
	Catalog   *catalog.Handler
	Gameplay  *gameplay.Handler
	UploadDir string
	DB        *sql.DB
	Log       *log.Logger
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
	mux.Handle("GET /api/v1/game/overview", protected(http.HandlerFunc(deps.Gameplay.Overview)))
	mux.Handle("GET /api/v1/game/players", protected(http.HandlerFunc(deps.Gameplay.Players)))
	mux.Handle("GET /api/v1/game/battles", protected(http.HandlerFunc(deps.Gameplay.Battles)))
	mux.Handle("POST /api/v1/game/battles", protected(http.HandlerFunc(deps.Gameplay.CreateBattle)))
	mux.Handle("POST /api/v1/game/battles/{id}/accept", protected(http.HandlerFunc(deps.Gameplay.AcceptBattle)))
	mux.Handle("POST /api/v1/game/battles/{id}/decline", protected(http.HandlerFunc(deps.Gameplay.DeclineBattle)))
	mux.Handle("POST /api/v1/game/battles/{id}/cancel", protected(http.HandlerFunc(deps.Gameplay.CancelBattle)))
	mux.Handle("POST /api/v1/game/battles/{id}/turn", protected(http.HandlerFunc(deps.Gameplay.Turn)))
	mux.Handle("POST /api/v1/game/battles/{id}/surrender", protected(http.HandlerFunc(deps.Gameplay.Surrender)))
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
	mux.Handle("DELETE /api/v1/admin/creatures/{id}", protected(http.HandlerFunc(deps.Catalog.ArchiveSpecies)))
	mux.Handle("POST /api/v1/admin/uploads/images", protected(http.HandlerFunc(deps.Catalog.UploadImage)))
	mux.Handle("GET /api/v1/catalog/creatures", protected(http.HandlerFunc(deps.Catalog.ListPublicSpecies)))
	mux.Handle("GET /uploads/", http.StripPrefix("/uploads/", http.FileServer(http.Dir(deps.UploadDir))))

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
