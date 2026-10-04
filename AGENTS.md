# AGENTS.md: blockchainlab-tools

Instructions for AI coding agents (Grok, Cursor, Claude Code, Codex, Copilot and others) working **in** this repo or **using it as a building block**. Humans: see [README.md](README.md).

## What this is

26 client-side blockchain developer tools (gas, units, ABI, tx decoder, ENS, storage slots, Merkle, Safe, EIP-712, approvals, MEV, Solana, PSBT...) as static pages with deep links, plus the shared ES-module logic (`assets/core.js`, `assets/core2.js`) usable from Node or the browser.

- Kind: web-app, library · stability: `stable` · licence: MIT
- Machine-readable manifest: [`blocks.json`](blocks.json) (schema: [BLOCKS-SCHEMA](https://github.com/Blockchains/.github/blob/main/docs/BLOCKS-SCHEMA.md))
- How it fits with the other Blockchains repos: [Build with Blocks](https://github.com/Blockchains/.github/blob/main/docs/BUILD-WITH-BLOCKS.md)

## Setup

```bash
npm install            # ethers, merkle-tree, @scure/* for the Node tests
python3 -m http.server   # serve the static pages locally
```

## Build and test

```bash
npm test                                   # live tests (units, ABI, ENS, fees on 7 chains, Safe, EIP-712, …)
python3 gen_pages.py && git diff --exit-code -- '*.html' sitemap.xml
pip install playwright && python3 test/e2e.py   # headless e2e of every page
```

Tests hit **live** public networks/APIs (the org rule is no mocks). A failure can be an upstream outage: re-run before changing code.

## Structure

| Path | What |
|---|---|
| `assets/core.js` | pack 1 shared logic |
| `assets/core2.js` | pack 2 logic (Safe, EIP-712, approvals, MEV, Solana, PSBT…) |
| `assets/ui.js, assets/app.css` | shared UI |
| `gen_pages.py, gen_pages2.py` | generate every `<tool>/index.html` |
| `<tool>/index.html` | generated pages, do not hand-edit |
| `test/` | live Node tests + Playwright e2e |

## Conventions

- Pages are generated: edit `gen_pages*.py` and `assets/*`, then regenerate.
- No backend, no keys, no tracking: public RPCs/APIs only, with timeouts (`tfetch`).
- Keep deep-link parameters backwards compatible.

## Extension points

- New tool: logic in `assets/core2.js` (exported, tested in `test/core2.test.mjs`), page in `gen_pages2.py`, then mirror it as an MCP tool in blockchainlab-mcp.

## Do

- Run `python3 gen_pages.py` and commit the regenerated HTML in the same change.

## Don't

- Hand-edit generated HTML.
- Add server-side components or analytics.
- Invent data, mock network responses in shipped code, or hard-code values that should come from the live source; every repo here is 'no mocks, real data'.
- Commit secrets, keys or `.env` files. Run `gitleaks` before pushing; CI and the org policy reject leaks.

## Using it from another project

- **tool deep links** (web): `https://blockchains.github.io/blockchainlab-tools/tx/?chain=base&hash=0x…`
- **assets/core.js** (file): `git clone + npm install, then import * as C from './assets/core.js'`
- **assets/core2.js** (file): `assets/core2.js`

See the README section [Use as a building block](README.md#use-as-a-building-block) for a copy-paste example.

## Related blocks

- [Blockchains/blockchainlab-mcp](https://github.com/Blockchains/blockchainlab-mcp): the MCP server wraps the same logic as agent tools
- [Blockchains/blockchainlab-lens](https://github.com/Blockchains/blockchainlab-lens): the extension opens these pages for explorer tx/address URLs
- [Blockchains/blockchainlab-api](https://github.com/Blockchains/blockchainlab-api): chains and EIP/ERC/BIP reference data
- [Blockchains/blockchain-dev-roadmap](https://github.com/Blockchains/blockchain-dev-roadmap): roadmap stages link to the tools
- [Blockchains/blockchains.github.io](https://github.com/Blockchains/blockchains.github.io): listed on the hub
