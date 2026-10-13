package gameplay

import (
	"database/sql"
	"errors"
	"net/http"

	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Handler struct{ store *Store }

func NewHandler(db *sql.DB) *Handler { return &Handler{store: NewStore(db)} }

func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	result, err := h.store.Overview(r.Context(), user.ID)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "overview_failed", "Не удалось рассчитать баланс и пассивный доход.")
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) SpinSlot(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	var input SlotSpinInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Укажи ставку от 10 до 10000 золота.")
		return
	}
	result, err := h.store.SpinSlot(r.Context(), user.ID, input.Bet)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			services.WriteError(w, http.StatusBadRequest, "invalid_bet", "Ставка должна быть от 10 до 10000 золота.")
		case errors.Is(err, ErrInsufficientGold):
			services.WriteError(w, http.StatusConflict, "insufficient_gold", "Не хватает золота для этой ставки.")
		case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
			services.WriteError(w, http.StatusNotFound, "player_not_found", "Игровой профиль не найден.")
		default:
			services.WriteError(w, http.StatusInternalServerError, "slot_failed", "Не удалось прокрутить барабан. Попробуй ещё раз.")
		}
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}
