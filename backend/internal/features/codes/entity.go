package codes

import "time"

type RedeemRequest struct {
	Code string `json:"code"`
}

type RedeemResult struct {
	CodeID       int64
	RewardName   string    `json:"reward_name,omitempty"`
	RewardRarity string    `json:"reward_rarity,omitempty"`
	GoldAdded    int64     `json:"gold_added"`
	GoldBalance  int64     `json:"gold_balance"`
	CreatureSlug string    `json:"creature_slug,omitempty"`
	RedeemedAt   time.Time `json:"redeemed_at"`
}

type OwnedCreature struct {
	ID          int64     `json:"id"`
	SpeciesSlug string    `json:"species_slug"`
	ObtainedAt  time.Time `json:"obtained_at"`
}
