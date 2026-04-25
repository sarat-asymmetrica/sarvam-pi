package quaternion

import (
	"math"
	"testing"
)

func nearlyEqual(a, b, eps float64) bool {
	d := a - b
	if d < 0 {
		d = -d
	}
	return d < eps
}

func TestNewNormalizes(t *testing.T) {
	q := New(2, 0, 0, 0)
	if !nearlyEqual(q.Norm(), 1.0, 1e-12) {
		t.Errorf("New normalization failed: norm = %v", q.Norm())
	}
}

func TestNewZeroFallsBackToIdentity(t *testing.T) {
	q := New(0, 0, 0, 0)
	if q != Identity() {
		t.Errorf("New(0,0,0,0) = %v; want Identity", q)
	}
}

func TestIdentity(t *testing.T) {
	q := Identity()
	if q.W != 1 || q.X != 0 || q.Y != 0 || q.Z != 0 {
		t.Errorf("Identity() = %v; want (1,0,0,0)", q)
	}
	if !nearlyEqual(q.Norm(), 1.0, 1e-12) {
		t.Errorf("Identity norm = %v; want 1", q.Norm())
	}
}

func TestSlerpEndpoints(t *testing.T) {
	a := Identity()
	b := New(0, 1, 0, 0) // 180° rotation around X
	at0 := Slerp(a, b, 0)
	at1 := Slerp(a, b, 1)
	if !nearlyEqual(at0.Dot(a), 1.0, 1e-9) {
		t.Errorf("Slerp(_, _, 0) should equal a; dot=%v", at0.Dot(a))
	}
	dot := at1.Dot(b)
	if dot < 0 {
		dot = -dot
	}
	if !nearlyEqual(dot, 1.0, 1e-9) {
		t.Errorf("Slerp(_, _, 1) should equal b (or -b); dot=%v", dot)
	}
}

func TestSlerpMidpoint(t *testing.T) {
	a := Identity()
	b := New(0, 1, 0, 0)
	mid := Slerp(a, b, 0.5)
	if !nearlyEqual(mid.Norm(), 1.0, 1e-9) {
		t.Errorf("midpoint norm = %v; want 1", mid.Norm())
	}
}

func TestSlerpUnitInvariant(t *testing.T) {
	a := New(0.3, 0.4, 0.5, 0.6)
	b := New(0.6, 0.5, 0.4, 0.3)
	for _, t01 := range []float64{0, 0.1, 0.25, 0.5, 0.75, 0.9, 1} {
		mid := Slerp(a, b, t01)
		if !nearlyEqual(mid.Norm(), 1.0, 1e-9) {
			t.Errorf("Slerp(_, _, %v).Norm() = %v; want 1", t01, mid.Norm())
		}
	}
}

func TestFromMoments(t *testing.T) {
	q := FromMoments(0.5, 0.25, 0.1, 3.0)
	if !nearlyEqual(q.Norm(), 1.0, 1e-12) {
		t.Errorf("FromMoments norm = %v", q.Norm())
	}
}

func TestChainCoherenceMomentumDrift(t *testing.T) {
	c := NewChain(Identity())
	c.Append(Slerp(Identity(), New(0, 1, 0, 0), 0.1)) // small step
	c.Append(Slerp(Identity(), New(0, 1, 0, 0), 0.2)) // small step

	coh := c.Coherence()
	if coh < 0.9 {
		t.Errorf("expected high coherence for small steps; got %v", coh)
	}
	if c.Drift() > 0.1 {
		t.Errorf("expected low drift; got %v", c.Drift())
	}
	mom := c.Momentum()
	if mom <= 0 || mom > math.Pi {
		t.Errorf("momentum out of range: %v", mom)
	}
}

func TestChainSingleton(t *testing.T) {
	c := NewChain(Identity())
	if c.Coherence() != 1.0 {
		t.Errorf("singleton coherence = %v; want 1.0", c.Coherence())
	}
	if c.Momentum() != 0 {
		t.Errorf("singleton momentum = %v; want 0", c.Momentum())
	}
}

func TestMulIdentity(t *testing.T) {
	q := New(0.3, 0.4, 0.5, 0.6)
	r := q.Mul(Identity())
	if !nearlyEqual(r.W, q.W, 1e-12) || !nearlyEqual(r.X, q.X, 1e-12) {
		t.Errorf("q * Identity != q: %v vs %v", r, q)
	}
}
