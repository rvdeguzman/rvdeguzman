.PHONY: orbs test check

# Node 22.6+; no dependencies.
orbs:
	node --experimental-strip-types --no-warnings scripts/orbs-svg.ts .

test:
	node --experimental-strip-types --no-warnings --test scripts/orbs-svg.test.ts

check: test
