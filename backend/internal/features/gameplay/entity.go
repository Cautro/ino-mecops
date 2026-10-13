package gameplay

import "time"

type Overview struct {
	TelegramID         int64     `json:"telegram_id"`
	Username           string    `json:"username,omitempty"`
	FirstName          string    `json:"first_name"`
	Gold               int64     `json:"gold"`
	CreatedAt          time.Time `json:"created_at"`
	PassiveGoldPerHour int64     `json:"passive_gold_per_hour"`
	PassiveGoldClaimed int64     `json:"passive_gold_claimed"`
	LastPassiveClaimAt time.Time `json:"last_passive_claim_at"`
	OwnedCreatureCount int       `json:"owned_creature_count"`
}

type SlotSpinInput struct {
	Bet int64 `json:"bet"`
}

type SlotSpinResult struct {
	Symbols      [3]string `json:"symbols"`
	Bet          int64     `json:"bet"`
	Payout       int64     `json:"payout"`
	Net          int64     `json:"net"`
	GoldBalance  int64     `json:"gold_balance"`
	WinType      string    `json:"win_type"`
	Multiplier   float64   `json:"multiplier"`
	CreatureSlug string    `json:"creature_slug,omitempty"`
	CreatureName string    `json:"creature_name,omitempty"`
	Message      string    `json:"message"`
}
