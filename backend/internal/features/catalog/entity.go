package catalog

import "time"

type Ability struct {
	ID                  int64     `json:"id"`
	Slug                string    `json:"slug"`
	Name                string    `json:"name"`
	Description         string    `json:"description"`
	Element             string    `json:"element"`
	Power               int       `json:"power"`
	AccuracyPercent     float64   `json:"accuracy_percent"`
	CooldownSeconds     int       `json:"cooldown_seconds"`
	EffectType          string    `json:"effect_type"`
	EffectValue         int       `json:"effect_value"`
	EffectDurationTurns int       `json:"effect_duration_turns"`
	IsDefault           bool      `json:"is_default"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

type AbilityInput struct {
	Slug                string  `json:"slug"`
	Name                string  `json:"name"`
	Description         string  `json:"description"`
	Element             string  `json:"element"`
	Power               int     `json:"power"`
	AccuracyPercent     float64 `json:"accuracy_percent"`
	CooldownSeconds     int     `json:"cooldown_seconds"`
	EffectType          string  `json:"effect_type"`
	EffectValue         int     `json:"effect_value"`
	EffectDurationTurns int     `json:"effect_duration_turns"`
}

type AbilityUpdateInput struct {
	Name                string  `json:"name"`
	Description         string  `json:"description"`
	Element             string  `json:"element"`
	Power               int     `json:"power"`
	AccuracyPercent     float64 `json:"accuracy_percent"`
	CooldownSeconds     int     `json:"cooldown_seconds"`
	EffectType          string  `json:"effect_type"`
	EffectValue         int     `json:"effect_value"`
	EffectDurationTurns int     `json:"effect_duration_turns"`
}

type Species struct {
	ID                 int64     `json:"id"`
	Slug               string    `json:"slug"`
	Name               string    `json:"name"`
	Description        string    `json:"description"`
	ImageURL           string    `json:"image_url"`
	Rarity             string    `json:"rarity"`
	PassiveGoldPerHour int64     `json:"passive_gold_per_hour"`
	Health             int       `json:"health"`
	Damage             int       `json:"damage"`
	CritChance         float64   `json:"crit_chance"`
	AbilityID          int64     `json:"ability_id"`
	AbilityName        string    `json:"ability_name"`
	AbilitySlug        string    `json:"ability_slug"`
	IsActive           bool      `json:"is_active"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

type SpeciesInput struct {
	Slug               string  `json:"slug"`
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	ImageURL           string  `json:"image_url"`
	Rarity             string  `json:"rarity"`
	PassiveGoldPerHour int64   `json:"passive_gold_per_hour"`
	Health             int     `json:"health"`
	Damage             int     `json:"damage"`
	CritChance         float64 `json:"crit_chance"`
	AbilityID          int64   `json:"ability_id"`
}

type SpeciesUpdateInput struct {
	Name               string  `json:"name"`
	Description        string  `json:"description"`
	ImageURL           string  `json:"image_url"`
	Rarity             string  `json:"rarity"`
	PassiveGoldPerHour int64   `json:"passive_gold_per_hour"`
	Health             int     `json:"health"`
	Damage             int     `json:"damage"`
	CritChance         float64 `json:"crit_chance"`
	AbilityID          int64   `json:"ability_id"`
}
