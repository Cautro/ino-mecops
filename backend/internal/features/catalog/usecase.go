package catalog

import (
	"context"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	ErrInvalidInput = errors.New("invalid catalog input")
	ErrNotFound     = errors.New("catalog item not found")
	ErrConflict     = errors.New("catalog item conflicts with existing data")
	ErrInUse        = errors.New("catalog item is in use")
	ErrProtected    = errors.New("default ability cannot be deleted")
	slugPattern     = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	abilityElements = map[string]bool{"meteor": true, "wind": true, "earth": true, "water": true, "arcane": true, "custom": true}
	effectTypes     = map[string]bool{"none": true, "burn": true, "slow": true, "stun": true, "weaken": true, "shield": true}
	rarityTypes     = map[string]bool{"common": true, "rare": true, "epic": true, "legendary": true, "mythic": true}
)

type UseCase struct{ repo Repository }

func NewUseCase(repo Repository) *UseCase { return &UseCase{repo: repo} }

func (u *UseCase) ListAbilities(ctx context.Context) ([]Ability, error) {
	return u.repo.ListAbilities(ctx)
}
func (u *UseCase) ListSpecies(ctx context.Context, includeArchived bool) ([]Species, error) {
	return u.repo.ListSpecies(ctx, includeArchived)
}
func (u *UseCase) CreateAbility(ctx context.Context, input AbilityInput) (Ability, error) {
	input.Slug = strings.TrimSpace(strings.ToLower(input.Slug))
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if err := validateAbilityInput(input.Slug, input.Name, input.Description, input.Element, input.Power, input.AccuracyPercent, input.CooldownSeconds, input.EffectType, input.EffectValue, input.EffectDurationTurns); err != nil {
		return Ability{}, err
	}
	return u.repo.CreateAbility(ctx, Ability{Slug: input.Slug, Name: input.Name, Description: input.Description, Element: input.Element, Power: input.Power, AccuracyPercent: input.AccuracyPercent, CooldownSeconds: input.CooldownSeconds, EffectType: input.EffectType, EffectValue: input.EffectValue, EffectDurationTurns: input.EffectDurationTurns})
}
func (u *UseCase) UpdateAbility(ctx context.Context, id int64, input AbilityUpdateInput) (Ability, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	if id <= 0 || validateAbilityInput("valid-slug", input.Name, input.Description, input.Element, input.Power, input.AccuracyPercent, input.CooldownSeconds, input.EffectType, input.EffectValue, input.EffectDurationTurns) != nil {
		return Ability{}, ErrInvalidInput
	}
	return u.repo.UpdateAbility(ctx, id, input)
}
func (u *UseCase) DeleteAbility(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrNotFound
	}
	return u.repo.DeleteAbility(ctx, id)
}
func (u *UseCase) CreateSpecies(ctx context.Context, input SpeciesInput) (Species, error) {
	input.Slug = strings.TrimSpace(strings.ToLower(input.Slug))
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.ImageURL = strings.TrimSpace(input.ImageURL)
	if !validSpeciesInput(input.Slug, input.Name, input.Description, input.ImageURL, input.Rarity, input.PassiveGoldPerHour, input.Health, input.Damage, input.CritChance, input.AbilityID, true) {
		return Species{}, ErrInvalidInput
	}
	if err := u.ensureAbilityExists(ctx, input.AbilityID); err != nil {
		return Species{}, err
	}
	return u.repo.CreateSpecies(ctx, input)
}
func (u *UseCase) UpdateSpecies(ctx context.Context, id int64, input SpeciesUpdateInput) (Species, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.Description = strings.TrimSpace(input.Description)
	input.ImageURL = strings.TrimSpace(input.ImageURL)
	if id <= 0 || !validSpeciesInput("valid-slug", input.Name, input.Description, input.ImageURL, input.Rarity, input.PassiveGoldPerHour, input.Health, input.Damage, input.CritChance, input.AbilityID, false) {
		return Species{}, ErrInvalidInput
	}
	if err := u.ensureAbilityExists(ctx, input.AbilityID); err != nil {
		return Species{}, err
	}
	return u.repo.UpdateSpecies(ctx, id, input)
}
func (u *UseCase) ArchiveSpecies(ctx context.Context, id int64) error {
	if id <= 0 {
		return ErrNotFound
	}
	return u.repo.ArchiveSpecies(ctx, id)
}

func validateAbilityInput(slug, name, description, element string, power int, accuracy float64, cooldown int, effect string, effectValue, effectDuration int) error {
	if !slugPattern.MatchString(slug) || len(slug) > 48 || !validName(name, 80) || !validText(description, 500) || !abilityElements[element] || power < 0 || power > 100_000 || accuracy < 0 || accuracy > 100 || cooldown < 0 || cooldown > 3600 || !effectTypes[effect] || effectValue < 0 || effectValue > 100 || effectDuration < 0 || effectDuration > 600 {
		return ErrInvalidInput
	}
	if effect == "none" && (effectValue != 0 || effectDuration != 0) {
		return ErrInvalidInput
	}
	if effect != "none" && (effectValue <= 0 || effectDuration <= 0) {
		return ErrInvalidInput
	}
	return nil
}
func validName(value string, max int) bool {
	return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= max
}
func validText(value string, max int) bool { return utf8.RuneCountInString(value) <= max }
func validImageURL(value string) bool {
	if value == "" {
		return true
	}
	if strings.HasPrefix(value, "/uploads/") && !strings.Contains(value, "..") {
		return len(value) <= 500
	}
	u, err := url.ParseRequestURI(value)
	return err == nil && u.Scheme == "https" && u.Host != "" && len(value) <= 500
}

func validSpeciesInput(slug, name, description, imageURL, rarity string, passiveGold int64, health, damage int, critChance float64, abilityID int64, validateSlug bool) bool {
	if validateSlug && (!slugPattern.MatchString(slug) || len(slug) > 48) {
		return false
	}
	return validName(name, 80) && validText(description, 1000) && validImageURL(imageURL) && rarityTypes[rarity] &&
		passiveGold >= 0 && passiveGold <= 10_000_000 && health >= 1 && health <= 1_000_000 &&
		damage >= 0 && damage <= 1_000_000 && critChance >= 0 && critChance <= 100 && abilityID > 0
}

func (u *UseCase) ensureAbilityExists(ctx context.Context, id int64) error {
	items, err := u.repo.ListAbilities(ctx)
	if err != nil {
		return err
	}
	for _, item := range items {
		if item.ID == id {
			return nil
		}
	}
	return ErrInvalidInput
}
