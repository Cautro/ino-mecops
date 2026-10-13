package catalog

import "context"

type Repository interface {
	ListAbilities(context.Context) ([]Ability, error)
	CreateAbility(context.Context, Ability) (Ability, error)
	UpdateAbility(context.Context, int64, AbilityUpdateInput) (Ability, error)
	DeleteAbility(context.Context, int64) error
	ListSpecies(context.Context, bool) ([]Species, error)
	ListCollectionSpecies(context.Context, int64) ([]CollectionSpecies, error)
	CreateSpecies(context.Context, SpeciesInput) (Species, error)
	UpdateSpecies(context.Context, int64, SpeciesUpdateInput) (Species, error)
	ArchiveSpecies(context.Context, int64) error
}
