package williams

import "testing"

func TestOptimalBatchSize(t *testing.T) {
	cases := []struct{ n, want int }{
		{0, 1},
		{1, 1},
		{2, 1},
		{3, 1},
		{4, 4},      // sqrt(4)=2, log2(4)=2, floor(2*2)=4
		{16, 16},    // sqrt(16)=4, log2(16)=4, floor(4*4)=16
		{100, 66},   // sqrt(100)=10, log2(100)≈6.64, floor(66.4)=66
		{1024, 320}, // sqrt(1024)=32, log2(1024)=10, floor(320)=320
	}
	for _, c := range cases {
		if got := OptimalBatchSize(c.n); got != c.want {
			t.Errorf("OptimalBatchSize(%d) = %d; want %d", c.n, got, c.want)
		}
	}
}

func TestOptimalBatchSizeBounds(t *testing.T) {
	for _, n := range []int{1, 2, 3, 4, 100, 10_000, 1_000_000} {
		got := OptimalBatchSize(n)
		if got < 1 || got > n {
			t.Errorf("OptimalBatchSize(%d) = %d, out of bounds [1, %d]", n, got, n)
		}
	}
}

func TestBatchCount(t *testing.T) {
	if got := BatchCount(0); got != 0 {
		t.Errorf("BatchCount(0) = %d; want 0", got)
	}
	if got := BatchCount(100); got != 2 { // 100 / 66 = 2 batches
		t.Errorf("BatchCount(100) = %d; want 2", got)
	}
}

func TestSpans(t *testing.T) {
	spans := Spans(100)
	if len(spans) != 2 {
		t.Fatalf("Spans(100): %d batches; want 2", len(spans))
	}
	total := 0
	for _, s := range spans {
		total += s.Len()
	}
	if total != 100 {
		t.Errorf("Spans(100) covers %d items; want 100", total)
	}
	// Verify spans are contiguous and cover [0, 100)
	if spans[0].Start != 0 {
		t.Errorf("first span start = %d; want 0", spans[0].Start)
	}
	if spans[len(spans)-1].End != 100 {
		t.Errorf("last span end = %d; want 100", spans[len(spans)-1].End)
	}
	for i := 1; i < len(spans); i++ {
		if spans[i].Start != spans[i-1].End {
			t.Errorf("non-contiguous: span %d start %d != prev end %d",
				i, spans[i].Start, spans[i-1].End)
		}
	}
}

func TestSpansEmpty(t *testing.T) {
	if got := Spans(0); got != nil {
		t.Errorf("Spans(0) = %v; want nil", got)
	}
}
