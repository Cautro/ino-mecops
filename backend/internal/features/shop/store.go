package shop

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var (
	ErrInvalidRarity      = errors.New("invalid egg rarity")
	ErrInsufficientGold   = errors.New("not enough gold")
	ErrSpeciesUnavailable = errors.New("no active creatures for rarity")
	ErrEggNotOwned        = errors.New("egg not owned")
	ErrCreatureNotOwned   = errors.New("creature not owned")
	ErrCreatureNotForSale = errors.New("creature is not for sale")
	ErrPlayerNotFound     = errors.New("player not found")
)

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

type rarityConfig struct {
	rarity string
	label  string
	price  int64
}

var eggRarities = []rarityConfig{
	{rarity: "common", label: "Обычное", price: 250},
	{rarity: "rare", label: "Редкое", price: 1000},
	{rarity: "epic", label: "Эпическое", price: 2500},
	{rarity: "legendary", label: "Легендарное", price: 7500},
	{rarity: "mythic", label: "Мифическое", price: 15000},
}

func priceForRarity(rarity string) (int64, bool) {
	for _, option := range eggRarities {
		if option.rarity == rarity {
			return option.price, true
		}
	}
	return 0, false
}

func (s *Store) Shop(ctx context.Context, telegramID int64) (ShopData, error) {
	counts := map[string]int{}
	rows, err := s.db.QueryContext(ctx, `
		SELECT rarity, COUNT(*)::int
		FROM creature_species
		WHERE is_active = TRUE
		GROUP BY rarity
	`)
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

	data := ShopData{EggOffers: make([]EggOffer, 0, len(eggRarities)), Eggs: make([]Egg, 0)}
	for _, option := range eggRarities {
		count := counts[option.rarity]
		data.EggOffers = append(data.EggOffers, EggOffer{
			Rarity: option.rarity, Label: option.label, PriceGold: option.price,
			Available: count > 0, AvailableSpecies: count,
		})
	}

	eggRows, err := s.db.QueryContext(ctx, `
		SELECT id, rarity, price_gold, purchased_at
		FROM player_eggs WHERE owner_telegram_id = $1
		ORDER BY purchased_at DESC, id DESC
	`, telegramID)
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
	price, ok := priceForRarity(rarity)
	if !ok {
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
	var available bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM creature_species WHERE rarity=$1 AND is_active=TRUE)`, rarity).Scan(&available); err != nil {
		return BuyEggResult{}, err
	}
	if !available {
		return BuyEggResult{}, ErrSpeciesUnavailable
	}
	if balance < price {
		return BuyEggResult{}, ErrInsufficientGold
	}
	if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold-$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, price).Scan(&balance); err != nil {
		return BuyEggResult{}, err
	}
	var egg Egg
	if err := tx.QueryRowContext(ctx, `
		INSERT INTO player_eggs (owner_telegram_id, rarity, price_gold)
		VALUES ($1,$2,$3) RETURNING id, rarity, price_gold, purchased_at
	`, telegramID, rarity, price).Scan(&egg.ID, &egg.Rarity, &egg.PriceGold, &egg.PurchasedAt); err != nil {
		return BuyEggResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'egg_purchase')`, telegramID, -price); err != nil {
		return BuyEggResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return BuyEggResult{}, err
	}
	return BuyEggResult{Egg: egg, GoldBalance: balance}, nil
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
	if err := tx.QueryRowContext(ctx, `SELECT rarity FROM player_eggs WHERE id=$1 AND owner_telegram_id=$2 FOR UPDATE`, eggID, telegramID).Scan(&rarity); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return HatchResult{}, ErrEggNotOwned
		}
		return HatchResult{}, err
	}

	var result HatchResult
	result.EggID = eggID
	result.Rarity = rarity
	if err := tx.QueryRowContext(ctx, `
		SELECT slug, name, image_url, rarity, sell_price_gold
		FROM creature_species WHERE rarity=$1 AND is_active=TRUE
		ORDER BY random() LIMIT 1
	`, rarity).Scan(&result.SpeciesSlug, &result.Name, &result.ImageURL, &result.Rarity, &result.SellPriceGold); err != nil {
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
