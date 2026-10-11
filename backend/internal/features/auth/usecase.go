package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

var (
	ErrInvalidInitData = errors.New("invalid Telegram Mini App init data")
	ErrExpiredInitData = errors.New("Telegram Mini App init data has expired")
)

type UseCase struct {
	botToken string
	repo     Repository
	maxAge   time.Duration
}

func NewUseCase(botToken string, repo Repository) *UseCase {
	return &UseCase{botToken: botToken, repo: repo, maxAge: 24 * time.Hour}
}

func (u *UseCase) Authenticate(raw string) (TelegramUser, error) {
	return ValidateInitData(raw, u.botToken, u.maxAge, time.Now())
}

func (u *UseCase) EnsurePlayer(ctx context.Context, user TelegramUser) error {
	return u.repo.UpsertPlayer(ctx, user)
}

func (u *UseCase) GetPlayer(ctx context.Context, telegramID int64) (Player, error) {
	return u.repo.GetPlayer(ctx, telegramID)
}

// ValidateInitData validates the HMAC and the auth_date on Telegram.WebApp.initData.
func ValidateInitData(raw, botToken string, maxAge time.Duration, now time.Time) (TelegramUser, error) {
	if raw == "" || botToken == "" || len(raw) > 16*1024 {
		return TelegramUser{}, ErrInvalidInitData
	}
	values, err := url.ParseQuery(raw)
	if err != nil {
		return TelegramUser{}, ErrInvalidInitData
	}
	for _, entries := range values {
		if len(entries) != 1 {
			return TelegramUser{}, ErrInvalidInitData
		}
	}
	providedHash := values.Get("hash")
	if len(providedHash) != sha256.Size*2 {
		return TelegramUser{}, ErrInvalidInitData
	}
	providedHashBytes, err := hex.DecodeString(providedHash)
	if err != nil {
		return TelegramUser{}, ErrInvalidInitData
	}

	keys := make([]string, 0, len(values))
	for key := range values {
		if key != "hash" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values.Get(key))
	}
	dataCheckString := strings.Join(parts, "\n")

	// Telegram Mini Apps: key="WebAppData", message=bot token.
	secretMAC := hmac.New(sha256.New, []byte("WebAppData"))
	_, _ = secretMAC.Write([]byte(botToken))
	secretKey := secretMAC.Sum(nil)
	checkMAC := hmac.New(sha256.New, secretKey)
	_, _ = checkMAC.Write([]byte(dataCheckString))
	if !hmac.Equal(checkMAC.Sum(nil), providedHashBytes) {
		return TelegramUser{}, ErrInvalidInitData
	}

	authDate, err := strconv.ParseInt(values.Get("auth_date"), 10, 64)
	if err != nil || authDate <= 0 {
		return TelegramUser{}, ErrInvalidInitData
	}
	if maxAge <= 0 {
		maxAge = 24 * time.Hour
	}
	issuedAt := time.Unix(authDate, 0)
	if issuedAt.After(now.Add(time.Minute)) {
		return TelegramUser{}, ErrInvalidInitData
	}
	if now.Sub(issuedAt) > maxAge {
		return TelegramUser{}, ErrExpiredInitData
	}

	var rawUser initDataUser
	if err := json.Unmarshal([]byte(values.Get("user")), &rawUser); err != nil || rawUser.ID <= 0 {
		return TelegramUser{}, ErrInvalidInitData
	}
	if len(rawUser.FirstName) > 256 || len(rawUser.Username) > 64 {
		return TelegramUser{}, ErrInvalidInitData
	}
	return TelegramUser{ID: rawUser.ID, FirstName: rawUser.FirstName, Username: rawUser.Username}, nil
}

func (u TelegramUser) String() string {
	return fmt.Sprintf("TelegramUser(%d)", u.ID)
}
