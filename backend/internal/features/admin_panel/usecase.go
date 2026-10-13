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
		return Reward{Name: "Золотой запас", Rarity: "Обычная", Gold: 50}, nil
	case "gold500":
		return Reward{Name: "Большой золотой запас", Rarity: "Редкая", Gold: 500}, nil
	case "mecop150":
		return Reward{Name: "Набор иномекона", Rarity: "Эпическая", Gold: 150, CreatureSlug: "ino-sprout"}, nil
	default:
		return Reward{}, ErrInvalidBatch
	}
}

func (u *UseCase) CreateBatch(ctx context.Context, createdBy int64, req CreateBatchRequest) (CreateBatchResponse, error) {
	req.Label = strings.TrimSpace(req.Label)
	if len(req.Label) < 1 || len(req.Label) > 100 || req.Count < 1 || req.Count > maxBatchSize || req.ExpiresInDays < 0 || req.ExpiresInDays > 365 {
		return CreateBatchResponse{}, ErrInvalidBatch
	}

	reward := Reward{
		Name: strings.TrimSpace(req.RewardName), Rarity: strings.TrimSpace(req.RewardRarity),
		Gold: req.RewardGold, CreatureSlug: strings.TrimSpace(req.RewardCreatureSlug),
	}
	// Compatibility path for older frontends that still submit a preset.
	if reward.Gold == 0 && reward.CreatureSlug == "" && req.RewardPreset != "" {
		var err error
		reward, err = rewardForPreset(req.RewardPreset)
		if err != nil {
			return CreateBatchResponse{}, err
		}
	}
	if reward.Name == "" {
		reward.Name = "Пользовательская награда"
	}
	if reward.Rarity == "" {
		reward.Rarity = "Обычная"
	}
	if len([]rune(reward.Name)) > 80 || len([]rune(reward.Rarity)) > 32 || reward.Gold < 0 || reward.Gold > 100_000_000 || (reward.Gold == 0 && reward.CreatureSlug == "") || strings.ContainsAny(reward.Rarity, "\r\n\x00") {
		return CreateBatchResponse{}, ErrInvalidBatch
	}
	if reward.CreatureSlug != "" {
		if len(reward.CreatureSlug) > 48 || !validSlug(reward.CreatureSlug) {
			return CreateBatchResponse{}, ErrInvalidBatch
		}
		active, err := u.repo.ActiveSpeciesExists(ctx, reward.CreatureSlug)
		if err != nil {
			return CreateBatchResponse{}, err
		}
		if !active {
			return CreateBatchResponse{}, ErrInvalidBatch
		}
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
		Label: req.Label, RewardName: reward.Name, RewardRarity: reward.Rarity,
		RewardGold: reward.Gold, RewardCreatureSlug: reward.CreatureSlug,
		CreatedBy: createdBy, ExpiresAt: expiresAt, CodeHashes: hashes, CodeValues: rawCodes,
	})
	if err != nil {
		return CreateBatchResponse{}, err
	}
	return CreateBatchResponse{
		BatchID: batchID, Label: req.Label, Count: req.Count, RewardName: reward.Name,
		RewardRarity: reward.Rarity, RewardGold: reward.Gold, RewardCreatureSlug: reward.CreatureSlug,
		ExpiresAt: expiresAt, Codes: rawCodes,
	}, nil
}

func validSlug(value string) bool {
	if len(value) < 2 || value[0] == '-' || value[len(value)-1] == '-' {
		return false
	}
	lastDash := false
	for _, ch := range value {
		if ch == '-' {
			if lastDash {
				return false
			}
			lastDash = true
			continue
		}
		if (ch < 'a' || ch > 'z') && (ch < '0' || ch > '9') {
			return false
		}
		lastDash = false
	}
	return true
}

func (u *UseCase) ListBatchCodes(ctx context.Context, batchID int64) (BatchCodesResponse, error) {
	if batchID <= 0 {
		return BatchCodesResponse{}, ErrBatchNotFound
	}
	codes, err := u.repo.ListBatchCodes(ctx, batchID)
	if err != nil {
		return BatchCodesResponse{}, err
	}
	result := BatchCodesResponse{BatchID: batchID, Codes: make([]BatchCode, 0, len(codes))}
	for _, code := range codes {
		if code.Code == "" {
			result.UnavailableCount++
			continue
		}
		result.Codes = append(result.Codes, code)
	}
	return result, nil
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

func (u *UseCase) DeleteBatch(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrBatchNotFound
	}
	return u.repo.DeleteBatch(ctx, id)
}
