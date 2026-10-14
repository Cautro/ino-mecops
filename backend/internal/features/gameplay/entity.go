package gameplay

import "time"

type MainBonusType string

const (
	MainBonusNone          MainBonusType = "none"
	MainBonusLootboxChance MainBonusType = "lootbox_chance"
	MainBonusLootboxGold   MainBonusType = "lootbox_gold"
	MainBonusPassiveIncome MainBonusType = "passive_income"
)

type MainSlotOption struct {
	CreatureID         int64   `json:"creature_id"`
	SpeciesSlug        string  `json:"species_slug"`
	Name               string  `json:"name"`
	ImageURL           string  `json:"image_url"`
	Rarity             string  `json:"rarity"`
	PassiveGoldPerHour float64 `json:"passive_gold_per_hour"`
	BonusType          string  `json:"bonus_type"`
	BonusMultiplier    float64 `json:"bonus_multiplier"`
	Selected           bool    `json:"selected"`
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
	Rank               int     `json:"rank"`
	Name               string  `json:"name"`
	CreatureCount      int     `json:"creature_count"`
	PassiveGoldPerHour float64 `json:"passive_gold_per_hour"`
}

type ContainerSpendLeaderboardEntry struct {
	Rank             int    `json:"rank"`
	Name             string `json:"name"`
	TotalSpentGold   int64  `json:"total_spent_gold"`
	ContainersBought int64  `json:"containers_bought"`
}

type PlaceholderLeaderboard struct {
	Available bool   `json:"available"`
	Message   string `json:"message"`
	Items     []any  `json:"items"`
}

type LeaderboardData struct {
	Collection        []CollectionLeaderboardEntry     `json:"collection"`
	ContainerSpending []ContainerSpendLeaderboardEntry `json:"container_spending"`
	Battles           PlaceholderLeaderboard           `json:"battles"`
}

type Overview struct {
	TelegramID         int64     `json:"telegram_id"`
	Username           string    `json:"username,omitempty"`
	FirstName          string    `json:"first_name"`
	Gold               int64     `json:"gold"`
	CreatedAt          time.Time `json:"created_at"`
	PassiveGoldPerHour float64   `json:"passive_gold_per_hour"`
	PassiveGoldClaimed int64     `json:"passive_gold_claimed"`
	LastPassiveClaimAt time.Time `json:"last_passive_claim_at"`
	OwnedCreatureCount int       `json:"owned_creature_count"`
}
