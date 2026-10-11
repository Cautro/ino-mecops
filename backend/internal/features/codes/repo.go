package codes

import "context"

type Repository interface {
	Redeem(ctx context.Context, telegramID int64, codeHash []byte) (RedeemResult, error)
	ListCreatures(ctx context.Context, telegramID int64) ([]OwnedCreature, error)
}
