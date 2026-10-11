package codes

import (
	"context"
	"crypto/sha256"
	"errors"
	"strings"
)

type UseCase struct {
	repo Repository
}

func NewUseCase(repo Repository) *UseCase {
	return &UseCase{repo: repo}
}

func (u *UseCase) Redeem(ctx context.Context, telegramID int64, code string) (RedeemResult, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if len(code) < 10 || len(code) > 64 {
		return RedeemResult{}, ErrInvalidCode
	}
	hash := sha256.Sum256([]byte(code))
	result, err := u.repo.Redeem(ctx, telegramID, hash[:])
	if err != nil {
		if errors.Is(err, ErrInvalidCode) {
			return RedeemResult{}, ErrInvalidCode
		}
		return RedeemResult{}, err
	}
	return result, nil
}

func (u *UseCase) ListCreatures(ctx context.Context, telegramID int64) ([]OwnedCreature, error) {
	return u.repo.ListCreatures(ctx, telegramID)
}
