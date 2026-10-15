package gameplay

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strings"
)

const (
	minSlotBet int64 = 10
	maxSlotBet int64 = 10000
)

var slotSymbols = []string{"🍒", "🍋", "💎", "⭐", "🧬"}

var slotMultipliers = map[string]int64{
	"🍒": 4,
	"🍋": 5,
	"💎": 7,
	"⭐": 10,
	"🧬": 15,
}

type slotOutcome struct {
	payout     int64
	winType    string
	multiplier float64
	creature   bool
}

type creatureOption struct {
	slug string
	name string
}

func rollSlotSymbols() ([3]string, error) {
	var result [3]string
	for i := range result {
		pick, err := crand.Int(crand.Reader, big.NewInt(int64(len(slotSymbols))))
		if err != nil {
			return [3]string{}, err
		}
		result[i] = slotSymbols[pick.Int64()]
	}
	return result, nil
}

func evaluateSlot(symbols [3]string, bet int64) slotOutcome {
	if symbols[0] == symbols[1] && symbols[1] == symbols[2] {
		multiplier := slotMultipliers[symbols[0]]
		outcome := slotOutcome{payout: bet * multiplier, winType: "triple", multiplier: float64(multiplier)}
		if symbols[0] == "🧬" {
			outcome.winType = "creature"
			outcome.creature = true
		}
		return outcome
	}
	if symbols[0] == symbols[1] || symbols[0] == symbols[2] || symbols[1] == symbols[2] {
		return slotOutcome{payout: bet * 12 / 10, winType: "pair", multiplier: 1.2}
	}
	return slotOutcome{winType: "miss"}
}

// rollBestSlot simulates the configured number of independent outcomes and keeps
// the most valuable result. The multiplier is a server-side bonus, never client input.
func rollBestSlot(bet int64, attempts int) ([3]string, slotOutcome, error) {
	if attempts < 1 {
		attempts = 1
	}
	if attempts > 10 {
		attempts = 10
	}
	var bestSymbols [3]string
	var bestOutcome slotOutcome
	for i := 0; i < attempts; i++ {
		symbols, err := rollSlotSymbols()
		if err != nil {
			return [3]string{}, slotOutcome{}, err
		}
		outcome := evaluateSlot(symbols, bet)
		if i == 0 || outcome.payout > bestOutcome.payout {
			bestSymbols, bestOutcome = symbols, outcome
		}
	}
	return bestSymbols, bestOutcome, nil
}

func bonusAttempts(bonus mainBonus) int {
	if bonus.Type != string(MainBonusSlotChance) {
		return 1
	}
	if bonus.Multiplier < 1 {
		return 1
	}
	if bonus.Multiplier > 10 {
		return 10
	}
	return int(math.Round(bonus.Multiplier))
}

// Creature-stake rules are intentionally item-based: a miss loses the selected
// creature, a pair preserves it, a regular triple awards one creature, and a
// DNA jackpot awards two. Gold is never changed in this mode.
func creatureStakeRewards(winType string) (loseStake bool, rewardCount int) {
	switch winType {
	case "miss":
		return true, 0
	case "pair":
		return false, 0
	case "creature":
		return false, 2
	case "triple":
		return false, 1
	default:
		return false, 0
	}
}

func (s *Store) SpinSlot(ctx context.Context, telegramID int64, input SlotSpinInput) (SlotSpinResult, error) {
	// Realize accrued passive income before a spin can remove a staked creature.
	if _, err := s.Overview(ctx, telegramID); err != nil {
		return SlotSpinResult{}, err
	}
	betType := strings.TrimSpace(input.BetType)
	if betType == "" {
		betType = "gold" // Backward compatibility with clients that only send {bet}.
	}
	switch betType {
	case "gold":
		return s.spinGold(ctx, telegramID, input.Bet)
	case "creature":
		return s.spinCreature(ctx, telegramID, input.CreatureID)
	default:
		return SlotSpinResult{}, ErrInvalidInput
	}
}

func (s *Store) spinGold(ctx context.Context, telegramID, bet int64) (SlotSpinResult, error) {
	if bet < minSlotBet || bet > maxSlotBet {
		return SlotSpinResult{}, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return SlotSpinResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&balance); err != nil {
		if err == sql.ErrNoRows {
			return SlotSpinResult{}, ErrNotFound
		}
		return SlotSpinResult{}, err
	}
	if balance < bet {
		return SlotSpinResult{}, ErrInsufficientGold
	}

	bonus, err := currentMainBonus(ctx, tx, telegramID)
	if err != nil {
		return SlotSpinResult{}, err
	}
	// The main-creature bonus is player-specific. A slot_chance bonus runs N
	// server-side outcomes and retains the best one; it never changes egg odds.
	symbols, outcome, err := rollBestSlot(bet, bonusAttempts(bonus))
	if err != nil {
		return SlotSpinResult{}, err
	}
	bonusApplied := false
	if bonus.Type == string(MainBonusSlotPayout) && outcome.payout > 0 {
		outcome.payout = int64(math.Round(float64(outcome.payout) * bonus.Multiplier))
		outcome.multiplier *= float64(bonus.Multiplier)
		bonusApplied = bonus.Multiplier > 1
	} else if bonus.Type == string(MainBonusSlotChance) && bonus.Multiplier > 1 {
		bonusApplied = true
	}

	creatureSlug := ""
	creatureName := ""
	if outcome.creature {
		available, err := activeCreatureOptions(ctx, tx)
		if err != nil {
			return SlotSpinResult{}, err
		}
		if len(available) > 0 {
			picked, err := randomCreature(available)
			if err != nil {
				return SlotSpinResult{}, err
			}
			creatureSlug, creatureName = picked.slug, picked.name
		}
	}

	if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold-$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, bet).Scan(&balance); err != nil {
		return SlotSpinResult{}, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'slot_bet')`, telegramID, -bet); err != nil {
		return SlotSpinResult{}, err
	}

	if outcome.payout > 0 {
		if err := tx.QueryRowContext(ctx, `UPDATE players SET gold=gold+$2, updated_at=clock_timestamp() WHERE telegram_id=$1 RETURNING gold`, telegramID, outcome.payout).Scan(&balance); err != nil {
			return SlotSpinResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'slot_win')`, telegramID, outcome.payout); err != nil {
			return SlotSpinResult{}, err
		}
	}

	if creatureSlug != "" {
		if _, err := tx.ExecContext(ctx, `INSERT INTO player_creatures (owner_telegram_id, species_slug) VALUES ($1,$2)`, telegramID, creatureSlug); err != nil {
			return SlotSpinResult{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO player_discovered_species (player_telegram_id, species_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING`, telegramID, creatureSlug); err != nil {
			return SlotSpinResult{}, err
		}
	}

	message := "Мимо! Ставка сгорела. Крути ещё раз."
	switch outcome.winType {
	case "pair":
		message = "Два одинаковых символа! Выплата ×1,2."
	case "triple":
		message = fmt.Sprintf("Три %s! Выплата ×%d.", symbols[0], int64(outcome.multiplier))
	case "creature":
		if creatureSlug != "" {
			message = fmt.Sprintf("ДЖЕКПОТ! Три 🧬 — выплата ×15 и новый иномекон: %s!", creatureName)
		} else {
			message = "ДЖЕКПОТ! Три 🧬 — выплата ×15. В каталоге пока нет доступных иномеконов для награды."
		}
	}

	if _, err := tx.ExecContext(ctx, `INSERT INTO slot_spins (player_telegram_id, bet_amount, payout_amount, symbols, reward_creature_slug, bet_type) VALUES ($1,$2,$3,$4,$5,'gold')`, telegramID, bet, outcome.payout, strings.Join(symbols[:], "|"), nullIfEmpty(creatureSlug)); err != nil {
		return SlotSpinResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return SlotSpinResult{}, err
	}

	return SlotSpinResult{
		Symbols:             symbols,
		BetType:             "gold",
		Bet:                 bet,
		Payout:              outcome.payout,
		Net:                 outcome.payout - bet,
		GoldBalance:         balance,
		WinType:             outcome.winType,
		Multiplier:          outcome.multiplier,
		MainBonusType:       bonus.Type,
		MainBonusMultiplier: bonus.Multiplier,
		BonusApplied:        bonusApplied,
		CreatureSlug:        creatureSlug,
		CreatureName:        creatureName,
		Message:             message,
	}, nil
}

func (s *Store) spinCreature(ctx context.Context, telegramID, creatureID int64) (SlotSpinResult, error) {
	if creatureID <= 0 {
		return SlotSpinResult{}, ErrInvalidInput
	}

	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return SlotSpinResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var balance int64
	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&balance); err != nil {
		if err == sql.ErrNoRows {
			return SlotSpinResult{}, ErrNotFound
		}
		return SlotSpinResult{}, err
	}

	var stakedSlug, stakedName string
	if err := tx.QueryRowContext(ctx, `
		SELECT pc.species_slug, COALESCE(cs.name, pc.species_slug)
		FROM player_creatures pc
		LEFT JOIN creature_species cs ON cs.slug = pc.species_slug
		WHERE pc.id=$1 AND pc.owner_telegram_id=$2
		FOR UPDATE OF pc
	`, creatureID, telegramID).Scan(&stakedSlug, &stakedName); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return SlotSpinResult{}, ErrCreatureNotOwned
		}
		return SlotSpinResult{}, err
	}

	bonus, err := currentMainBonus(ctx, tx, telegramID)
	if err != nil {
		return SlotSpinResult{}, err
	}
	symbols, outcome, err := rollBestSlot(1, bonusAttempts(bonus))
	if err != nil {
		return SlotSpinResult{}, err
	}
	bonusApplied := bonus.Type == string(MainBonusSlotChance) && bonus.Multiplier > 1
	stakeLost, rewardCount := creatureStakeRewards(outcome.winType)
	rewards := make([]SlotCreatureReward, 0, rewardCount)

	if stakeLost {
		res, err := tx.ExecContext(ctx, `DELETE FROM player_creatures WHERE id=$1 AND owner_telegram_id=$2`, creatureID, telegramID)
		if err != nil {
			return SlotSpinResult{}, err
		}
		if changed, err := res.RowsAffected(); err != nil {
			return SlotSpinResult{}, err
		} else if changed != 1 {
			return SlotSpinResult{}, ErrCreatureNotOwned
		}
	}

	if rewardCount > 0 {
		available, err := activeCreatureOptions(ctx, tx)
		if err != nil {
			return SlotSpinResult{}, err
		}
		for i := 0; i < rewardCount && len(available) > 0; i++ {
			picked, err := randomCreature(available)
			if err != nil {
				return SlotSpinResult{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO player_creatures (owner_telegram_id, species_slug) VALUES ($1,$2)`, telegramID, picked.slug); err != nil {
				return SlotSpinResult{}, err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO player_discovered_species (player_telegram_id, species_slug) VALUES ($1,$2) ON CONFLICT DO NOTHING`, telegramID, picked.slug); err != nil {
				return SlotSpinResult{}, err
			}
			rewards = append(rewards, SlotCreatureReward{Slug: picked.slug, Name: picked.name})
		}
	}

	message := "Мимо! Иномекон потерян: " + stakedName + "."
	switch outcome.winType {
	case "pair":
		message = "Два одинаковых символа! Иномекон «" + stakedName + "» остаётся в твоей коллекции."
	case "triple":
		if len(rewards) == 1 {
			message = fmt.Sprintf("Три %s! Ставка сохранена — новый иномекон: %s!", symbols[0], rewards[0].Name)
		} else {
			message = fmt.Sprintf("Три %s! Ставка сохранена, но в каталоге нет иномеконов для награды.", symbols[0])
		}
	case "creature":
		if len(rewards) == 2 {
			message = fmt.Sprintf("ДЖЕКПОТ! Три 🧬 — ставка сохранена, получены два иномекона: %s и %s!", rewards[0].Name, rewards[1].Name)
		} else if len(rewards) == 1 {
			message = fmt.Sprintf("ДЖЕКПОТ! Три 🧬 — ставка сохранена, получен иномекон: %s!", rewards[0].Name)
		} else {
			message = "ДЖЕКПОТ! Три 🧬 — ставка сохранена, но в каталоге нет иномеконов для награды."
		}
	}

	var firstReward any
	if len(rewards) > 0 {
		firstReward = rewards[0].Slug
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO slot_spins
			(player_telegram_id, bet_amount, payout_amount, symbols, reward_creature_slug,
			 bet_type, bet_creature_id, bet_creature_slug, creature_stake_lost)
		VALUES ($1, NULL, 0, $2, $3, 'creature', $4, $5, $6)
	`, telegramID, strings.Join(symbols[:], "|"), firstReward, creatureID, stakedSlug, stakeLost); err != nil {
		return SlotSpinResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return SlotSpinResult{}, err
	}

	return SlotSpinResult{
		Symbols:             symbols,
		BetType:             "creature",
		BetCreatureID:       creatureID,
		BetCreatureSlug:     stakedSlug,
		BetCreatureName:     stakedName,
		CreatureStakeLost:   stakeLost,
		CreatureRewards:     rewards,
		GoldBalance:         balance,
		WinType:             outcome.winType,
		Multiplier:          outcome.multiplier,
		MainBonusType:       bonus.Type,
		MainBonusMultiplier: bonus.Multiplier,
		BonusApplied:        bonusApplied,
		Message:             message,
	}, nil
}

func activeCreatureOptions(ctx context.Context, tx *sql.Tx) ([]creatureOption, error) {
	rows, err := tx.QueryContext(ctx, `SELECT slug, name FROM creature_species WHERE is_active=true ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	available := make([]creatureOption, 0)
	for rows.Next() {
		var creature creatureOption
		if err := rows.Scan(&creature.slug, &creature.name); err != nil {
			return nil, err
		}
		available = append(available, creature)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return available, nil
}

func randomCreature(available []creatureOption) (creatureOption, error) {
	if len(available) == 0 {
		return creatureOption{}, errors.New("no available creatures")
	}
	pick, err := crand.Int(crand.Reader, big.NewInt(int64(len(available))))
	if err != nil {
		return creatureOption{}, err
	}
	return available[pick.Int64()], nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
