package gameplay

import (
	"context"
)

func (s *Store) Leaderboards(ctx context.Context, viewerTelegramID int64) (LeaderboardData, error) {
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
		       COALESCE(SUM(cs.passive_gold_per_hour), 0)::numeric AS base_passive_income,
		       COALESCE(MAX(CASE WHEN main_species.main_bonus_type='passive_income'
		                         THEN main_species.main_bonus_multiplier ELSE 1 END), 1)::numeric AS income_multiplier
		FROM players p
		LEFT JOIN player_creatures pc ON pc.owner_telegram_id=p.telegram_id
		LEFT JOIN creature_species cs ON cs.slug=pc.species_slug
		LEFT JOIN player_main_slots ms ON ms.player_telegram_id=p.telegram_id
		LEFT JOIN player_creatures main_pc ON main_pc.id=ms.player_creature_id
		LEFT JOIN creature_species main_species ON main_species.slug=main_pc.species_slug
		GROUP BY p.telegram_id, p.username, p.first_name
		), visible AS (
			SELECT stats.telegram_id, stats.display_name, stats.creature_count,
			       (stats.base_passive_income * stats.income_multiplier)::double precision AS passive_gold_per_hour
			FROM stats
			WHERE stats.telegram_id=$1 OR NOT EXISTS (
				SELECT 1 FROM leaderboard_hidden_players hidden
				WHERE hidden.player_telegram_id=stats.telegram_id
			)
		), ranked AS (
			SELECT visible.*,
			       ROW_NUMBER() OVER (ORDER BY passive_gold_per_hour DESC, creature_count DESC, display_name ASC) AS leaderboard_rank
			FROM visible
		)
		SELECT display_name, creature_count, passive_gold_per_hour, leaderboard_rank
		FROM ranked
		WHERE leaderboard_rank <= 10 OR telegram_id=$1
		ORDER BY leaderboard_rank
	`, viewerTelegramID)
	if err != nil {
		return LeaderboardData{}, err
	}
	for rows.Next() {
		var item CollectionLeaderboardEntry
		if err := rows.Scan(&item.Name, &item.CreatureCount, &item.PassiveGoldPerHour, &item.Rank); err != nil {
			rows.Close()
			return LeaderboardData{}, err
		}
		data.Collection = append(data.Collection, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return LeaderboardData{}, err
	}
	if err := rows.Close(); err != nil {
		return LeaderboardData{}, err
	}

	rows, err = s.db.QueryContext(ctx, `
		WITH stats AS (
			SELECT p.telegram_id,
			       COALESCE(NULLIF('@' || p.username, '@'), NULLIF(p.first_name, ''), 'Игрок') AS display_name,
			       COUNT(*) FILTER (WHERE ss.bet_type='gold')::bigint AS spins,
			       COALESCE(SUM(ss.bet_amount) FILTER (WHERE ss.bet_type='gold'), 0)::bigint AS total_bet,
			       COALESCE(SUM(ss.payout_amount) FILTER (WHERE ss.bet_type='gold'), 0)::bigint AS total_payout
		FROM slot_spins ss
		JOIN players p ON p.telegram_id=ss.player_telegram_id
		GROUP BY p.telegram_id, p.username, p.first_name
		), visible AS (
			SELECT stats.telegram_id, stats.display_name,
			       GREATEST(0, stats.total_bet - stats.total_payout)::bigint AS total_lost,
			       stats.total_bet, stats.total_payout, stats.spins
			FROM stats
		WHERE stats.spins > 0
		  AND (stats.telegram_id=$1 OR NOT EXISTS (
			SELECT 1 FROM leaderboard_hidden_players hidden
			WHERE hidden.player_telegram_id=stats.telegram_id
		  ))
		), ranked AS (
			SELECT visible.*,
			       ROW_NUMBER() OVER (ORDER BY total_lost DESC, total_bet DESC, spins DESC, display_name ASC) AS leaderboard_rank
			FROM visible
		)
		SELECT display_name, total_lost, total_bet, total_payout, spins, leaderboard_rank
		FROM ranked
		WHERE leaderboard_rank <= 10 OR telegram_id=$1
		ORDER BY leaderboard_rank
	`, viewerTelegramID)
	if err != nil {
		return LeaderboardData{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item SlotLossLeaderboardEntry
		if err := rows.Scan(&item.Name, &item.TotalLostGold, &item.TotalBetGold, &item.TotalPayoutGold, &item.Spins, &item.Rank); err != nil {
			return LeaderboardData{}, err
		}
		data.SlotLosses = append(data.SlotLosses, item)
	}
	if err := rows.Err(); err != nil {
		return LeaderboardData{}, err
	}
	return data, nil
}

var _ interface {
	Leaderboards(context.Context, int64) (LeaderboardData, error)
} = (*Store)(nil)
