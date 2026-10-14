package admin_panel

import "time"

type CreateBatchRequest struct {
	Label                  string   `json:"label"`
	Count                  int      `json:"count"`
	RewardMode             string   `json:"reward_mode"`
	RewardGold             int64    `json:"reward_gold"`
	RewardGoldMin          int64    `json:"reward_gold_min"`
	RewardGoldMax          int64    `json:"reward_gold_max"`
	RewardCreatureRarities []string `json:"reward_creature_rarities"`
	RewardCreatureSlug     string   `json:"reward_creature_slug"`
	RewardName             string   `json:"reward_name"`
	RewardRarity           string   `json:"reward_rarity"`
	RewardPreset           string   `json:"reward_preset"`
	ExpiresInDays          int      `json:"expires_in_days"`
}

type Reward struct {
	Name         string `json:"reward_name"`
	Rarity       string `json:"reward_rarity"`
	Gold         int64  `json:"reward_gold"`
	CreatureSlug string `json:"reward_creature_slug,omitempty"`
}

type ActiveSpeciesOption struct {
	Slug   string
	Name   string
	Rarity string
}

type NewBatch struct {
	Label                  string
	RewardMode             string
	RewardName             string
	RewardRarity           string
	RewardGold             int64
	RewardGoldMin          int64
	RewardGoldMax          int64
	RewardCreatureRarities []string
	RewardCreatureSlug     string
	CreatedBy              int64
	ExpiresAt              *time.Time
	CodeHashes             [][]byte
	CodeValues             []string
	CodeRewards            []Reward
}

type BatchCode struct {
	Code               string     `json:"code,omitempty"`
	RedeemedAt         *time.Time `json:"redeemed_at,omitempty"`
	RewardGold         int64      `json:"reward_gold"`
	RewardCreatureSlug string     `json:"reward_creature_slug,omitempty"`
	RewardName         string     `json:"reward_name,omitempty"`
	RewardRarity       string     `json:"reward_rarity,omitempty"`
}

type BatchCodesResponse struct {
	BatchID          int64       `json:"batch_id"`
	Codes            []BatchCode `json:"codes"`
	UnavailableCount int         `json:"unavailable_count"`
}

type BatchSummary struct {
	ID                     int64      `json:"id"`
	Label                  string     `json:"label"`
	RewardName             string     `json:"reward_name"`
	RewardRarity           string     `json:"reward_rarity"`
	RewardGold             int64      `json:"reward_gold"`
	RewardCreatureSlug     string     `json:"reward_creature_slug,omitempty"`
	RewardMode             string     `json:"reward_mode"`
	RewardGoldMin          int64      `json:"reward_gold_min"`
	RewardGoldMax          int64      `json:"reward_gold_max"`
	RewardCreatureRarities []string   `json:"reward_creature_rarities"`
	CreatedBy              int64      `json:"created_by"`
	CreatedAt              time.Time  `json:"created_at"`
	ExpiresAt              *time.Time `json:"expires_at,omitempty"`
	RevokedAt              *time.Time `json:"revoked_at,omitempty"`
	CodeCount              int64      `json:"code_count"`
	RedeemedCount          int64      `json:"redeemed_count"`
}

type CreateBatchResponse struct {
	BatchID                int64      `json:"batch_id"`
	Label                  string     `json:"label"`
	Count                  int        `json:"count"`
	RewardMode             string     `json:"reward_mode"`
	RewardName             string     `json:"reward_name"`
	RewardRarity           string     `json:"reward_rarity"`
	RewardGold             int64      `json:"reward_gold"`
	RewardGoldMin          int64      `json:"reward_gold_min"`
	RewardGoldMax          int64      `json:"reward_gold_max"`
	RewardCreatureRarities []string   `json:"reward_creature_rarities"`
	RewardCreatureSlug     string     `json:"reward_creature_slug,omitempty"`
	ExpiresAt              *time.Time `json:"expires_at,omitempty"`
	Codes                  []string   `json:"codes"`
	Rewards                []Reward   `json:"rewards"`
}
