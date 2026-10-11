package admin_panel

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"errors"
	"fmt"
	"strings"
	"time"
)

var ErrInvalidBatch = errors.New("invalid code batch request")

const maxBatchSize = 500

type UseCase struct {
	repo Repository
}

func NewUseCase(repo Repository) *UseCase {
	return &UseCase{repo: repo}
}

func rewardForPreset(preset string) (Reward, error) {
	switch preset {
	case "gold50":
		return Reward{Gold: 50}, nil
	case "gold500":
		return Reward{Gold: 500}, nil
	case "mecop150":
		return Reward{Gold: 150, CreatureSlug: "ino-sprout"}, nil
	default:
		return Reward{}, ErrInvalidBatch
	}
}

func (u *UseCase) CreateBatch(ctx context.Context, createdBy int64, req CreateBatchRequest) (CreateBatchResponse, error) {
	req.Label = strings.TrimSpace(req.Label)
	if len(req.Label) < 1 || len(req.Label) > 100 || req.Count < 1 || req.Count > maxBatchSize || req.ExpiresInDays < 0 || req.ExpiresInDays > 365 {
		return CreateBatchResponse{}, ErrInvalidBatch
	}
	reward, err := rewardForPreset(req.RewardPreset)
	if err != nil {
		return CreateBatchResponse{}, err
	}
	var expiresAt *time.Time
	if req.ExpiresInDays > 0 {
		t := time.Now().UTC().Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)
		expiresAt = &t
	}

	rawCodes := make([]string, req.Count)
	hashes := make([][]byte, req.Count)
	for i := 0; i < req.Count; i++ {
		code, err := generateCode()
		if err != nil {
			return CreateBatchResponse{}, fmt.Errorf("generate code: %w", err)
		}
		rawCodes[i] = code
		hash := sha256.Sum256([]byte(code))
		hashes[i] = append([]byte(nil), hash[:]...)
	}

	batchID, err := u.repo.CreateBatch(ctx, NewBatch{
		Label: req.Label, RewardGold: reward.Gold, RewardCreatureSlug: reward.CreatureSlug,
		CreatedBy: createdBy, ExpiresAt: expiresAt, CodeHashes: hashes,
	})
	if err != nil {
		return CreateBatchResponse{}, err
	}
	return CreateBatchResponse{
		BatchID: batchID, Label: req.Label, Count: req.Count,
		RewardGold: reward.Gold, RewardCreatureSlug: reward.CreatureSlug,
		ExpiresAt: expiresAt, Codes: rawCodes,
	}, nil
}

func generateCode() (string, error) {
	// Base32 encodes 128 random bits into a code that can be copied from a card.
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	encoded := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buffer)
	return "INOME-" + encoded, nil
}

func (u *UseCase) ListBatches(ctx context.Context, limit, offset int) ([]BatchSummary, error) {
	if limit < 1 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	if offset > 10000 {
		offset = 10000
	}
	return u.repo.ListBatches(ctx, limit, offset)
}

func (u *UseCase) RevokeBatch(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrBatchNotFound
	}
	return u.repo.RevokeBatch(ctx, id)
}
