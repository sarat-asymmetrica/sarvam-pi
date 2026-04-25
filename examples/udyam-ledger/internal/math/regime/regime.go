// Package regime implements the Three-Regime classifier and boundary
// alerts proven across 14+ Asymmetrica research domains.
//
// Provenance:
//   - Lean: AsymmetricaProofs/ThreeRegime_BoundaryAlerts.lean
//   - Empirical: ATLAS, EEG, KOMP, FlowER cross-domain validation
//     (releases/01-cross-domain-validation/)
//   - Sarvam harness Exp 14: boundary alert thresholds
//   - Origin: Genomics three-regime substrate hypothesis
//
// Why this primitive ships in the first wave:
//   - The 30/20/50 ratio is *one possible* equilibrium, not universal —
//     the *three-ness* is universal (k=3 supported by 3/4 metrics in
//     ATLAS+EEG, 1/4 in KOMP+FlowER per Feb-28 sprint findings)
//   - Boundary thresholds (R1≥25%, R2≥15%, R3≥45%) are conservative
//     stability gates — distribution outside these is "unhealthy swarm"
//   - Used by the orchestrator's daily-rhythm health monitor and as the
//     app-substrate's runtime regime detector
package regime

// Regime identifies which dynamical regime a system is in.
type Regime int

const (
	Unknown        Regime = 0
	R1_Exploration Regime = 1
	R2_Optimization Regime = 2
	R3_Stabilization Regime = 3
)

func (r Regime) String() string {
	switch r {
	case R1_Exploration:
		return "R1_Exploration"
	case R2_Optimization:
		return "R2_Optimization"
	case R3_Stabilization:
		return "R3_Stabilization"
	}
	return "Unknown"
}

// Distribution captures the fraction of activity in each regime. Should
// sum to 1.0; the constructor normalizes to enforce that.
type Distribution struct {
	R1, R2, R3 float64
}

// NewDistribution normalizes the input fractions to sum to 1.0. Panics
// if all three are zero — that would be ill-defined.
func NewDistribution(r1, r2, r3 float64) Distribution {
	sum := r1 + r2 + r3
	if sum <= 0 {
		// Degenerate input; return the canonical 30/20/50 default.
		return Distribution{R1: 0.30, R2: 0.20, R3: 0.50}
	}
	return Distribution{R1: r1 / sum, R2: r2 / sum, R3: r3 / sum}
}

// CanonicalDistribution returns the 30/20/50 ratio empirically observed
// across the validated cross-domain study. Use as a comparison baseline,
// not a target — local optima may differ.
func CanonicalDistribution() Distribution {
	return Distribution{R1: 0.30, R2: 0.20, R3: 0.50}
}

// Dominant returns the regime with the largest share of activity. Ties
// resolve toward R3 (stabilization), then R2, then R1 — favoring the
// more "settled" interpretation when the distribution is ambiguous.
func (d Distribution) Dominant() Regime {
	maxR := R3_Stabilization
	maxV := d.R3
	if d.R2 > maxV {
		maxR, maxV = R2_Optimization, d.R2
	}
	if d.R1 > maxV {
		maxR = R1_Exploration
	}
	return maxR
}

// BoundaryAlerts holds the conservative stability thresholds. A
// distribution that falls outside any of these is flagged.
type BoundaryAlerts struct {
	R1Min float64 // exploration must be at least this much (default 0.25)
	R2Min float64 // optimization must be at least this much (default 0.15)
	R3Min float64 // stabilization must be at least this much (default 0.45)
}

// DefaultBoundaries returns the empirically-validated thresholds:
// R1≥25%, R2≥15%, R3≥45%. Distributions outside these correlate with
// instability across the 14+ domains studied.
func DefaultBoundaries() BoundaryAlerts {
	return BoundaryAlerts{R1Min: 0.25, R2Min: 0.15, R3Min: 0.45}
}

// AlertResult reports which boundaries (if any) the distribution violates.
type AlertResult struct {
	Healthy   bool
	R1Below   bool
	R2Below   bool
	R3Below   bool
	Reasoning string
}

// Check applies the boundary alerts to the given distribution.
func (b BoundaryAlerts) Check(d Distribution) AlertResult {
	r := AlertResult{Healthy: true}
	var reasons []string
	if d.R1 < b.R1Min {
		r.R1Below = true
		r.Healthy = false
		reasons = append(reasons, "R1 (exploration) below floor")
	}
	if d.R2 < b.R2Min {
		r.R2Below = true
		r.Healthy = false
		reasons = append(reasons, "R2 (optimization) below floor")
	}
	if d.R3 < b.R3Min {
		r.R3Below = true
		r.Healthy = false
		reasons = append(reasons, "R3 (stabilization) below floor")
	}
	if r.Healthy {
		r.Reasoning = "all boundary floors satisfied"
	} else {
		r.Reasoning = joinReasons(reasons)
	}
	return r
}

func joinReasons(rs []string) string {
	out := ""
	for i, r := range rs {
		if i > 0 {
			out += "; "
		}
		out += r
	}
	return out
}

// Distance returns the L1 distance between two distributions, useful for
// drift detection across time windows.
func (d Distribution) Distance(other Distribution) float64 {
	abs := func(x float64) float64 {
		if x < 0 {
			return -x
		}
		return x
	}
	return abs(d.R1-other.R1) + abs(d.R2-other.R2) + abs(d.R3-other.R3)
}
