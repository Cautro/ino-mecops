package router

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
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
	mux.Handle("GET /metrics", metricsEndpoint(metricsRegistry.Handler(), deps.DB, deps.Log))
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
	mux.Handle("GET /api/v1/game/main-creature", protected(http.HandlerFunc(deps.Gameplay.MainSlot)))
	mux.Handle("PUT /api/v1/game/main-creature", protected(http.HandlerFunc(deps.Gameplay.SetMainSlot)))
	mux.Handle("DELETE /api/v1/game/main-creature", protected(http.HandlerFunc(deps.Gameplay.ClearMainSlot)))
	mux.Handle("GET /api/v1/leaderboards", protected(http.HandlerFunc(deps.Gameplay.Leaderboards)))
	mux.Handle("GET /api/v1/shop", protected(http.HandlerFunc(deps.Shop.Overview)))
	mux.Handle("POST /api/v1/shop/lootboxes/buy", protected(http.HandlerFunc(deps.Shop.BuyEgg)))
	mux.Handle("POST /api/v1/shop/lootboxes/{id}/open", protected(http.HandlerFunc(deps.Shop.HatchEgg)))
	mux.Handle("POST /api/v1/shop/creatures/{id}/sell", protected(http.HandlerFunc(deps.Shop.SellCreature)))
	mux.Handle("GET /api/v1/admin/shop/lootboxes", protected(http.HandlerFunc(deps.Shop.ListAdminEggs)))
	mux.Handle("PUT /api/v1/admin/shop/lootboxes/{rarity}", protected(http.HandlerFunc(deps.Shop.UpdateAdminEgg)))
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

// metricsEndpoint appends database-backed business counters to HTTP runtime metrics.
// Metrics failures are logged but never take the public scrape endpoint down.
func metricsEndpoint(base http.Handler, db *sql.DB, logger *log.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		recorder := httptest.NewRecorder()
		base.ServeHTTP(recorder, r)
		w.Header().Set("Content-Type", recorder.Header().Get("Content-Type"))
		w.Header().Set("Cache-Control", "no-store")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, recorder.Body.String())

		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if db == nil {
			writeBusinessMetricUnavailable(w)
			return
		}
		var spentGold, purchases, bonusGold, openings, redeemedCodes, codeGold, codeCreatures int64
		err := db.QueryRowContext(ctx, `
			SELECT
			  COALESCE((SELECT SUM(-delta_gold) FROM wallet_transactions WHERE transaction_type='lootbox_purchase' AND delta_gold < 0),0)::bigint,
			  COALESCE((SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='lootbox_purchase' AND delta_gold < 0),0)::bigint,
			  COALESCE((SELECT SUM(bonus_gold) FROM lootbox_open_events),0)::bigint,
			  COALESCE((SELECT COUNT(*) FROM lootbox_open_events),0)::bigint,
			  COALESCE((SELECT COUNT(*) FROM promo_codes WHERE redeemed_at IS NOT NULL),0)::bigint,
			  COALESCE((SELECT SUM(COALESCE(reward_gold,0)) FROM promo_codes WHERE redeemed_at IS NOT NULL),0)::bigint,
			  COALESCE((SELECT COUNT(*) FROM promo_codes WHERE redeemed_at IS NOT NULL AND reward_creature_slug IS NOT NULL),0)::bigint
		`).Scan(&spentGold, &purchases, &bonusGold, &openings, &redeemedCodes, &codeGold, &codeCreatures)
		if err != nil {
			if logger != nil {
				logger.Printf("business metrics query failed: %v", err)
			}
			writeBusinessMetricUnavailable(w)
			return
		}
		fmt.Fprintln(w, "# HELP inomecops_business_metrics_available Whether business counters were successfully read from PostgreSQL.")
		fmt.Fprintln(w, "# TYPE inomecops_business_metrics_available gauge")
		fmt.Fprintln(w, "inomecops_business_metrics_available 1")
		writeCounter(w, "inomecops_lootbox_gold_spent_total", "Cumulative gold spent buying collection containers.", spentGold)
		writeCounter(w, "inomecops_lootbox_purchases_total", "Completed collection-container purchases.", purchases)
		writeCounter(w, "inomecops_lootbox_openings_total", "Collection containers successfully opened.", openings)
		writeCounter(w, "inomecops_lootbox_bonus_gold_total", "Bonus gold awarded by main-creature slots when opening containers.", bonusGold)
		writeCounter(w, "inomecops_codes_redeemed_total", "Promotion and QR codes redeemed successfully.", redeemedCodes)
		writeCounter(w, "inomecops_code_gold_rewards_total", "Gold granted through redeemed promotion and QR codes.", codeGold)
		writeCounter(w, "inomecops_code_creature_rewards_total", "Creature rewards granted through redeemed promotion and QR codes.", codeCreatures)

		counts := map[string]int64{"common": 0, "rare": 0, "epic": 0, "legendary": 0, "mythic": 0}
		rarityRows, queryErr := db.QueryContext(ctx, `SELECT result_rarity, COUNT(*)::bigint FROM lootbox_open_events GROUP BY result_rarity`)
		if queryErr != nil {
			if logger != nil {
				logger.Printf("business metrics rarity query failed: %v", queryErr)
			}
			return
		}
		for rarityRows.Next() {
			var rarity string
			var count int64
			if scanErr := rarityRows.Scan(&rarity, &count); scanErr != nil {
				if logger != nil {
					logger.Printf("business metrics rarity scan failed: %v", scanErr)
				}
				_ = rarityRows.Close()
				return
			}
			if _, ok := counts[rarity]; ok {
				counts[rarity] = count
			}
		}
		if rowsErr := rarityRows.Err(); rowsErr != nil {
			if logger != nil {
				logger.Printf("business metrics rarity rows failed: %v", rowsErr)
			}
			_ = rarityRows.Close()
			return
		}
		_ = rarityRows.Close()
		fmt.Fprintln(w, "# HELP inomecops_lootbox_openings_by_rarity_total Containers opened, grouped by received creature rarity.")
		fmt.Fprintln(w, "# TYPE inomecops_lootbox_openings_by_rarity_total counter")
		for _, rarity := range []string{"common", "rare", "epic", "legendary", "mythic"} {
			fmt.Fprintf(w, "inomecops_lootbox_openings_by_rarity_total{rarity=%q} %d\n", rarity, counts[rarity])
		}
	})
}

func writeBusinessMetricUnavailable(w io.Writer) {
	fmt.Fprintln(w, "# HELP inomecops_business_metrics_available Whether business counters were successfully read from PostgreSQL.")
	fmt.Fprintln(w, "# TYPE inomecops_business_metrics_available gauge")
	fmt.Fprintln(w, "inomecops_business_metrics_available 0")
}

func writeCounter(w io.Writer, name, help string, value int64) {
	fmt.Fprintf(w, "# HELP %s %s\n# TYPE %s counter\n%s %d\n", name, help, name, name, value)
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
