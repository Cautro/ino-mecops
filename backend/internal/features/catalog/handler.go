package catalog

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/services"
)

const maxImageBytes = 5 << 20
const maxImageSide = 4096
const maxImagePixels = 16_000_000

type Handler struct {
	useCase   *UseCase
	adminIDs  map[int64]struct{}
	uploadDir string
}

func NewHandler(useCase *UseCase, adminIDs map[int64]struct{}, uploadDir string) *Handler {
	copyIDs := make(map[int64]struct{}, len(adminIDs))
	for id := range adminIDs {
		copyIDs[id] = struct{}{}
	}
	return &Handler{useCase: useCase, adminIDs: copyIDs, uploadDir: uploadDir}
}

func (h *Handler) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return false
	}
	if _, allowed := h.adminIDs[user.ID]; !allowed {
		services.WriteError(w, http.StatusForbidden, "forbidden", "У вас нет доступа к каталогу иномеконов.")
		return false
	}
	return true
}

func (h *Handler) ListAbilities(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	items, err := h.useCase.ListAbilities(r.Context())
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось загрузить способности.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) CreateAbility(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	var input AbilityInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Некорректный JSON способности.")
		return
	}
	item, err := h.useCase.CreateAbility(r.Context(), input)
	if err != nil {
		h.writeCatalogError(w, err, "Не удалось создать способность.")
		return
	}
	services.WriteJSON(w, http.StatusCreated, item)
}

func (h *Handler) UpdateAbility(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, ok := parseID(w, r.PathValue("id"), "Некорректный ID способности.")
	if !ok {
		return
	}
	var input AbilityUpdateInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Некорректный JSON способности.")
		return
	}
	item, err := h.useCase.UpdateAbility(r.Context(), id, input)
	if err != nil {
		h.writeCatalogError(w, err, "Не удалось обновить способность.")
		return
	}
	services.WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) DeleteAbility(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, ok := parseID(w, r.PathValue("id"), "Некорректный ID способности.")
	if !ok {
		return
	}
	if err := h.useCase.DeleteAbility(r.Context(), id); err != nil {
		h.writeCatalogError(w, err, "Не удалось удалить способность.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func (h *Handler) ListAdminSpecies(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	items, err := h.useCase.ListSpecies(r.Context(), true)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось загрузить иномеконов.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) ListPublicSpecies(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	items, err := h.useCase.ListCollectionSpecies(r.Context(), user.ID)
	if err != nil {
		services.WriteError(w, http.StatusInternalServerError, "internal_error", "Не удалось загрузить каталог.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) CreateSpecies(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	var input SpeciesInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Некорректный JSON иномекона.")
		return
	}
	item, err := h.useCase.CreateSpecies(r.Context(), input)
	if err != nil {
		h.writeCatalogError(w, err, "Не удалось создать иномекона.")
		return
	}
	services.WriteJSON(w, http.StatusCreated, item)
}

func (h *Handler) UpdateSpecies(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, ok := parseID(w, r.PathValue("id"), "Некорректный ID иномекона.")
	if !ok {
		return
	}
	var input SpeciesUpdateInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Некорректный JSON иномекона.")
		return
	}
	item, err := h.useCase.UpdateSpecies(r.Context(), id, input)
	if err != nil {
		h.writeCatalogError(w, err, "Не удалось обновить иномекона.")
		return
	}
	services.WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) ArchiveSpecies(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	id, ok := parseID(w, r.PathValue("id"), "Некорректный ID иномекона.")
	if !ok {
		return
	}
	if err := h.useCase.ArchiveSpecies(r.Context(), id); err != nil {
		h.writeCatalogError(w, err, "Не удалось архивировать иномекона.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
}

func (h *Handler) UploadImage(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		services.WriteError(w, http.StatusBadRequest, "invalid_upload", "Не удалось прочитать файл. Максимальный размер — 5 МБ.")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, _, err := r.FormFile("image")
	if err != nil {
		services.WriteError(w, http.StatusBadRequest, "image_required", "Прикрепи PNG, JPEG или GIF-файл в поле image.")
		return
	}
	defer file.Close()
	content, err := io.ReadAll(io.LimitReader(file, maxImageBytes+1))
	if err != nil || len(content) == 0 || len(content) > maxImageBytes {
		services.WriteError(w, http.StatusBadRequest, "invalid_upload", "Файл пустой или превышает 5 МБ.")
		return
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(content))
	if err != nil || (format != "png" && format != "jpeg" && format != "gif") {
		services.WriteError(w, http.StatusBadRequest, "unsupported_image", "Поддерживаются только корректные PNG, JPEG и GIF-файлы.")
		return
	}
	if config.Width < 1 || config.Height < 1 || config.Width > maxImageSide || config.Height > maxImageSide || int64(config.Width)*int64(config.Height) > maxImagePixels {
		services.WriteError(w, http.StatusBadRequest, "image_dimensions", "Размер изображения не должен превышать 4096 × 4096 пикселей.")
		return
	}
	var randomName [16]byte
	if _, err := rand.Read(randomName[:]); err != nil {
		services.WriteError(w, http.StatusInternalServerError, "upload_failed", "Не удалось подготовить имя файла.")
		return
	}
	ext := map[string]string{"png": ".png", "jpeg": ".jpg", "gif": ".gif"}[format]
	if err := os.MkdirAll(h.uploadDir, 0755); err != nil {
		log.Printf("admin: create image upload directory %q: %v", h.uploadDir, err)
		services.WriteError(w, http.StatusInternalServerError, "upload_failed", "Не удалось подготовить каталог изображений. Проверь UPLOAD_DIR и права пользователя сервиса.")
		return
	}
	filename := hex.EncodeToString(randomName[:]) + ext
	path := filepath.Join(h.uploadDir, filename)
	if err := os.WriteFile(path, content, 0644); err != nil {
		log.Printf("admin: save uploaded image %q: %v", path, err)
		services.WriteError(w, http.StatusInternalServerError, "upload_failed", "Не удалось сохранить изображение. Проверь права пользователя сервиса на UPLOAD_DIR.")
		return
	}
	services.WriteJSON(w, http.StatusCreated, map[string]any{"image_url": "/uploads/" + filename, "width": config.Width, "height": config.Height, "format": format})
}

func (h *Handler) writeCatalogError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		services.WriteError(w, http.StatusBadRequest, "invalid_input", "Проверь поля: название, идентификатор, характеристики и способность.")
	case errors.Is(err, ErrNotFound), errors.Is(err, sql.ErrNoRows):
		services.WriteError(w, http.StatusNotFound, "not_found", "Запись не найдена.")
	case errors.Is(err, ErrConflict):
		services.WriteError(w, http.StatusConflict, "already_exists", "Такой идентификатор уже существует.")
	case errors.Is(err, ErrInUse):
		services.WriteError(w, http.StatusConflict, "in_use", "Запись используется. Проверь выбранную способность или связанные иномеконы.")
	case errors.Is(err, ErrProtected):
		services.WriteError(w, http.StatusConflict, "protected", "Четыре базовые способности нельзя удалить.")
	default:
		services.WriteError(w, http.StatusInternalServerError, "internal_error", fallback)
	}
}

func parseID(w http.ResponseWriter, raw, message string) (int64, bool) {
	id, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
	if err != nil || id <= 0 {
		services.WriteError(w, http.StatusBadRequest, "invalid_id", message)
		return 0, false
	}
	return id, true
}

var _ = sql.ErrNoRows
