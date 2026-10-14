package subscription

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/cautro/inomecops/backend/internal/features/auth"
	"github.com/cautro/inomecops/backend/internal/services"
)

var (
	ErrDisabled          = errors.New("subscription reward is not configured")
	ErrNotSubscribed     = errors.New("player has not subscribed")
	ErrTelegramCheck     = errors.New("could not verify Telegram membership")
	ErrRewardUnavailable = errors.New("configured subscription creature is unavailable")
)

type Handler struct {
	db             *sql.DB
	botToken       string
	channelURL     string
	chatID         string
	title          string
	message        string
	rewardGold     int64
	rewardCreature string
	client         *http.Client
}

type StatusResponse struct {
	Enabled            bool   `json:"enabled"`
	URL                string `json:"url"`
	Title              string `json:"title"`
	Message            string `json:"message"`
	RewardGold         int64  `json:"reward_gold"`
	RewardCreatureSlug string `json:"reward_creature_slug,omitempty"`
	RewardCreatureName string `json:"reward_creature_name,omitempty"`
	Claimed            bool   `json:"claimed"`
}

type ClaimResponse struct {
	Claimed        bool   `json:"claimed"`
	AlreadyClaimed bool   `json:"already_claimed"`
	GoldAdded      int64  `json:"gold_added"`
	GoldBalance    int64  `json:"gold_balance"`
	CreatureSlug   string `json:"creature_slug,omitempty"`
	CreatureName   string `json:"creature_name,omitempty"`
}

func NewHandler(db *sql.DB, botToken, channelURL, chatID, title, message string, rewardGold int64, rewardCreature string) *Handler {
	if strings.TrimSpace(title) == "" {
		title = "Подпишись на канал Иномекопов"
	}
	if strings.TrimSpace(message) == "" {
		message = "Подпишись на канал и вернись сюда за наградой."
	}
	return &Handler{
		db: db, botToken: strings.TrimSpace(botToken), channelURL: strings.TrimSpace(channelURL),
		chatID: strings.TrimSpace(chatID), title: strings.TrimSpace(title), message: strings.TrimSpace(message),
		rewardGold: rewardGold, rewardCreature: strings.TrimSpace(rewardCreature),
		client: &http.Client{Timeout: 6 * time.Second},
	}
}

func (h *Handler) configured() bool {
	return h.channelURL != "" && h.chatID != "" && h.botToken != "" && (h.rewardGold > 0 || h.rewardCreature != "")
}

func (h *Handler) Status(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	status, err := h.status(r.Context(), user.ID)
	if err != nil {
		log.Printf("subscription status failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "subscription_status_failed", "Не удалось проверить бонус за подписку.")
		return
	}
	services.WriteJSON(w, http.StatusOK, status)
}

func (h *Handler) Claim(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.IdentityFromContext(r.Context())
	if !ok {
		services.WriteError(w, http.StatusUnauthorized, "unauthorized", "Требуется авторизация.")
		return
	}
	if !h.configured() {
		services.WriteError(w, http.StatusServiceUnavailable, "subscription_disabled", "Бонус за подписку пока не настроен администратором.")
		return
	}
	already, balance, err := h.alreadyClaimed(r.Context(), user.ID)
	if err != nil {
		log.Printf("subscription claim lookup failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "subscription_claim_failed", "Не удалось проверить предыдущую награду.")
		return
	}
	if already {
		services.WriteJSON(w, http.StatusOK, ClaimResponse{Claimed: true, AlreadyClaimed: true, GoldBalance: balance})
		return
	}
	isMember, err := h.telegramMember(r.Context(), user.ID)
	if err != nil {
		log.Printf("subscription Telegram membership check failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusBadGateway, "subscription_check_failed", "Telegram не смог проверить подписку. Убедись, что бот добавлен администратором канала, и попробуй снова.")
		return
	}
	if !isMember {
		services.WriteError(w, http.StatusConflict, "subscription_required", "Пока не вижу подписку. Подпишись на канал и нажми проверку ещё раз.")
		return
	}

	result, err := h.claimReward(r.Context(), user.ID)
	if err != nil {
		if errors.Is(err, ErrRewardUnavailable) {
			services.WriteError(w, http.StatusConflict, "subscription_reward_unavailable", "Настроенный иномекон-награда недоступен. Сообщи администратору.")
			return
		}
		log.Printf("subscription reward failed: player=%d err=%v", user.ID, err)
		services.WriteError(w, http.StatusInternalServerError, "subscription_claim_failed", "Не удалось начислить награду. Попробуй ещё раз.")
		return
	}
	services.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) status(ctx context.Context, telegramID int64) (StatusResponse, error) {
	claimed, _, err := h.alreadyClaimed(ctx, telegramID)
	if err != nil {
		return StatusResponse{}, err
	}
	result := StatusResponse{
		Enabled: h.configured(), URL: h.channelURL, Title: h.title, Message: h.message,
		RewardGold: h.rewardGold, RewardCreatureSlug: h.rewardCreature, Claimed: claimed,
	}
	if h.rewardCreature != "" {
		_ = h.db.QueryRowContext(ctx, `SELECT name FROM creature_species WHERE slug=$1`, h.rewardCreature).Scan(&result.RewardCreatureName)
	}
	return result, nil
}

func (h *Handler) alreadyClaimed(ctx context.Context, telegramID int64) (bool, int64, error) {
	var claimed bool
	var balance int64
	if err := h.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM subscription_claims WHERE player_telegram_id=$1)`, telegramID).Scan(&claimed); err != nil {
		return false, 0, err
	}
	if err := h.db.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1`, telegramID).Scan(&balance); err != nil {
		return false, 0, err
	}
	return claimed, balance, nil
}

func (h *Handler) telegramMember(ctx context.Context, telegramID int64) (bool, error) {
	endpoint := fmt.Sprintf("https://api.telegram.org/bot%s/getChatMember?chat_id=%s&user_id=%d", h.botToken, url.QueryEscape(h.chatID), telegramID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false, err
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	var payload struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			Status   string `json:"status"`
			IsMember bool   `json:"is_member"`
		} `json:"result"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&payload); err != nil {
		return false, err
	}
	if resp.StatusCode != http.StatusOK || !payload.OK {
		return false, fmt.Errorf("Telegram getChatMember failed: HTTP %d: %s", resp.StatusCode, payload.Description)
	}
	switch payload.Result.Status {
	case "creator", "administrator", "member":
		return true, nil
	case "restricted":
		return payload.Result.IsMember, nil
	case "left", "kicked":
		return false, nil
	default:
		return false, fmt.Errorf("Telegram returned unknown chat member status %q", payload.Result.Status)
	}
}

func (h *Handler) claimReward(ctx context.Context, telegramID int64) (ClaimResponse, error) {
	tx, err := h.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return ClaimResponse{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&balance); err != nil {
		return ClaimResponse{}, err
	}
	var claimed bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM subscription_claims WHERE player_telegram_id=$1)`, telegramID).Scan(&claimed); err != nil {
		return ClaimResponse{}, err
	}
	if claimed {
		if err := tx.Commit(); err != nil {
			return ClaimResponse{}, err
		}
		return ClaimResponse{Claimed: true, AlreadyClaimed: true, GoldBalance: balance}, nil
	}

	result := ClaimResponse{Claimed: true, GoldBalance: balance, GoldAdded: h.rewardGold}
	if h.rewardGold > 0 {
		if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold+$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, h.rewardGold).Scan(&result.GoldBalance); err != nil {
			return ClaimResponse{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'subscription_reward')`, telegramID, h.rewardGold); err != nil {
			return ClaimResponse{}, err
		}
	}
	if h.rewardCreature != "" {
		if err := tx.QueryRowContext(ctx, `SELECT name FROM creature_species WHERE slug=$1 AND is_active=TRUE`, h.rewardCreature).Scan(&result.CreatureName); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ClaimResponse{}, ErrRewardUnavailable
			}
			return ClaimResponse{}, err
		}
		result.CreatureSlug = h.rewardCreature
		if _, err := tx.ExecContext(ctx, `INSERT INTO player_creatures (owner_telegram_id, species_slug) VALUES ($1,$2)`, telegramID, h.rewardCreature); err != nil {
			return ClaimResponse{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO player_discovered_species (player_telegram_id, species_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING`, telegramID, h.rewardCreature); err != nil {
			return ClaimResponse{}, err
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO subscription_claims (player_telegram_id, reward_gold, reward_creature_slug) VALUES ($1,$2,$3)`, telegramID, h.rewardGold, nullableSlug(h.rewardCreature)); err != nil {
		return ClaimResponse{}, err
	}
	if err := tx.Commit(); err != nil {
		return ClaimResponse{}, err
	}
	return result, nil
}

func nullableSlug(value string) any {
	if value == "" {
		return nil
	}
	return value
}
