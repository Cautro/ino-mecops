package admin_panel

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Handler struct {
	useCase  *UseCase
	adminIDs map[int64]struct{}
}

func NewHandler(useCase *UseCase, adminIDs map[int64]struct{}) *Handler {
	copyIDs := make(map[int64]struct{}, len(adminIDs))
	for id := range adminIDs {
		copyIDs[id] = struct{}{}
	}
	return &Handler{useCase: useCase, adminIDs: copyIDs}
}

func (h *Handler) authorized(w http.ResponseWriter, r *http.Request) (auth.TelegramUser, bool) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return auth.TelegramUser{}, false
	}
	if _, allowed := h.adminIDs[user.ID]; !allowed {
		services.WriteError(w, http.StatusForbidden, "forbidden", "У вас нет доступа к панели администратора.")
		return auth.TelegramUser{}, false
	}
	return user, true
}

func (h *Handler) ListBatches(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorized(w, r); !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	batches, err := h.useCase.ListBatches(r.Context(), limit, offset)
	if err != nil {
		log.Printf("admin: list batches: %v", err)
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось получить список партий.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": batches})
}

func (h *Handler) CreateBatch(w http.ResponseWriter, r *http.Request) {
	user, ok := h.authorized(w, r)
	if !ok {
		return
	}
	var request CreateBatchRequest
	if err := services.DecodeJSON(w, r, &request); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Некорректный JSON запроса.")
		return
	}
	result, err := h.useCase.CreateBatch(r.Context(), user.ID, request)
	if err != nil {
		if errors.Is(err, ErrInvalidBatch) {
			services.WriteError(w, http.StatusBadRequest, "invalid_batch", "Проверьте название партии, количество кодов, награду и срок действия. Укажите золото и/или активного иномекона; редкость — до 32 символов.")
			return
		}
		log.Printf("admin: create batch: %v", err)
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось создать партию кодов.")
		return
	}
	services.WriteJSON(w, http.StatusCreated, result)
}

func (h *Handler) ListBatchCodes(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorized(w, r); !ok {
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(r.PathValue("id")), 10, 64)
	if err != nil || id <= 0 {
		services.WriteError(w, http.StatusBadRequest, "invalid_batch_id", "Некорректный ID партии.")
		return
	}
	result, err := h.useCase.ListBatchCodes(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrBatchNotFound) {
			services.WriteError(w, http.StatusNotFound, "batch_not_found", "Партия не найдена.")
			return
		}
		log.Printf("admin: list batch codes id=%d: %v", id, err)
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось получить коды партии.")
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) RevokeBatch(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorized(w, r); !ok {
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(r.PathValue("id")), 10, 64)
	if err != nil || id <= 0 {
		services.WriteError(w, http.StatusBadRequest, "invalid_batch_id", "Некорректный ID партии.")
		return
	}
	if err := h.useCase.RevokeBatch(r.Context(), id); err != nil {
		if errors.Is(err, ErrBatchNotFound) {
			services.WriteError(w, http.StatusNotFound, "batch_not_found", "Партия не найдена или уже отозвана.")
			return
		}
		log.Printf("admin: revoke batch id=%d: %v", id, err)
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось отозвать партию.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "batch_id": id})
}

func (h *Handler) DeleteBatch(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.authorized(w, r); !ok {
		return
	}
	id, err := strconv.ParseInt(strings.TrimSpace(r.PathValue("id")), 10, 64)
	if err != nil || id <= 0 {
		services.WriteError(w, http.StatusBadRequest, "invalid_batch_id", "Некорректный ID партии.")
		return
	}
	if err := h.useCase.DeleteBatch(r.Context(), id); err != nil {
		if errors.Is(err, ErrBatchNotFound) {
			services.WriteError(w, http.StatusNotFound, "batch_not_found", "Партия не найдена.")
			return
		}
		if errors.Is(err, ErrBatchHasRedemptions) {
			services.WriteError(w, http.StatusConflict, "batch_has_redemptions", "Нельзя удалить партию с активированными кодами. Отзови её, чтобы сохранить историю наград.")
			return
		}
		log.Printf("admin: delete batch id=%d: %v", id, err)
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось удалить партию.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "batch_id": id})
}
