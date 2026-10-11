package auth

import (
	"context"
	"database/sql"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) UpsertPlayer(ctx context.Context, user TelegramUser) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO players (telegram_id, username, first_name)
		VALUES ($1, NULLIF($2, ''), $3)
		ON CONFLICT (telegram_id) DO UPDATE SET
			username = NULLIF(EXCLUDED.username, ''),
			first_name = EXCLUDED.first_name,
			updated_at = now()
	`, user.ID, user.Username, user.FirstName)
	return err
}

func (r *PostgresRepository) GetPlayer(ctx context.Context, telegramID int64) (Player, error) {
	var player Player
	var username sql.NullString
	err := r.db.QueryRowContext(ctx, `
		SELECT telegram_id, username, first_name, gold, created_at
		FROM players WHERE telegram_id = $1
	`, telegramID).Scan(&player.TelegramID, &username, &player.FirstName, &player.Gold, &player.CreatedAt)
	if username.Valid {
		player.Username = username.String
	}
	return player, err
}
