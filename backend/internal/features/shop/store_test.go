package shop

import "testing"

func TestEggPrices(t *testing.T) {
	cases := []struct {
		rarity string
		want   int64
	}{
		{"common", 250},
		{"rare", 1000},
		{"epic", 2500},
		{"legendary", 7500},
		{"mythic", 15000},
	}
	for _, tc := range cases {
		t.Run(tc.rarity, func(t *testing.T) {
			got, ok := priceForRarity(tc.rarity)
			if !ok || got != tc.want {
				t.Fatalf("priceForRarity(%q) = %d, %v; want %d, true", tc.rarity, got, ok, tc.want)
			}
		})
	}
}

func TestEggPriceRejectsUnknownRarity(t *testing.T) {
	if _, ok := priceForRarity("ultra-secret"); ok {
		t.Fatal("unknown rarity should not be purchasable")
	}
}
