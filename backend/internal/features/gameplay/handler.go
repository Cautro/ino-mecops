package gameplay

import (
	"database/sql"
	"errors"
	"log"
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
		log.Printf("Overview failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "overview_failed", "Не удалось рассчитать баланс и пассивный доход.")
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) MainSlot(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	state, err := h.store.MainSlot(r.Context(), user.ID)
	if err != nil {
		log.Printf("MainSlot failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "main_slot_failed", "Не удалось загрузить основной слот. Попробуй ещё раз.")
		return
	}
	services.WriteJSON(w, http.StatusOK, state)
}

func (h *Handler) SetMainSlot(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	var input SetMainSlotInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Выбери иномекона из своей коллекции.")
		return
	}
	if err := h.store.SetMainSlot(r.Context(), user.ID, input.CreatureID); err != nil {
		switch {
		case errors.Is(err, ErrInvalidInput):
			services.WriteError(w, http.StatusBadRequest, "invalid_creature", "Выбери иномекона из своей коллекции.")
		case errors.Is(err, ErrCreatureNotOwned):
			services.WriteError(w, http.StatusConflict, "creature_not_owned", "Этот иномекон не найден в твоей коллекции. Обнови страницу.")
		case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
			services.WriteError(w, http.StatusNotFound, "player_not_found", "Игровой профиль не найден.")
		default:
			log.Printf("SetMainSlot failed: player=%d creature=%d err=%v", user.ID, input.CreatureID, err)
			services.WriteError(w, http.StatusInternalServerError, "main_slot_failed", "Не удалось установить основного иномекона. Попробуй ещё раз.")
		}
		return
	}
	state, err := h.store.MainSlot(r.Context(), user.ID)
	if err != nil {
		log.Printf("MainSlot reload failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "main_slot_failed", "Слот обновлён, но не удалось перечитать состояние. Обнови страницу.")
		return
	}
	services.WriteJSON(w, http.StatusOK, state)
}

func (h *Handler) ClearMainSlot(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	if err := h.store.ClearMainSlot(r.Context(), user.ID); err != nil {
		log.Printf("ClearMainSlot failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "main_slot_failed", "Не удалось освободить основной слот. Попробуй ещё раз.")
		return
	}
	state, err := h.store.MainSlot(r.Context(), user.ID)
	if err != nil {
		log.Printf("MainSlot reload failed after clear: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "main_slot_failed", "Слот освобождён, но не удалось перечитать состояние. Обнови страницу.")
		return
	}
	services.WriteJSON(w, http.StatusOK, state)
}

func (h *Handler) Leaderboards(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	data, err := h.store.Leaderboards(r.Context())
	if err != nil {
		log.Printf("Leaderboards failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "leaderboard_failed", "Не удалось загрузить таблицу лидеров. Ошибка записана в журнал, попробуй позже.")
		return
	}
	services.WriteJSON(w, http.StatusOK, data)
}
