package gameplay

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"

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
func (h *Handler) Players(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	items, err := h.store.listPlayerOptions(r.Context(), user.ID)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "players_failed", "Не удалось загрузить список соперников.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}
func (h *Handler) Battles(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	items, err := h.store.listBattles(r.Context(), user.ID)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "battles_failed", "Не удалось загрузить дуэли.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}
func (h *Handler) CreateBattle(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	var input CreateBattleInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Укажи своего иномекона и иномекона соперника.")
		return
	}
	battle, err := h.store.createBattle(r.Context(), user.ID, input)
	if err != nil {
		h.writeError(w, err)
		return
	}
	services.WriteJSON(w, http.StatusCreated, battle)
}
func (h *Handler) AcceptBattle(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	id, ok := parseBattleID(w, r.PathValue("id"))
	if !ok {
		return
	}
	battle, err := h.store.acceptBattle(r.Context(), user.ID, id)
	if err != nil {
		h.writeError(w, err)
		return
	}
	services.WriteJSON(w, http.StatusOK, battle)
}
func (h *Handler) DeclineBattle(w http.ResponseWriter, r *http.Request) { h.closeWaiting(w, r, true) }
func (h *Handler) CancelBattle(w http.ResponseWriter, r *http.Request)  { h.closeWaiting(w, r, false) }
func (h *Handler) closeWaiting(w http.ResponseWriter, r *http.Request, decline bool) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	id, ok := parseBattleID(w, r.PathValue("id"))
	if !ok {
		return
	}
	if err := h.store.closeWaiting(r.Context(), user.ID, id, decline); err != nil {
		h.writeError(w, err)
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}
func (h *Handler) Turn(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	id, ok := parseBattleID(w, r.PathValue("id"))
	if !ok {
		return
	}
	var input TurnInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Укажи action: basic или ability.")
		return
	}
	result, err := h.store.takeTurn(r.Context(), user.ID, id, input.Action)
	if err != nil {
		h.writeError(w, err)
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}
func (h *Handler) Surrender(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	id, ok := parseBattleID(w, r.PathValue("id"))
	if !ok {
		return
	}
	battle, err := h.store.surrender(r.Context(), user.ID, id)
	if err != nil {
		h.writeError(w, err)
		return
	}
	services.WriteJSON(w, http.StatusOK, battle)
}
func parseBattleID(w http.ResponseWriter, raw string) (int64, bool) {
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id < 1 {
		services.WriteError(w, http.StatusBadRequest, "invalid_id", "Некорректный ID дуэли.")
		return 0, false
	}
	return id, true
}
func (h *Handler) writeError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		services.WriteError(w, http.StatusBadRequest, "invalid_input", "Проверь выбранных иномеконов и действие.")
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		services.WriteError(w, http.StatusNotFound, "not_found", "Игрок, иномекон или дуэль не найдены.")
	case errors.Is(err, ErrForbidden):
		services.WriteError(w, http.StatusForbidden, "forbidden", "Ты не можешь управлять этой дуэлью.")
	case errors.Is(err, ErrNotYourTurn):
		services.WriteError(w, http.StatusConflict, "not_your_turn", "Сейчас ход другого игрока.")
	case errors.Is(err, ErrAbilityCooldown):
		services.WriteError(w, http.StatusConflict, "ability_cooldown", "Способность ещё перезаряжается. Используй обычную атаку.")
	case errors.Is(err, ErrBattleClosed):
		services.WriteError(w, http.StatusConflict, "battle_closed", "Эта дуэль не активна.")
	case errors.Is(err, ErrConflict):
		services.WriteError(w, http.StatusConflict, "battle_conflict", "Нельзя создать или принять дуэль: у одного из игроков уже есть активная дуэль или незавершённый вызов.")
	default:
		services.WriteError(w, http.StatusInternalServerError, "gameplay_error", "Не удалось выполнить игровое действие.")
	}
}
