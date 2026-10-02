.PHONY: koi test check

# Node 22.6+; no dependencies or external simulation checkout needed.
koi:
	node --experimental-strip-types --no-warnings scripts/koi-svg.ts .

test:
	node --experimental-strip-types --no-warnings --test scripts/koi-svg.test.ts

check: test
