package admin_panel

import "context"

type Repository interface {
	CreateBatch(ctx context.Context, batch NewBatch) (int64, error)
	ListBatches(ctx context.Context, limit, offset int) ([]BatchSummary, error)
	ListBatchCodes(ctx context.Context, batchID int64) ([]BatchCode, error)
	ActiveSpeciesExists(ctx context.Context, slug string) (bool, error)
	ActiveSpeciesByRarities(ctx context.Context, rarities []string) ([]ActiveSpeciesOption, error)
	RevokeBatch(ctx context.Context, id int64) error
	DeleteBatch(ctx context.Context, id int64) error
	ListLeaderboardPlayers(ctx context.Context) ([]LeaderboardPlayer, error)
	SetLeaderboardHidden(ctx context.Context, playerTelegramID, adminTelegramID int64) error
	RemoveLeaderboardHidden(ctx context.Context, playerTelegramID int64) error
}
