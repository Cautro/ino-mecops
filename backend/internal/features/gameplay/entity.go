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
	Bet        int64  `json:"bet,omitempty"`
	BetType    string `json:"bet_type,omitempty"`
	CreatureID int64  `json:"creature_id,omitempty"`
}

type SlotCreatureReward struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type SlotSpinResult struct {
	Symbols           [3]string            `json:"symbols"`
	BetType           string               `json:"bet_type"`
	Bet               int64                `json:"bet"`
	Payout            int64                `json:"payout"`
	Net               int64                `json:"net"`
	GoldBalance       int64                `json:"gold_balance"`
	WinType           string               `json:"win_type"`
	Multiplier        float64              `json:"multiplier"`
	CreatureSlug      string               `json:"creature_slug,omitempty"`
	CreatureName      string               `json:"creature_name,omitempty"`
	BetCreatureID     int64                `json:"bet_creature_id,omitempty"`
	BetCreatureSlug   string               `json:"bet_creature_slug,omitempty"`
	BetCreatureName   string               `json:"bet_creature_name,omitempty"`
	CreatureStakeLost bool                 `json:"creature_stake_lost,omitempty"`
	CreatureRewards   []SlotCreatureReward `json:"creature_rewards,omitempty"`
	Message           string               `json:"message"`
}
