package shop

import (
	"database/sql"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/services"
)

type Handler struct {
	store    *Store
	adminIDs map[int64]struct{}
}

func NewHandler(db *sql.DB, adminIDs map[int64]struct{}) *Handler {
	admins := make(map[int64]struct{}, len(adminIDs))
	for id := range adminIDs {
		admins[id] = struct{}{}
	}
	return &Handler{store: NewStore(db), adminIDs: admins}
}

func (h *Handler) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return false
	}
	if _, allowed := h.adminIDs[user.ID]; !allowed {
		services.WriteError(w, http.StatusForbidden, "forbidden", "Нет прав на изменение магазина.")
		return false
	}
	return true
}

func (h *Handler) ListAdminEggs(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	items, err := h.store.ListEggProducts(r.Context())
	if err != nil {
		log.Printf("admin list egg products failed: %v", err)
		services.WriteError(w, http.StatusInternalServerError, "egg_catalog_failed", "Не удалось загрузить настройки яиц.")
		return
	}
	services.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *Handler) UpdateAdminEgg(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	rarity := strings.TrimSpace(r.PathValue("rarity"))
	var input EggProductUpdateInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Некорректные настройки яйца.")
		return
	}
	item, err := h.store.UpdateEggProduct(r.Context(), rarity, input)
	if err != nil {
		if errors.Is(err, ErrInvalidEggProduct) || errors.Is(err, ErrInvalidRarity) {
			services.WriteError(w, http.StatusBadRequest, "invalid_egg_product", "Проверь название, цену, описание и изображение яйца.")
			return
		}
		log.Printf("admin update egg product failed: rarity=%q err=%v", rarity, err)
		services.WriteError(w, http.StatusInternalServerError, "egg_product_update_failed", "Не удалось сохранить настройки яйца.")
		return
	}
	services.WriteJSON(w, http.StatusOK, item)
}

func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	result, err := h.store.Shop(r.Context(), user.ID)
	if err != nil {
		log.Printf("Shop overview failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "shop_failed", "Не удалось загрузить магазин.")
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) BuyEgg(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	var input BuyEggInput
	if err := services.DecodeJSON(w, r, &input); err != nil {
		services.WriteError(w, http.StatusBadRequest, "bad_request", "Выбери редкость яйца.")
		return
	}
	result, err := h.store.BuyEgg(r.Context(), user.ID, input.Rarity)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidRarity):
			services.WriteError(w, http.StatusBadRequest, "invalid_rarity", "Неизвестная редкость яйца.")
		case errors.Is(err, ErrInsufficientGold):
			services.WriteError(w, http.StatusConflict, "insufficient_gold", "Не хватает золота для покупки этого яйца.")
		case errors.Is(err, ErrSpeciesUnavailable):
			services.WriteError(w, http.StatusConflict, "egg_unavailable", "В этой редкости пока нет активных иномеконов. Сначала добавь такой вид в каталог.")
		case errors.Is(err, ErrPlayerNotFound):
			services.WriteError(w, http.StatusNotFound, "player_not_found", "Игровой профиль не найден.")
		default:
			log.Printf("BuyEgg failed: player=%d rarity=%q err=%v", user.ID, input.Rarity, err)
			services.WriteError(w, http.StatusInternalServerError, "egg_purchase_failed", "Не удалось купить яйцо.")
		}
		return
	}
	services.WriteJSON(w, http.StatusCreated, result)
}

func (h *Handler) HatchEgg(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		services.WriteError(w, http.StatusBadRequest, "invalid_egg", "Некорректный номер яйца.")
		return
	}
	result, err := h.store.HatchEgg(r.Context(), user.ID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrEggNotOwned):
			services.WriteError(w, http.StatusNotFound, "egg_not_owned", "Это яйцо не найдено в твоём инвентаре.")
		case errors.Is(err, ErrSpeciesUnavailable):
			services.WriteError(w, http.StatusConflict, "egg_unavailable", "В каталоге больше нет активных иномеконов этой редкости. Яйцо сохранено.")
		case errors.Is(err, ErrPlayerNotFound):
			services.WriteError(w, http.StatusNotFound, "player_not_found", "Игровой профиль не найден.")
		default:
			log.Printf("HatchEgg failed: player=%d egg=%d err=%v", user.ID, id, err)
			services.WriteError(w, http.StatusInternalServerError, "egg_hatch_failed", "Не удалось вылупить яйцо.")
		}
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) SellCreature(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		services.WriteError(w, http.StatusBadRequest, "invalid_creature", "Некорректный номер иномекона.")
		return
	}
	result, err := h.store.SellCreature(r.Context(), user.ID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrCreatureNotOwned):
			services.WriteError(w, http.StatusNotFound, "creature_not_owned", "Этот иномекон уже отсутствует в твоей коллекции.")
		case errors.Is(err, ErrCreatureNotForSale):
			services.WriteError(w, http.StatusConflict, "creature_not_for_sale", "Для этого вида не задана цена продажи. Обратись к администратору.")
		case errors.Is(err, ErrPlayerNotFound):
			services.WriteError(w, http.StatusNotFound, "player_not_found", "Игровой профиль не найден.")
		default:
			log.Printf("SellCreature failed: player=%d creature=%d err=%v", user.ID, id, err)
			services.WriteError(w, http.StatusInternalServerError, "creature_sale_failed", "Не удалось продать иномекона.")
		}
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}
