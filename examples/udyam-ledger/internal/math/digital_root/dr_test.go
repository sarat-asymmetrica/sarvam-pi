package digitalroot

import "testing"

func TestDR(t *testing.T) {
	cases := []struct {
		n, want int
	}{
		{0, 0},
		{1, 1},
		{9, 9},
		{10, 1},
		{18, 9},
		{19, 1},
		{99, 9},
		{123, 6},
		{1729, 1}, // Hardy-Ramanujan: 1+7+2+9=19 → 1+9=10 → 1
		{-18, 9},
	}
	for _, c := range cases {
		if got := DR(c.n); got != c.want {
			t.Errorf("DR(%d) = %d; want %d", c.n, got, c.want)
		}
	}
}

func TestDRDigits(t *testing.T) {
	cases := []struct{ n, want int }{
		{0, 0},
		{1, 1},
		{9, 9},
		{18, 9},
		{1729, 1}, // 1+7+2+9=19 → 1+9 → 1
	}
	for _, c := range cases {
		if got := DRDigits(c.n); got != c.want {
			t.Errorf("DRDigits(%d) = %d; want %d", c.n, got, c.want)
		}
	}
}

func TestDRBytes(t *testing.T) {
	if got := DRBytes([]byte("A")); got != 2 { // 65 → 6+5=11 → 2
		t.Errorf("DRBytes('A') = %d; want 2", got)
	}
	if got := DRBytes([]byte{}); got != 0 {
		t.Errorf("DRBytes(empty) = %d; want 0", got)
	}
}

func TestDRToRegime(t *testing.T) {
	r1 := []int{0, 1, 4, 7}
	r2 := []int{2, 5, 8}
	r3 := []int{3, 6, 9}
	for _, n := range r1 {
		if DRToRegime(n) != R1 {
			t.Errorf("DRToRegime(%d) != R1", n)
		}
	}
	for _, n := range r2 {
		if DRToRegime(n) != R2 {
			t.Errorf("DRToRegime(%d) != R2", n)
		}
	}
	for _, n := range r3 {
		if DRToRegime(n) != R3 {
			t.Errorf("DRToRegime(%d) != R3", n)
		}
	}
}

func TestClassifyRegime(t *testing.T) {
	if ClassifyRegime(1729) != R1 { // dr=1 → R1
		t.Error("1729 should classify as R1")
	}
	if ClassifyRegime(99) != R3 { // dr=9 → R3
		t.Error("99 should classify as R3")
	}
	if ClassifyRegime(8) != R2 { // dr=8 → R2
		t.Error("8 should classify as R2")
	}
}

func TestFilter(t *testing.T) {
	// Skip queries with stabilization-regime DR (would already be answerable).
	if !Filter(99, 3, 6, 9) {
		t.Error("Filter(99, {3,6,9}) should be true (dr=9)")
	}
	if Filter(7, 3, 6, 9) {
		t.Error("Filter(7, {3,6,9}) should be false (dr=7)")
	}
}

func TestDigitalRootChain(t *testing.T) {
	c := NewChain(108)
	if c.DR() != 9 {
		t.Fatalf("NewChain(108).DR() = %d; want 9", c.DR())
	}
	if c.Regime() != R3 {
		t.Errorf("Regime mismatch: got %v want R3", c.Regime())
	}
	c2 := c.Then(func(n int) int { return n * 2 })
	if c2.Value() != 216 {
		t.Errorf("Then *2: value = %d; want 216", c2.Value())
	}
	if c2.DR() != 9 { // 216 → 2+1+6=9
		t.Errorf("Then *2: dr = %d; want 9", c2.DR())
	}
	// original unchanged (purity)
	if c.Value() != 108 {
		t.Errorf("original chain mutated: %d", c.Value())
	}
}
