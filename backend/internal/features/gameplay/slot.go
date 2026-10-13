package gameplay

import (
	"context"
	crand "crypto/rand"
	"database/sql"
	"fmt"
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

func (s *Store) SpinSlot(ctx context.Context, telegramID, bet int64) (SlotSpinResult, error) {
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

	// The backend owns both randomness and payout calculation; the client only supplies the stake.
	symbols, err := rollSlotSymbols()
	if err != nil {
		return SlotSpinResult{}, err
	}
	outcome := evaluateSlot(symbols, bet)

	creatureSlug := ""
	creatureName := ""
	if outcome.creature {
		rows, err := tx.QueryContext(ctx, `SELECT slug, name FROM creature_species WHERE is_active=true ORDER BY id`)
		if err != nil {
			return SlotSpinResult{}, err
		}
		type creatureOption struct{ slug, name string }
		available := make([]creatureOption, 0)
		for rows.Next() {
			var creature creatureOption
			if err := rows.Scan(&creature.slug, &creature.name); err != nil {
				rows.Close()
				return SlotSpinResult{}, err
			}
			available = append(available, creature)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return SlotSpinResult{}, err
		}
		if err := rows.Close(); err != nil {
			return SlotSpinResult{}, err
		}
		if len(available) > 0 {
			pick, err := crand.Int(crand.Reader, big.NewInt(int64(len(available))))
			if err != nil {
				return SlotSpinResult{}, err
			}
			creatureSlug = available[pick.Int64()].slug
			creatureName = available[pick.Int64()].name
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

	if _, err := tx.ExecContext(ctx, `INSERT INTO slot_spins (player_telegram_id, bet_amount, payout_amount, symbols, reward_creature_slug) VALUES ($1,$2,$3,$4,$5)`, telegramID, bet, outcome.payout, strings.Join(symbols[:], "|"), nullIfEmpty(creatureSlug)); err != nil {
		return SlotSpinResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return SlotSpinResult{}, err
	}

	return SlotSpinResult{
		Symbols:      symbols,
		Bet:          bet,
		Payout:       outcome.payout,
		Net:          outcome.payout - bet,
		GoldBalance:  balance,
		WinType:      outcome.winType,
		Multiplier:   outcome.multiplier,
		CreatureSlug: creatureSlug,
		CreatureName: creatureName,
		Message:      message,
	}, nil
}

func nullIfEmpty(value string) any {
	if value == "" {
		return nil
	}
	return value
}
