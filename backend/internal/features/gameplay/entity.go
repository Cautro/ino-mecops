package gameplay

import "time"

type MainBonusType string

const (
	MainBonusNone          MainBonusType = "none"
	MainBonusSlotChance    MainBonusType = "slot_chance"
	MainBonusSlotPayout    MainBonusType = "slot_payout"
	MainBonusPassiveIncome MainBonusType = "passive_income"
)

type MainSlotOption struct {
	CreatureID         int64  `json:"creature_id"`
	SpeciesSlug        string `json:"species_slug"`
	Name               string `json:"name"`
	ImageURL           string `json:"image_url"`
	Rarity             string `json:"rarity"`
	PassiveGoldPerHour int64  `json:"passive_gold_per_hour"`
	BonusType          string `json:"bonus_type"`
	BonusMultiplier    int    `json:"bonus_multiplier"`
	Selected           bool   `json:"selected"`
}

type MainSlotState struct {
	SelectedCreatureID int64            `json:"selected_creature_id,omitempty"`
	Selected           *MainSlotOption  `json:"selected,omitempty"`
	Options            []MainSlotOption `json:"options"`
}

type SetMainSlotInput struct {
	CreatureID int64 `json:"creature_id"`
}

type CollectionLeaderboardEntry struct {
	Rank               int    `json:"rank"`
	Name               string `json:"name"`
	CreatureCount      int    `json:"creature_count"`
	PassiveGoldPerHour int64  `json:"passive_gold_per_hour"`
}

type SlotLossLeaderboardEntry struct {
	Rank            int    `json:"rank"`
	Name            string `json:"name"`
	TotalLostGold   int64  `json:"total_lost_gold"`
	TotalBetGold    int64  `json:"total_bet_gold"`
	TotalPayoutGold int64  `json:"total_payout_gold"`
	Spins           int64  `json:"spins"`
}

type PlaceholderLeaderboard struct {
	Available bool   `json:"available"`
	Message   string `json:"message"`
	Items     []any  `json:"items"`
}

type LeaderboardData struct {
	Collection []CollectionLeaderboardEntry `json:"collection"`
	SlotLosses []SlotLossLeaderboardEntry   `json:"slot_losses"`
	Battles    PlaceholderLeaderboard       `json:"battles"`
}

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
	Symbols             [3]string            `json:"symbols"`
	BetType             string               `json:"bet_type"`
	Bet                 int64                `json:"bet"`
	Payout              int64                `json:"payout"`
	Net                 int64                `json:"net"`
	GoldBalance         int64                `json:"gold_balance"`
	WinType             string               `json:"win_type"`
	Multiplier          float64              `json:"multiplier"`
	MainBonusType       string               `json:"main_bonus_type,omitempty"`
	MainBonusMultiplier int                  `json:"main_bonus_multiplier,omitempty"`
	BonusApplied        bool                 `json:"bonus_applied,omitempty"`
	CreatureSlug        string               `json:"creature_slug,omitempty"`
	CreatureName        string               `json:"creature_name,omitempty"`
	BetCreatureID       int64                `json:"bet_creature_id,omitempty"`
	BetCreatureSlug     string               `json:"bet_creature_slug,omitempty"`
	BetCreatureName     string               `json:"bet_creature_name,omitempty"`
	CreatureStakeLost   bool                 `json:"creature_stake_lost,omitempty"`
	CreatureRewards     []SlotCreatureReward `json:"creature_rewards,omitempty"`
	Message             string               `json:"message"`
}
