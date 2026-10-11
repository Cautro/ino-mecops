package auth

import "context"

type Repository interface {
	UpsertPlayer(ctx context.Context, user TelegramUser) error
	GetPlayer(ctx context.Context, telegramID int64) (Player, error)
}
