package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/cautro/inomecops/backend/internal/services"
)

type contextKey struct{}

func IdentityFromContext(ctx context.Context) (TelegramUser, bool) {
	user, ok := ctx.Value(contextKey{}).(TelegramUser)
	return user, ok
}

type Handler struct {
	useCase *UseCase
}

func NewHandler(useCase *UseCase) *Handler {
	return &Handler{useCase: useCase}
}

func (h *Handler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorization := strings.TrimSpace(r.Header.Get("Authorization"))
		const prefix = "tma "
		if !strings.HasPrefix(strings.ToLower(authorization), prefix) {
			w.Header().Set("WWW-Authenticate", `tma realm="inomecops"`)
			services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Откройте приложение через Telegram.")
			return
		}
		initData := strings.TrimSpace(authorization[len(prefix):])
		user, err := h.useCase.Authenticate(initData)
		if err != nil {
			w.Header().Set("WWW-Authenticate", `tma realm="inomecops"`)
			if errors.Is(err, ErrExpiredInitData) {
				services.WriteError(w, http.StatusUnauthorized, "init_data_expired", "Данные Telegram устарели. Закройте и снова откройте Mini App.")
				return
			}
			services.WriteError(w, http.StatusUnauthorized, "invalid_init_data", "Не удалось проверить данные Telegram.")
			return
		}
		if err := h.useCase.EnsurePlayer(r.Context(), user); err != nil {
			services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось загрузить профиль.")
			return
		}
		ctx := context.WithValue(r.Context(), contextKey{}, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	user, ok := IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	player, err := h.useCase.GetPlayer(r.Context(), user.ID)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось загрузить профиль.")
		return
	}
	services.WriteJSON(w, http.StatusOK, player)
}
