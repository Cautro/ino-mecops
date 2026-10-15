package shop

import "time"

type EggProduct struct {
	Rarity        string         `json:"rarity"`
	RarityChances map[string]int `json:"rarity_chances,omitempty"`
	Label         string         `json:"label"`
	PriceGold     int64          `json:"price_gold"`
	ImageURL      string         `json:"image_url"`
	Description   string         `json:"description"`
	IsActive      bool           `json:"is_active"`
	UpdatedAt     time.Time      `json:"updated_at"`
}

type EggOffer struct {
	Rarity           string             `json:"rarity"`
	RarityChances    map[string]float64 `json:"rarity_chances,omitempty"`
	Label            string             `json:"label"`
	PriceGold        int64              `json:"price_gold"`
	ImageURL         string             `json:"image_url"`
	Description      string             `json:"description"`
	IsActive         bool               `json:"is_active"`
	Available        bool               `json:"available"`
	AvailableSpecies int                `json:"available_species"`
}

type EggProductUpdateInput struct {
	RarityChances map[string]int `json:"rarity_chances,omitempty"`
	Label         string         `json:"label"`
	PriceGold     int64          `json:"price_gold"`
	ImageURL      string         `json:"image_url"`
	Description   string         `json:"description"`
	IsActive      bool           `json:"is_active"`
}

type Egg struct {
	ID          int64     `json:"id"`
	Rarity      string    `json:"rarity"`
	PriceGold   int64     `json:"price_gold"`
	PurchasedAt time.Time `json:"purchased_at"`
}

type ShopData struct {
	EggOffers []EggOffer `json:"egg_offers"`
	Eggs      []Egg      `json:"eggs"`
}

type BuyEggInput struct {
	Rarity string `json:"rarity"`
}

type BuyEggResult struct {
	Egg           Egg    `json:"egg"`
	GoldBalance   int64  `json:"gold_balance"`
	CreatureID    int64  `json:"creature_id"`
	SpeciesSlug   string `json:"species_slug"`
	Name          string `json:"name"`
	ImageURL      string `json:"image_url"`
	Rarity        string `json:"rarity"`
	SellPriceGold int64  `json:"sell_price_gold"`
	GoldBonus     int64  `json:"gold_bonus"`
}

type HatchResult struct {
	EggID         int64  `json:"lootbox_id"`
	CreatureID    int64  `json:"creature_id"`
	SpeciesSlug   string `json:"species_slug"`
	Name          string `json:"name"`
	ImageURL      string `json:"image_url"`
	Rarity        string `json:"rarity"`
	SellPriceGold int64  `json:"sell_price_gold"`
	GoldBalance   int64  `json:"gold_balance"`
	GoldBonus     int64  `json:"gold_bonus"`
}

type SellResult struct {
	CreatureID  int64  `json:"creature_id"`
	SpeciesSlug string `json:"species_slug"`
	Name        string `json:"name"`
	GoldAdded   int64  `json:"gold_added"`
	GoldBalance int64  `json:"gold_balance"`
}
