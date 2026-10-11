package admin_panel

import "context"

type Repository interface {
	CreateBatch(ctx context.Context, batch NewBatch) (int64, error)
	ListBatches(ctx context.Context, limit, offset int) ([]BatchSummary, error)
	RevokeBatch(ctx context.Context, id int64) error
}
