// Package quaternion provides S³ unit-quaternion state representation, SLERP
// (spherical linear interpolation), and chain-coherence/momentum/drift
// observables for conversation/state tracking.
//
// Provenance:
//   - Lean: AsymmetricaProofs/Quaternion_S3_Norm_Invariant.lean
//   - Asymmetrica primitives.go (1,200+ LOC) — original Go reference impl
//   - Empirical: SLERP Conversation Chain (Sarvam harness Exp 13) —
//     coherence/momentum/drift bounded to [0, 1]
//
// Why this primitive ships in the first wave:
//   - S³ is the "never-invalid-by-construction" state space — ‖Q‖=1 always
//   - SLERP is O(1) arithmetic on 4 floats — geodesic by construction
//   - Coherence/momentum/drift are observables with known regimes
//     (stable conversation: coherence ≥ 0.85, drift ≤ 0.1)
//   - Replaces ad-hoc "state" structs with a closed-under-operations form
package quaternion

import "math"

// Q is a unit quaternion on S³. Construct via New(...) which normalizes;
// the zero value is invalid (‖0‖=0). All operations on Q maintain ‖Q‖=1
// up to float epsilon.
type Q struct {
	W, X, Y, Z float64
}

// New constructs a unit quaternion from 4 raw components by normalizing.
// If all components are zero, returns the identity quaternion (1, 0, 0, 0)
// rather than panicking — preserves the never-invalid invariant.
func New(w, x, y, z float64) Q {
	n := math.Sqrt(w*w + x*x + y*y + z*z)
	if n == 0 {
		return Q{W: 1}
	}
	return Q{W: w / n, X: x / n, Y: y / n, Z: z / n}
}

// Identity returns the multiplicative identity (1, 0, 0, 0).
func Identity() Q { return Q{W: 1} }

// FromMoments constructs a quaternion from the first four statistical
// moments of a distribution (mean, variance, skewness, kurtosis), then
// normalizes. This is the canonical Asymmetrica encoding pattern.
func FromMoments(mean, variance, skewness, kurtosis float64) Q {
	return New(mean, variance, skewness, kurtosis)
}

// Norm returns ‖Q‖. For unit quaternions this should be 1 ± epsilon.
func (q Q) Norm() float64 {
	return math.Sqrt(q.W*q.W + q.X*q.X + q.Y*q.Y + q.Z*q.Z)
}

// Dot returns the inner product q · r. Used by SLERP and coherence.
func (q Q) Dot(r Q) float64 {
	return q.W*r.W + q.X*r.X + q.Y*r.Y + q.Z*r.Z
}

// Conj returns the conjugate (w, -x, -y, -z).
func (q Q) Conj() Q { return Q{W: q.W, X: -q.X, Y: -q.Y, Z: -q.Z} }

// Mul returns the Hamilton product q * r. Result is unit if both inputs are.
func (q Q) Mul(r Q) Q {
	return Q{
		W: q.W*r.W - q.X*r.X - q.Y*r.Y - q.Z*r.Z,
		X: q.W*r.X + q.X*r.W + q.Y*r.Z - q.Z*r.Y,
		Y: q.W*r.Y - q.X*r.Z + q.Y*r.W + q.Z*r.X,
		Z: q.W*r.Z + q.X*r.Y - q.Y*r.X + q.Z*r.W,
	}
}

// Negate returns -q (component-wise). For unit quaternions, -q represents
// the same orientation as q on S³ and is used to take the short SLERP path.
func (q Q) Negate() Q { return Q{W: -q.W, X: -q.X, Y: -q.Y, Z: -q.Z} }

// Slerp returns the spherical linear interpolation from q to r at t ∈ [0,1].
// Always picks the short geodesic; never produces a non-unit result.
func Slerp(q, r Q, t float64) Q {
	d := q.Dot(r)
	if d < 0 {
		r = r.Negate()
		d = -d
	}
	const epsilon = 1e-6
	if d > 1-epsilon {
		// Linear fallback when q ≈ r to avoid NaN; renormalize.
		return New(
			q.W+t*(r.W-q.W),
			q.X+t*(r.X-q.X),
			q.Y+t*(r.Y-q.Y),
			q.Z+t*(r.Z-q.Z),
		)
	}
	theta0 := math.Acos(d)
	thetaT := theta0 * t
	sinTheta0 := math.Sin(theta0)
	sinThetaT := math.Sin(thetaT)
	a := math.Cos(thetaT) - d*sinThetaT/sinTheta0
	b := sinThetaT / sinTheta0
	return Q{
		W: a*q.W + b*r.W,
		X: a*q.X + b*r.X,
		Y: a*q.Y + b*r.Y,
		Z: a*q.Z + b*r.Z,
	}
}

// Chain is an append-only sequence of unit quaternions representing the
// trajectory of a state on S³. Use it to track conversation state, agent
// trajectory, or any process that walks the sphere.
type Chain struct {
	states []Q
}

// NewChain seeds the chain with an initial state.
func NewChain(initial Q) *Chain { return &Chain{states: []Q{initial}} }

// Append adds a new state to the chain. Pure append — chains are
// monotonic; replay-friendly.
func (c *Chain) Append(q Q) { c.states = append(c.states, q) }

// Len returns the number of states in the chain.
func (c *Chain) Len() int { return len(c.states) }

// Last returns the most recent state (Identity if empty).
func (c *Chain) Last() Q {
	if len(c.states) == 0 {
		return Identity()
	}
	return c.states[len(c.states)-1]
}

// Coherence returns the average dot-product magnitude between adjacent
// states. 1.0 = perfectly coherent (no movement). 0.0 = orthogonal jumps.
//
// Stable conversation regime: coherence ≥ 0.85 (empirical).
func (c *Chain) Coherence() float64 {
	if len(c.states) < 2 {
		return 1.0
	}
	sum := 0.0
	for i := 1; i < len(c.states); i++ {
		d := c.states[i-1].Dot(c.states[i])
		if d < 0 {
			d = -d
		}
		sum += d
	}
	return sum / float64(len(c.states)-1)
}

// Momentum returns the magnitude of the cumulative change between the
// first and last state, i.e. the "geodesic distance traveled". 0 = no
// movement; π = antipodal (maximum on S³).
func (c *Chain) Momentum() float64 {
	if len(c.states) < 2 {
		return 0
	}
	d := c.states[0].Dot(c.Last())
	if d < 0 {
		d = -d
	}
	if d > 1 {
		d = 1
	}
	return math.Acos(d)
}

// Drift returns 1 - Coherence. High drift = the chain is wandering;
// low drift = stable trajectory.
func (c *Chain) Drift() float64 { return 1.0 - c.Coherence() }
