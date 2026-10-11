package admin_panel

import "time"

type CreateBatchRequest struct {
	Label         string `json:"label"`
	Count         int    `json:"count"`
	RewardPreset  string `json:"reward_preset"`
	ExpiresInDays int    `json:"expires_in_days"`
}

type Reward struct {
	Gold         int64
	CreatureSlug string
}

type NewBatch struct {
	Label              string
	RewardGold         int64
	RewardCreatureSlug string
	CreatedBy          int64
	ExpiresAt          *time.Time
	CodeHashes         [][]byte
}

type BatchSummary struct {
	ID                 int64      `json:"id"`
	Label              string     `json:"label"`
	RewardGold         int64      `json:"reward_gold"`
	RewardCreatureSlug string     `json:"reward_creature_slug,omitempty"`
	CreatedBy          int64      `json:"created_by"`
	CreatedAt          time.Time  `json:"created_at"`
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
	RevokedAt          *time.Time `json:"revoked_at,omitempty"`
	CodeCount          int64      `json:"code_count"`
	RedeemedCount      int64      `json:"redeemed_count"`
}

type CreateBatchResponse struct {
	BatchID            int64      `json:"batch_id"`
	Label              string     `json:"label"`
	Count              int        `json:"count"`
	RewardGold         int64      `json:"reward_gold"`
	RewardCreatureSlug string     `json:"reward_creature_slug,omitempty"`
	ExpiresAt          *time.Time `json:"expires_at,omitempty"`
	Codes              []string   `json:"codes"`
}
