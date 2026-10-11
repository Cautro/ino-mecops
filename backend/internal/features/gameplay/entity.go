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

type AbilitySnapshot struct {
	Slug                string  `json:"slug"`
	Name                string  `json:"name"`
	Power               int     `json:"power"`
	AccuracyPercent     float64 `json:"accuracy_percent"`
	CooldownSeconds     int     `json:"cooldown_seconds"`
	EffectType          string  `json:"effect_type"`
	EffectValue         int     `json:"effect_value"`
	EffectDurationTurns int     `json:"effect_duration_turns"`
}

type CreatureSnapshot struct {
	PlayerTelegramID int64           `json:"player_telegram_id"`
	PlayerName       string          `json:"player_name"`
	CreatureID       int64           `json:"creature_id"`
	SpeciesSlug      string          `json:"species_slug"`
	Name             string          `json:"name"`
	ImageURL         string          `json:"image_url"`
	Rarity           string          `json:"rarity"`
	Health           int             `json:"health"`
	Damage           int             `json:"damage"`
	CritChance       float64         `json:"crit_chance"`
	PassiveGoldHour  int64           `json:"passive_gold_per_hour"`
	Ability          AbilitySnapshot `json:"ability"`
}

type PlayerOption struct {
	TelegramID int64              `json:"telegram_id"`
	FirstName  string             `json:"first_name"`
	Username   string             `json:"username,omitempty"`
	Creatures  []CreatureSnapshot `json:"creatures"`
}

type StatusEffect struct {
	Type          string `json:"type"`
	Value         int    `json:"value"`
	TurnsLeft     int    `json:"turns_left"`
	DamagePerTurn int    `json:"damage_per_turn,omitempty"`
}

type FighterState struct {
	HP             int            `json:"hp"`
	MaxHP          int            `json:"max_hp"`
	AbilityReadyAt time.Time      `json:"ability_ready_at,omitempty"`
	Effects        []StatusEffect `json:"effects"`
}

type BattleLog struct {
	At      time.Time `json:"at"`
	Type    string    `json:"type"`
	Message string    `json:"message"`
}

type CombatState struct {
	CurrentTurnTelegramID int64        `json:"current_turn_telegram_id"`
	Round                 int          `json:"round"`
	Challenger            FighterState `json:"challenger"`
	Opponent              FighterState `json:"opponent"`
	Log                   []BattleLog  `json:"log"`
}

type Battle struct {
	ID                    int64            `json:"id"`
	Status                string           `json:"status"`
	ChallengerTelegramID  int64            `json:"challenger_telegram_id"`
	ChallengerName        string           `json:"challenger_name"`
	OpponentTelegramID    int64            `json:"opponent_telegram_id"`
	OpponentName          string           `json:"opponent_name"`
	ChallengerCreature    CreatureSnapshot `json:"challenger_creature"`
	OpponentCreature      CreatureSnapshot `json:"opponent_creature"`
	CurrentTurnTelegramID int64            `json:"current_turn_telegram_id,omitempty"`
	WinnerTelegramID      int64            `json:"winner_telegram_id,omitempty"`
	State                 CombatState      `json:"state"`
	CreatedAt             time.Time        `json:"created_at"`
	UpdatedAt             time.Time        `json:"updated_at"`
	FinishedAt            *time.Time       `json:"finished_at,omitempty"`
}

type CreateBattleInput struct {
	MyCreatureID       int64 `json:"my_creature_id"`
	OpponentCreatureID int64 `json:"opponent_creature_id"`
}

type TurnInput struct {
	Action string `json:"action"`
}

type TurnResult struct {
	Battle  Battle `json:"battle"`
	Message string `json:"message"`
}
