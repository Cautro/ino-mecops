-- Raw values are retained only so an administrator can export a batch again
-- after closing or refreshing the Mini App. Authentication and redemption
-- still use code_hash; this column is never exposed outside admin endpoints.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS code_value TEXT;

