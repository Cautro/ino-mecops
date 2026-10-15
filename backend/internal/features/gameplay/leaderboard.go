package gameplay

import (
	"context"
)

func (s *Store) Leaderboards(ctx context.Context) (LeaderboardData, error) {
	data := LeaderboardData{
		Collection: make([]CollectionLeaderboardEntry, 0),
		SlotLosses: make([]SlotLossLeaderboardEntry, 0),
		Battles:    PlaceholderLeaderboard{Available: false, Message: "В скором будущем", Items: make([]any, 0)},
	}

	rows, err := s.db.QueryContext(ctx, `
		WITH stats AS (
			SELECT p.telegram_id,
			       COALESCE(NULLIF('@' || p.username, '@'), NULLIF(p.first_name, ''), 'Игрок') AS display_name,
		       COUNT(pc.id)::int AS creature_count,
		       COALESCE(SUM(cs.passive_gold_per_hour), 0)::bigint AS base_passive_income,
		       COALESCE(MAX(CASE WHEN main_species.main_bonus_type='passive_income'
		                         THEN main_species.main_bonus_multiplier ELSE 1 END), 1)::int AS income_multiplier
		FROM players p
		LEFT JOIN player_creatures pc ON pc.owner_telegram_id=p.telegram_id
		LEFT JOIN creature_species cs ON cs.slug=pc.species_slug
		LEFT JOIN player_main_slots ms ON ms.player_telegram_id=p.telegram_id
		LEFT JOIN player_creatures main_pc ON main_pc.id=ms.player_creature_id
		LEFT JOIN creature_species main_species ON main_species.slug=main_pc.species_slug
		GROUP BY p.telegram_id, p.username, p.first_name
		)
		SELECT display_name, creature_count,
		       (base_passive_income * income_multiplier)::bigint AS passive_gold_per_hour
		FROM stats
		ORDER BY passive_gold_per_hour DESC, creature_count DESC, display_name ASC
		LIMIT 10
	`)
	if err != nil {
		return LeaderboardData{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item CollectionLeaderboardEntry
		if err := rows.Scan(&item.Name, &item.CreatureCount, &item.PassiveGoldPerHour); err != nil {
			return LeaderboardData{}, err
		}
		item.Rank = len(data.Collection) + 1
		data.Collection = append(data.Collection, item)
	}
	if err := rows.Err(); err != nil {
		return LeaderboardData{}, err
	}
	if err := rows.Close(); err != nil {
		return LeaderboardData{}, err
	}

	rows, err = s.db.QueryContext(ctx, `
		WITH stats AS (
			SELECT ss.player_telegram_id,
			       COUNT(*) FILTER (WHERE ss.bet_type='gold')::bigint AS spins,
			       COALESCE(SUM(ss.bet_amount) FILTER (WHERE ss.bet_type='gold'), 0)::bigint AS total_bet,
			       COALESCE(SUM(ss.payout_amount) FILTER (WHERE ss.bet_type='gold'), 0)::bigint AS total_payout
		FROM slot_spins ss
		GROUP BY ss.player_telegram_id
		)
		SELECT COALESCE(NULLIF('@' || p.username, '@'), NULLIF(p.first_name, ''), 'Игрок') AS display_name,
		       GREATEST(0, stats.total_bet - stats.total_payout)::bigint AS total_lost,
		       stats.total_bet, stats.total_payout, stats.spins
		FROM stats
		JOIN players p ON p.telegram_id=stats.player_telegram_id
		WHERE stats.spins > 0
		ORDER BY total_lost DESC, stats.total_bet DESC, stats.spins DESC, display_name ASC
		LIMIT 10
	`)
	if err != nil {
		return LeaderboardData{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item SlotLossLeaderboardEntry
		if err := rows.Scan(&item.Name, &item.TotalLostGold, &item.TotalBetGold, &item.TotalPayoutGold, &item.Spins); err != nil {
			return LeaderboardData{}, err
		}
		item.Rank = len(data.SlotLosses) + 1
		data.SlotLosses = append(data.SlotLosses, item)
	}
	if err := rows.Err(); err != nil {
		return LeaderboardData{}, err
	}
	return data, nil
}

var _ interface {
	Leaderboards(context.Context) (LeaderboardData, error)
} = (*Store)(nil)
