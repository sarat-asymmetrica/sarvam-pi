// Module file for the Shoshin math primitives template tree. This is *not*
// the user's app module — Shoshin copies individual primitive directories
// into the user's app under <app>/internal/math/<primitive>/, where the
// user's go.mod takes over.
//
// This module exists so the templates can be `go test`-ed in isolation.
module shoshin-mathprimitives

go 1.21
