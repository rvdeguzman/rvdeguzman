.PHONY: orbs test check serve

# Prototype gallery, bound to this machine's Tailscale address when available.
HOST ?= $(shell tailscale ip -4 2>/dev/null || echo 127.0.0.1)
PORT ?= 4321

# Node 22.6+; no dependencies.
orbs:
	node --experimental-strip-types --no-warnings scripts/orbs-svg.ts .

test:
	node --experimental-strip-types --no-warnings --test scripts/orbs-svg.test.ts

check: test

serve:
	node --experimental-strip-types --no-warnings scripts/prototypes-server.ts . $(HOST) $(PORT)
