BEGIN;

CREATE TABLE IF NOT EXISTS abilities (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 48),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
    element TEXT NOT NULL CHECK (element IN ('meteor', 'wind', 'earth', 'water', 'arcane', 'custom')),
    power INTEGER NOT NULL DEFAULT 0 CHECK (power BETWEEN 0 AND 100000),
    accuracy_percent NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (accuracy_percent BETWEEN 0 AND 100),
    cooldown_seconds INTEGER NOT NULL DEFAULT 0 CHECK (cooldown_seconds BETWEEN 0 AND 3600),
    effect_type TEXT NOT NULL DEFAULT 'none' CHECK (effect_type IN ('none', 'burn', 'slow', 'stun', 'weaken', 'shield')),
    effect_value INTEGER NOT NULL DEFAULT 0 CHECK (effect_value BETWEEN 0 AND 100),
    effect_duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (effect_duration_seconds BETWEEN 0 AND 600),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (effect_type = 'none' AND effect_value = 0 AND effect_duration_seconds = 0)
        OR (effect_type <> 'none' AND effect_value > 0 AND effect_duration_seconds > 0)
    )
);

CREATE TABLE IF NOT EXISTS creature_species (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 48),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
    image_url TEXT NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 500),
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic')),
    passive_gold_per_hour BIGINT NOT NULL DEFAULT 0 CHECK (passive_gold_per_hour BETWEEN 0 AND 10000000),
    health INTEGER NOT NULL CHECK (health BETWEEN 1 AND 1000000),
    damage INTEGER NOT NULL CHECK (damage BETWEEN 0 AND 1000000),
    crit_chance NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK (crit_chance BETWEEN 0 AND 100),
    ability_id BIGINT NOT NULL REFERENCES abilities(id) ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creature_species_active_rarity ON creature_species(is_active, rarity);
CREATE INDEX IF NOT EXISTS idx_creature_species_ability_id ON creature_species(ability_id);

INSERT INTO abilities (slug, name, description, element, power, accuracy_percent, cooldown_seconds, effect_type, effect_value, effect_duration_seconds, is_default)
VALUES
    ('meteor-strike', 'Метеоритный удар', 'Обрушивает на противника раскалённый метеорит.', 'meteor', 35, 85, 30, 'burn', 10, 4, TRUE),
    ('wind-gust', 'Ветряной порыв', 'Быстрый порыв воздуха, который сбивает противника с ритма.', 'wind', 18, 95, 12, 'slow', 20, 3, TRUE),
    ('earth-strike', 'Земляной удар', 'Мощный удар землёй, способный оглушить цель.', 'earth', 28, 90, 22, 'stun', 1, 2, TRUE),
    ('water-jet', 'Водяная струя', 'Точная струя воды с высокой вероятностью попадания.', 'water', 22, 97, 15, 'none', 0, 0, TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO creature_species (slug, name, description, rarity, passive_gold_per_hour, health, damage, crit_chance, ability_id)
SELECT 'ino-sprout', 'Иноспрут', 'Первый известный представитель иномеконов.', 'common', 5, 100, 12, 5, a.id
FROM abilities a
WHERE a.slug = 'water-jet'
ON CONFLICT (slug) DO NOTHING;

COMMIT;
