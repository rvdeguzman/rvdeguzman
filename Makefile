.PHONY: koi

# Path to a local checkout of braille-koi (the simulation source).
KOI ?= ../braille-koi

# Re-record the animated koi pond SVGs used in README.md.
koi:
	node --experimental-strip-types --no-warnings scripts/koi-svg.ts $(KOI) .
