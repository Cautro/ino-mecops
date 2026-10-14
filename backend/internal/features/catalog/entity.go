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
	ID                  int64     `json:"id"`
	Slug                string    `json:"slug"`
	Name                string    `json:"name"`
	Description         string    `json:"description"`
	ImageURL            string    `json:"image_url"`
	SellPriceGold       int64     `json:"sell_price_gold"`
	Rarity              string    `json:"rarity"`
	PassiveGoldPerHour  float64   `json:"passive_gold_per_hour"`
	Health              float64   `json:"health"`
	Damage              float64   `json:"damage"`
	CritChance          float64   `json:"crit_chance"`
	AbilityID           int64     `json:"ability_id"`
	AbilityName         string    `json:"ability_name"`
	AbilitySlug         string    `json:"ability_slug"`
	IsActive            bool      `json:"is_active"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
	IsFeatured          bool      `json:"is_featured"`
	MainBonusType       string    `json:"main_bonus_type"`
	MainBonusMultiplier float64   `json:"main_bonus_multiplier"`
}

// CollectionSpecies is the player-facing collection entry. For undiscovered
// species, only ID and Locked are serialized; the private fields stay nil so
// encoding/json omits them rather than exposing secrets to the browser.
type CollectionSpecies struct {
	ID                  int64    `json:"id"`
	Locked              bool     `json:"locked"`
	Slug                *string  `json:"slug,omitempty"`
	Name                *string  `json:"name,omitempty"`
	Description         *string  `json:"description,omitempty"`
	ImageURL            *string  `json:"image_url,omitempty"`
	SellPriceGold       *int64   `json:"sell_price_gold,omitempty"`
	Rarity              *string  `json:"rarity,omitempty"`
	PassiveGoldPerHour  *float64 `json:"passive_gold_per_hour,omitempty"`
	Health              *float64 `json:"health,omitempty"`
	Damage              *float64 `json:"damage,omitempty"`
	CritChance          *float64 `json:"crit_chance,omitempty"`
	AbilityID           *int64   `json:"ability_id,omitempty"`
	AbilityName         *string  `json:"ability_name,omitempty"`
	AbilitySlug         *string  `json:"ability_slug,omitempty"`
	MainBonusType       *string  `json:"main_bonus_type,omitempty"`
	MainBonusMultiplier *float64 `json:"main_bonus_multiplier,omitempty"`
}

func collectionSpecies(item Species, discovered bool) CollectionSpecies {
	card := CollectionSpecies{ID: item.ID, Locked: !discovered}
	if !discovered {
		return card
	}
	card.Slug = &item.Slug
	card.Name = &item.Name
	card.Description = &item.Description
	card.ImageURL = &item.ImageURL
	card.SellPriceGold = &item.SellPriceGold
	card.Rarity = &item.Rarity
	card.PassiveGoldPerHour = &item.PassiveGoldPerHour
	card.Health = &item.Health
	card.Damage = &item.Damage
	card.CritChance = &item.CritChance
	card.AbilityID = &item.AbilityID
	card.AbilityName = &item.AbilityName
	card.AbilitySlug = &item.AbilitySlug
	card.MainBonusType = &item.MainBonusType
	card.MainBonusMultiplier = &item.MainBonusMultiplier
	return card
}

type SpeciesInput struct {
	Slug                string  `json:"slug"`
	Name                string  `json:"name"`
	Description         string  `json:"description"`
	ImageURL            string  `json:"image_url"`
	SellPriceGold       int64   `json:"sell_price_gold"`
	Rarity              string  `json:"rarity"`
	PassiveGoldPerHour  float64 `json:"passive_gold_per_hour"`
	Health              float64 `json:"health"`
	Damage              float64 `json:"damage"`
	CritChance          float64 `json:"crit_chance"`
	AbilityID           int64   `json:"ability_id"`
	IsFeatured          bool    `json:"is_featured"`
	MainBonusType       string  `json:"main_bonus_type"`
	MainBonusMultiplier float64 `json:"main_bonus_multiplier"`
}

type SpeciesUpdateInput struct {
	Name                string  `json:"name"`
	Description         string  `json:"description"`
	ImageURL            string  `json:"image_url"`
	SellPriceGold       int64   `json:"sell_price_gold"`
	Rarity              string  `json:"rarity"`
	PassiveGoldPerHour  float64 `json:"passive_gold_per_hour"`
	Health              float64 `json:"health"`
	Damage              float64 `json:"damage"`
	CritChance          float64 `json:"crit_chance"`
	AbilityID           int64   `json:"ability_id"`
	IsFeatured          bool    `json:"is_featured"`
	MainBonusType       string  `json:"main_bonus_type"`
	MainBonusMultiplier float64 `json:"main_bonus_multiplier"`
}
