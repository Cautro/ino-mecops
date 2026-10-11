package codes

import (
	"errors"
	"net/http"

	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Handler struct {
	useCase *UseCase
}

func NewHandler(useCase *UseCase) *Handler {
	return &Handler{useCase: useCase}
}

func (h *Handler) Redeem(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	var request RedeemRequest
	if err := services.DecodeJSON(w, r, &request); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Ожидался JSON с полем code.")
		return
	}
	result, err := h.useCase.Redeem(r.Context(), user.ID, request.Code)
	if err != nil {
		if errors.Is(err, ErrInvalidCode) {
			services.WriteError(w, http.StatusUnprocessableEntity, "code_unavailable", "Код недействителен, уже использован, отозван или просрочен.")
			return
		}
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось активировать код.")
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) ListCreatures(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	creatures, err := h.useCase.ListCreatures(r.Context(), user.ID)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось загрузить коллекцию.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": creatures})
}
