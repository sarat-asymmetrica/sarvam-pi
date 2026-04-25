package regime

import "testing"

func TestNewDistributionNormalizes(t *testing.T) {
	d := NewDistribution(3, 2, 5)
	if d.R1 != 0.30 || d.R2 != 0.20 || d.R3 != 0.50 {
		t.Errorf("normalize failed: %+v", d)
	}
	sum := d.R1 + d.R2 + d.R3
	if sum < 0.999 || sum > 1.001 {
		t.Errorf("not normalized: sum=%v", sum)
	}
}

func TestNewDistributionDegenerate(t *testing.T) {
	d := NewDistribution(0, 0, 0)
	canon := CanonicalDistribution()
	if d != canon {
		t.Errorf("zero input should fall back to canonical; got %+v", d)
	}
}

func TestCanonicalDistribution(t *testing.T) {
	d := CanonicalDistribution()
	if d.R1 != 0.30 || d.R2 != 0.20 || d.R3 != 0.50 {
		t.Errorf("canonical wrong: %+v", d)
	}
}

func TestDominant(t *testing.T) {
	if NewDistribution(50, 25, 25).Dominant() != R1_Exploration {
		t.Error("50/25/25 should be R1-dominant")
	}
	if NewDistribution(20, 60, 20).Dominant() != R2_Optimization {
		t.Error("20/60/20 should be R2-dominant")
	}
	if CanonicalDistribution().Dominant() != R3_Stabilization {
		t.Error("30/20/50 should be R3-dominant")
	}
}

func TestBoundaryAlertsHealthy(t *testing.T) {
	d := CanonicalDistribution()
	alerts := DefaultBoundaries().Check(d)
	if !alerts.Healthy {
		t.Errorf("canonical 30/20/50 should be healthy: %+v", alerts)
	}
}

func TestBoundaryAlertsR1Low(t *testing.T) {
	d := NewDistribution(0.10, 0.40, 0.50)
	alerts := DefaultBoundaries().Check(d)
	if alerts.Healthy {
		t.Error("R1=10% should trip R1 alert")
	}
	if !alerts.R1Below {
		t.Error("R1Below should be true")
	}
}

func TestBoundaryAlertsMultipleLow(t *testing.T) {
	d := NewDistribution(0.10, 0.10, 0.80) // R1, R2 both below
	alerts := DefaultBoundaries().Check(d)
	if !alerts.R1Below || !alerts.R2Below {
		t.Errorf("expected R1Below + R2Below; got %+v", alerts)
	}
}

func TestDistance(t *testing.T) {
	a := CanonicalDistribution()
	b := NewDistribution(0.20, 0.30, 0.50) // R1 dropped, R2 rose
	dist := a.Distance(b)
	// |0.30-0.20| + |0.20-0.30| + |0.50-0.50| = 0.20
	if dist < 0.19 || dist > 0.21 {
		t.Errorf("distance = %v; want ~0.20", dist)
	}
}

func TestRegimeString(t *testing.T) {
	if R1_Exploration.String() != "R1_Exploration" {
		t.Error("R1 string mismatch")
	}
	if Unknown.String() != "Unknown" {
		t.Error("Unknown string mismatch")
	}
}
