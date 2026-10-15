package shop

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"math/big"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidRarity         = errors.New("invalid egg rarity")
	ErrInsufficientGold      = errors.New("not enough gold")
	ErrSpeciesUnavailable    = errors.New("no active creatures for rarity")
	ErrEggNotOwned           = errors.New("egg not owned")
	ErrCreatureNotOwned      = errors.New("creature not owned")
	ErrCreatureNotForSale    = errors.New("creature is not for sale")
	ErrPlayerNotFound        = errors.New("player not found")
	ErrInvalidEggProduct     = errors.New("invalid egg product")
	ErrInvalidMysteryChances = errors.New("invalid mystery egg rarity chances")
)

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

var rarityOrder = map[string]int{
	"common": 1, "rare": 2, "epic": 3, "legendary": 4, "mythic": 5,
}

func validEggRarity(rarity string) bool {
	_, ok := rarityOrder[rarity]
	return ok
}

func validEggKind(kind string) bool {
	// The user-facing game has a single collection container; rarity-specific eggs are retired.
	return kind == "mystery"
}

func validMysteryChances(chances map[string]int) bool {
	if len(chances) != len(rarityOrder) {
		return false
	}
	total := 0
	for rarity := range rarityOrder {
		chance, ok := chances[rarity]
		if !ok || chance < 0 || chance > 100 {
			return false
		}
		total += chance
	}
	return total == 100
}

func effectiveMysteryChances(configured map[string]int, activeCounts map[string]int) map[string]int {
	rarityNames := []string{"common", "rare", "epic", "legendary", "mythic"}
	result := map[string]int{"common": 0, "rare": 0, "epic": 0, "legendary": 0, "mythic": 0}
	total := 0
	for _, rarity := range rarityNames {
		if activeCounts[rarity] > 0 && configured[rarity] > 0 {
			total += configured[rarity]
		}
	}
	if total == 0 {
		available := make([]string, 0, len(rarityNames))
		for _, rarity := range rarityNames {
			if activeCounts[rarity] > 0 {
				available = append(available, rarity)
			}
		}
		if len(available) == 0 {
			return result
		}
		base, remainder := 100/len(available), 100%len(available)
		for i, rarity := range available {
			result[rarity] = base
			if i < remainder {
				result[rarity]++
			}
		}
		return result
	}
	type remainder struct {
		rarity string
		value  float64
	}
	remainders := make([]remainder, 0, len(rarityOrder))
	assigned := 0
	for rarity := range rarityOrder {
		if activeCounts[rarity] == 0 || configured[rarity] <= 0 {
			continue
		}
		exact := float64(configured[rarity]) * 100 / float64(total)
		base := int(exact)
		result[rarity] = base
		assigned += base
		rem := exact - float64(base)
		remainders = append(remainders, remainder{rarity: rarity, value: rem})
	}
	for assigned < 100 && len(remainders) > 0 {
		best := 0
		for i := 1; i < len(remainders); i++ {
			if remainders[i].value > remainders[best].value {
				best = i
			}
		}
		result[remainders[best].rarity]++
		remainders[best].value = -1
		assigned++
	}
	return result
}

func (s *Store) ListEggProducts(ctx context.Context) ([]EggProduct, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT rarity, label, price_gold, image_url, description, is_active, updated_at
		FROM shop_egg_catalog WHERE rarity='mystery' ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, err
	}
	items := make([]EggProduct, 0, 6)
	for rows.Next() {
		var item EggProduct
		if err := rows.Scan(&item.Rarity, &item.Label, &item.PriceGold, &item.ImageURL, &item.Description, &item.IsActive, &item.UpdatedAt); err != nil {
			rows.Close()
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()

	chances := make(map[string]int, len(rarityOrder))
	oddsRows, err := s.db.QueryContext(ctx, `SELECT rarity, chance_percent FROM shop_mystery_egg_odds`)
	if err != nil {
		return nil, err
	}
	for oddsRows.Next() {
		var rarity string
		var chance int
		if err := oddsRows.Scan(&rarity, &chance); err != nil {
			oddsRows.Close()
			return nil, err
		}
		chances[rarity] = chance
	}
	if err := oddsRows.Err(); err != nil {
		oddsRows.Close()
		return nil, err
	}
	oddsRows.Close()
	for i := range items {
		if items[i].Rarity == "mystery" {
			items[i].RarityChances = chances
		}
	}
	return items, nil
}

func (s *Store) UpdateEggProduct(ctx context.Context, rarity string, input EggProductUpdateInput) (EggProduct, error) {
	input.Label = strings.TrimSpace(input.Label)
	input.ImageURL = strings.TrimSpace(input.ImageURL)
	input.Description = strings.TrimSpace(input.Description)
	if !validEggKind(rarity) || input.Label == "" || utf8.RuneCountInString(input.Label) > 80 || input.PriceGold < 1 || input.PriceGold > 100_000_000 || utf8.RuneCountInString(input.Description) > 500 || !validEggImageURL(input.ImageURL) {
		return EggProduct{}, ErrInvalidEggProduct
	}
	if rarity == "mystery" && !validMysteryChances(input.RarityChances) {
		return EggProduct{}, ErrInvalidMysteryChances
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return EggProduct{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var item EggProduct
	err = tx.QueryRowContext(ctx, `
		UPDATE shop_egg_catalog SET label=$2, price_gold=$3, image_url=$4, description=$5, is_active=$6, updated_at=now()
		WHERE rarity=$1 RETURNING rarity, label, price_gold, image_url, description, is_active, updated_at
	`, rarity, input.Label, input.PriceGold, input.ImageURL, input.Description, input.IsActive).Scan(&item.Rarity, &item.Label, &item.PriceGold, &item.ImageURL, &item.Description, &item.IsActive, &item.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return EggProduct{}, ErrInvalidRarity
	}
	if err != nil {
		return EggProduct{}, err
	}
	if rarity == "mystery" {
		for creatureRarity, chance := range input.RarityChances {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO shop_mystery_egg_odds (rarity, chance_percent) VALUES ($1,$2)
				ON CONFLICT (rarity) DO UPDATE SET chance_percent=EXCLUDED.chance_percent, updated_at=now()
			`, creatureRarity, chance); err != nil {
				return EggProduct{}, err
			}
		}
		item.RarityChances = input.RarityChances
	}
	if err := tx.Commit(); err != nil {
		return EggProduct{}, err
	}
	return item, nil
}

func validEggImageURL(value string) bool {
	if value == "" {
		return true
	}
	if strings.HasPrefix(value, "/uploads/") {
		return !strings.Contains(value, "..") && len(value) <= 500
	}
	u, err := url.ParseRequestURI(value)
	return err == nil && u.Scheme == "https" && u.Host != "" && len(value) <= 500
}

func (s *Store) Shop(ctx context.Context, telegramID int64) (ShopData, error) {
	counts := map[string]int{}
	rows, err := s.db.QueryContext(ctx, `SELECT rarity, COUNT(*)::int FROM creature_species WHERE is_active=TRUE GROUP BY rarity`)
	if err != nil {
		return ShopData{}, err
	}
	for rows.Next() {
		var rarity string
		var count int
		if err := rows.Scan(&rarity, &count); err != nil {
			rows.Close()
			return ShopData{}, err
		}
		counts[rarity] = count
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return ShopData{}, err
	}
	rows.Close()

	products, err := s.ListEggProducts(ctx)
	if err != nil {
		return ShopData{}, err
	}
	totalActiveSpecies := 0
	for _, count := range counts {
		totalActiveSpecies += count
	}
	data := ShopData{EggOffers: make([]EggOffer, 0, 1), Eggs: make([]Egg, 0)}
	bonusType, bonusMultiplier, err := selectedContainerBonus(ctx, s.db, telegramID)
	if err != nil {
		return ShopData{}, err
	}
	for _, product := range products {
		count := totalActiveSpecies
		base := effectiveMysteryChances(product.RarityChances, counts)
		chances := applyContainerChanceBonus(base, bonusType == "lootbox_chance" && bonusMultiplier > 1, bonusMultiplier)
		data.EggOffers = append(data.EggOffers, EggOffer{
			Rarity: "mystery", RarityChances: chances, Label: product.Label, PriceGold: product.PriceGold, ImageURL: product.ImageURL,
			Description: product.Description, IsActive: product.IsActive, Available: product.IsActive && count > 0, AvailableSpecies: count,
		})
	}

	eggRows, err := s.db.QueryContext(ctx, `SELECT id, rarity, price_gold, purchased_at FROM player_eggs WHERE owner_telegram_id=$1 ORDER BY purchased_at DESC, id DESC`, telegramID)
	if err != nil {
		return ShopData{}, err
	}
	defer eggRows.Close()
	for eggRows.Next() {
		var egg Egg
		if err := eggRows.Scan(&egg.ID, &egg.Rarity, &egg.PriceGold, &egg.PurchasedAt); err != nil {
			return ShopData{}, err
		}
		data.Eggs = append(data.Eggs, egg)
	}
	if err := eggRows.Err(); err != nil {
		return ShopData{}, err
	}
	return data, nil
}

func (s *Store) BuyEgg(ctx context.Context, telegramID int64, rarity string) (BuyEggResult, error) {
	if !validEggKind(rarity) {
		return BuyEggResult{}, ErrInvalidRarity
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return BuyEggResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&balance); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return BuyEggResult{}, ErrPlayerNotFound
		}
		return BuyEggResult{}, err
	}
	var price int64
	var eggActive bool
	if err := tx.QueryRowContext(ctx, `SELECT price_gold, is_active FROM shop_egg_catalog WHERE rarity=$1 FOR UPDATE`, rarity).Scan(&price, &eggActive); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return BuyEggResult{}, ErrInvalidRarity
		}
		return BuyEggResult{}, err
	}
	var available bool
	err = tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM creature_species WHERE is_active=TRUE)`).Scan(&available)
	if err != nil {
		return BuyEggResult{}, err
	}
	if !eggActive || !available {
		return BuyEggResult{}, ErrSpeciesUnavailable
	}
	if balance < price {
		return BuyEggResult{}, ErrInsufficientGold
	}
	if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold-$2, lootbox_gold_spent_total=lootbox_gold_spent_total+$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, price).Scan(&balance); err != nil {
		return BuyEggResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'lootbox_purchase')`, telegramID, -price); err != nil {
		return BuyEggResult{}, err
	}

	// Opening happens inside the same transaction as purchase: a successful
	// purchase can never leave the user with a paid but unopened container.
	bonusType, bonusMultiplier, err := selectedContainerBonusTx(ctx, tx, telegramID)
	if err != nil {
		return BuyEggResult{}, err
	}
	chanceMultiplier := 1.0
	if bonusType == "lootbox_chance" {
		chanceMultiplier = bonusMultiplier
	}
	speciesRarity, err := chooseMysteryRarity(ctx, tx, chanceMultiplier)
	if err != nil {
		return BuyEggResult{}, err
	}
	result := BuyEggResult{
		Egg:         Egg{Rarity: rarity, PriceGold: price, PurchasedAt: time.Now().UTC()},
		GoldBalance: balance,
	}
	if err := tx.QueryRowContext(ctx, `
		SELECT slug, name, image_url, rarity, sell_price_gold
		FROM creature_species WHERE rarity=$1 AND is_active=TRUE
		ORDER BY random() LIMIT 1
	`, speciesRarity).Scan(&result.SpeciesSlug, &result.Name, &result.ImageURL, &result.Rarity, &result.SellPriceGold); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return BuyEggResult{}, ErrSpeciesUnavailable
		}
		return BuyEggResult{}, err
	}
	if err := tx.QueryRowContext(ctx, `INSERT INTO player_creatures (owner_telegram_id, species_slug) VALUES ($1,$2) RETURNING id`, telegramID, result.SpeciesSlug).Scan(&result.CreatureID); err != nil {
		return BuyEggResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO player_discovered_species (player_telegram_id, species_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING`, telegramID, result.SpeciesSlug); err != nil {
		return BuyEggResult{}, err
	}
	if bonusType == "lootbox_gold" && bonusMultiplier > 1 {
		result.GoldBonus = int64(math.Floor(float64(price) * (bonusMultiplier - 1) / 10))
		if result.GoldBonus > 0 {
			if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold+$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, result.GoldBonus).Scan(&balance); err != nil {
				return BuyEggResult{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'lootbox_gold_bonus')`, telegramID, result.GoldBonus); err != nil {
				return BuyEggResult{}, err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO lootbox_open_events (player_telegram_id, species_slug, result_rarity, container_price_gold, bonus_gold) VALUES ($1,$2,$3,$4,$5)`, telegramID, result.SpeciesSlug, result.Rarity, price, result.GoldBonus); err != nil {
		return BuyEggResult{}, err
	}
	result.GoldBalance = balance
	if err := tx.Commit(); err != nil {
		return BuyEggResult{}, err
	}
	return result, nil
}

func selectedContainerBonus(ctx context.Context, db *sql.DB, telegramID int64) (string, float64, error) {
	var kind string
	var multiplier float64
	err := db.QueryRowContext(ctx, `SELECT cs.main_bonus_type, cs.main_bonus_multiplier FROM player_main_slots ms JOIN player_creatures pc ON pc.id=ms.player_creature_id JOIN creature_species cs ON cs.slug=pc.species_slug WHERE ms.player_telegram_id=$1`, telegramID).Scan(&kind, &multiplier)
	if errors.Is(err, sql.ErrNoRows) {
		return "none", 1, nil
	}
	if err != nil {
		return "", 1, err
	}
	if multiplier < 1 {
		multiplier = 1
	}
	return kind, multiplier, nil
}

func selectedContainerBonusTx(ctx context.Context, tx *sql.Tx, telegramID int64) (string, float64, error) {
	var kind string
	var multiplier float64
	err := tx.QueryRowContext(ctx, `SELECT cs.main_bonus_type, cs.main_bonus_multiplier FROM player_main_slots ms JOIN player_creatures pc ON pc.id=ms.player_creature_id JOIN creature_species cs ON cs.slug=pc.species_slug WHERE ms.player_telegram_id=$1`, telegramID).Scan(&kind, &multiplier)
	if errors.Is(err, sql.ErrNoRows) {
		return "none", 1, nil
	}
	if err != nil {
		return "", 1, err
	}
	if multiplier < 1 {
		multiplier = 1
	}
	return kind, multiplier, nil
}

func applyContainerChanceBonus(base map[string]int, enabled bool, multiplier float64) map[string]float64 {
	rarityNames := []string{"common", "rare", "epic", "legendary", "mythic"}
	result := make(map[string]float64, len(rarityNames))
	var total float64
	for _, rarity := range rarityNames {
		weight := float64(base[rarity])
		if enabled && rarity != "common" {
			weight *= multiplier
		}
		result[rarity] = weight
		total += weight
	}
	if total <= 0 {
		return result
	}
	for _, rarity := range rarityNames {
		result[rarity] = math.Round(result[rarity]/total*10000) / 100
	}
	return result
}

func chooseMysteryRarity(ctx context.Context, tx *sql.Tx, bonusMultiplier float64) (string, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT o.rarity, o.chance_percent
		FROM shop_mystery_egg_odds o
		WHERE o.chance_percent > 0
		  AND EXISTS (SELECT 1 FROM creature_species s WHERE s.rarity=o.rarity AND s.is_active=TRUE)
		ORDER BY CASE o.rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'legendary' THEN 4 WHEN 'mythic' THEN 5 ELSE 6 END
	`)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	type option struct {
		rarity string
		weight int64
	}
	options := make([]option, 0, 5)
	var total int64
	for rows.Next() {
		var rarity string
		var configured int64
		if err := rows.Scan(&rarity, &configured); err != nil {
			return "", err
		}
		weight := configured
		if bonusMultiplier < 1 {
			bonusMultiplier = 1
		}
		if rarity != "common" && bonusMultiplier > 1 && configured > 0 {
			weight = int64(math.Round(float64(configured) * bonusMultiplier * 1000))
		} else {
			weight *= 1000
		}
		if weight > 0 {
			options = append(options, option{rarity: rarity, weight: weight})
			total += weight
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if total <= 0 {
		// All configured odds may point to rarities that currently have no active species.
		// Keep already-purchased mystery eggs hatchable by assigning equal fallback weights
		// to the rarities that do exist in the active catalog.
		fallbackRows, err := tx.QueryContext(ctx, `
			SELECT DISTINCT rarity
			FROM creature_species WHERE is_active=TRUE
			ORDER BY CASE rarity WHEN 'common' THEN 1 WHEN 'rare' THEN 2 WHEN 'epic' THEN 3 WHEN 'legendary' THEN 4 WHEN 'mythic' THEN 5 ELSE 6 END
		`)
		if err != nil {
			return "", err
		}
		for fallbackRows.Next() {
			var rarity string
			if err := fallbackRows.Scan(&rarity); err != nil {
				fallbackRows.Close()
				return "", err
			}
			options = append(options, option{rarity: rarity, weight: 1000})
			total += 1000
		}
		if err := fallbackRows.Err(); err != nil {
			fallbackRows.Close()
			return "", err
		}
		fallbackRows.Close()
	}
	if total <= 0 {
		return "", ErrSpeciesUnavailable
	}
	draw, err := crand.Int(crand.Reader, big.NewInt(total))
	if err != nil {
		return "", err
	}
	roll := draw.Int64()
	for _, item := range options {
		if roll < item.weight {
			return item.rarity, nil
		}
		roll -= item.weight
	}
	return options[len(options)-1].rarity, nil
}

func (s *Store) HatchEgg(ctx context.Context, telegramID, eggID int64) (HatchResult, error) {
	if eggID < 1 {
		return HatchResult{}, ErrEggNotOwned
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return HatchResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&balance); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return HatchResult{}, ErrPlayerNotFound
		}
		return HatchResult{}, err
	}
	var rarity string
	var containerPrice int64
	if err := tx.QueryRowContext(ctx, `SELECT rarity, price_gold FROM player_eggs WHERE id=$1 AND owner_telegram_id=$2 FOR UPDATE`, eggID, telegramID).Scan(&rarity, &containerPrice); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return HatchResult{}, ErrEggNotOwned
		}
		return HatchResult{}, err
	}
	if rarity != "mystery" {
		return HatchResult{}, ErrEggNotOwned
	}
	bonusType, bonusMultiplier, err := selectedContainerBonusTx(ctx, tx, telegramID)
	if err != nil {
		return HatchResult{}, err
	}
	speciesRarity, err := chooseMysteryRarity(ctx, tx, func() float64 {
		if bonusType == "lootbox_chance" {
			return bonusMultiplier
		}
		return 1
	}())
	if err != nil {
		return HatchResult{}, err
	}
	var result HatchResult
	result.EggID = eggID
	if err := tx.QueryRowContext(ctx, `
		SELECT slug, name, image_url, rarity, sell_price_gold
		FROM creature_species WHERE rarity=$1 AND is_active=TRUE
		ORDER BY random() LIMIT 1
	`, speciesRarity).Scan(&result.SpeciesSlug, &result.Name, &result.ImageURL, &result.Rarity, &result.SellPriceGold); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return HatchResult{}, ErrSpeciesUnavailable
		}
		return HatchResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM player_eggs WHERE id=$1 AND owner_telegram_id=$2`, eggID, telegramID); err != nil {
		return HatchResult{}, err
	}
	if err := tx.QueryRowContext(ctx, `INSERT INTO player_creatures (owner_telegram_id, species_slug) VALUES ($1,$2) RETURNING id`, telegramID, result.SpeciesSlug).Scan(&result.CreatureID); err != nil {
		return HatchResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO player_discovered_species (player_telegram_id, species_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING`, telegramID, result.SpeciesSlug); err != nil {
		return HatchResult{}, err
	}
	if bonusType == "lootbox_gold" && bonusMultiplier > 1 {
		// Modest, predictable collection bonus: each 1.0 above ×1 returns 10% of the container price.
		result.GoldBonus = int64(math.Floor(float64(containerPrice) * (bonusMultiplier - 1) / 10))
		if result.GoldBonus > 0 {
			if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold+$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, result.GoldBonus).Scan(&balance); err != nil {
				return HatchResult{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'lootbox_gold_bonus')`, telegramID, result.GoldBonus); err != nil {
				return HatchResult{}, err
			}
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO lootbox_open_events (player_telegram_id, species_slug, result_rarity, container_price_gold, bonus_gold) VALUES ($1,$2,$3,$4,$5)`, telegramID, result.SpeciesSlug, result.Rarity, containerPrice, result.GoldBonus); err != nil {
		return HatchResult{}, err
	}
	result.GoldBalance = balance
	if err := tx.Commit(); err != nil {
		return HatchResult{}, err
	}
	return result, nil
}

func (s *Store) SellCreature(ctx context.Context, telegramID, creatureID int64) (SellResult, error) {
	if creatureID < 1 {
		return SellResult{}, ErrCreatureNotOwned
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return SellResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&balance); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SellResult{}, ErrPlayerNotFound
		}
		return SellResult{}, err
	}

	var result SellResult
	var price int64
	if err := tx.QueryRowContext(ctx, `
		SELECT pc.id, pc.species_slug, COALESCE(s.name, pc.species_slug), COALESCE(s.sell_price_gold, 0)
		FROM player_creatures pc
		LEFT JOIN creature_species s ON s.slug=pc.species_slug
		WHERE pc.id=$1 AND pc.owner_telegram_id=$2
		FOR UPDATE OF pc
	`, creatureID, telegramID).Scan(&result.CreatureID, &result.SpeciesSlug, &result.Name, &price); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SellResult{}, ErrCreatureNotOwned
		}
		return SellResult{}, err
	}
	if price <= 0 {
		return SellResult{}, ErrCreatureNotForSale
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM player_creatures WHERE id=$1 AND owner_telegram_id=$2`, creatureID, telegramID); err != nil {
		return SellResult{}, err
	}
	if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold+$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, price).Scan(&result.GoldBalance); err != nil {
		return SellResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'creature_sale')`, telegramID, price); err != nil {
		return SellResult{}, err
	}
	result.GoldAdded = price
	if err := tx.Commit(); err != nil {
		return SellResult{}, fmt.Errorf("commit creature sale: %w", err)
	}
	return result, nil
}
