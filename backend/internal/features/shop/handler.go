package shop

import (
	"database/sql"
	"errors"
	"log"
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
