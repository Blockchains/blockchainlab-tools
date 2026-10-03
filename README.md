# Blockchain Lab Tools

![Blockchain Lab Tools](social-preview.png)

**Free, open-source blockchain developer tools that run 100% in your browser** against live public RPCs and APIs. No backend, no accounts, no tracking.

**Live:** https://blockchains.github.io/blockchainlab-tools/

> Built by **Blockchain Lab — [blockchainlab.com](https://blockchainlab.com/?utm_source=github&utm_medium=readme&utm_campaign=blockchainlab-tools)**

| Tool | What it does |
|---|---|
| [Gas & fee estimator](https://blockchains.github.io/blockchainlab-tools/gas/) | Live base fee / priority tips (eth_feeHistory) on Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche + Bitcoin sat/vB + Solana priority fees, with USD cost |
| [Unit converter](https://blockchains.github.io/blockchainlab-tools/units/) | wei/gwei/ether, sats/BTC, lamports/SOL with exact BigInt maths |
| [ABI encoder/decoder](https://blockchains.github.io/blockchainlab-tools/abi/) | Encode calls, decode calldata, selectors/topics, unknown-selector lookup (openchain + 4byte) |
| [Address & ENS](https://blockchains.github.io/blockchainlab-tools/address/) | EIP-55 checksum, ENS forward/reverse, balance, nonce, contract detection, EIP-1967/zeppelinos proxy implementation, EIP-7702 delegation, ERC-20 metadata |
| [Transaction decoder](https://blockchains.github.io/blockchainlab-tools/tx/) | Status, fees, L1 data fee, decoded function + args and event logs for any tx hash on 7 EVM chains |
| [Hash & Merkle](https://blockchains.github.io/blockchainlab-tools/hash/) | keccak256/sha256/ripemd160; OpenZeppelin StandardMerkleTree / SimpleMerkleTree roots + proofs |
| [Storage slots](https://blockchains.github.io/blockchainlab-tools/storage/) | Mapping / nested mapping / dynamic array / ERC-7201 / EIP-1967 slots, then read the live value |
| [EIP/ERC/BIP reference](https://blockchains.github.io/blockchainlab-tools/reference/) | Search every EIP, ERC and BIP (rebuilt nightly from the official repos) |
| [Chainlist](https://blockchains.github.io/blockchainlab-tools/chains/) | 2,700+ EVM chains from chainid.network, live RPC latency test, add-to-wallet |
| [Token lookup](https://blockchains.github.io/blockchainlab-tools/tokens/) | Uniswap default token list search + on-chain verification |

### Deep links (used by [blockchainlab-lens](https://github.com/Blockchains/blockchainlab-lens) and the [MCP server](https://github.com/Blockchains/blockchainlab-mcp))

- `https://blockchains.github.io/blockchainlab-tools/tx/?chain=base&hash=0x…`
- `https://blockchains.github.io/blockchainlab-tools/address/?q=vitalik.eth&chain=ethereum`
- `https://blockchains.github.io/blockchainlab-tools/abi/?data=0xa9059cbb…`
- `https://blockchains.github.io/blockchainlab-tools/units/?v=1.5&u=ether` · `https://blockchains.github.io/blockchainlab-tools/reference/?q=4337` · `https://blockchains.github.io/blockchainlab-tools/chains/?q=8453`

## Data sources (all public, all live)

| Source | Used for |
|---|---|
| [PublicNode](https://www.publicnode.com/) RPCs (+ mainnet.base.org, arb1.arbitrum.io fallbacks) | gas, tx, address, storage, ERC-20 reads |
| [mempool.space API](https://mempool.space/docs/api/rest) | Bitcoin fee rates |
| Solana RPC `getRecentPrioritizationFees` | Solana priority fees |
| [DefiLlama coins API](https://defillama.com/docs/api) | USD prices |
| [openchain.xyz](https://openchain.xyz/signatures) / [4byte.directory](https://www.4byte.directory/) | function / event signatures |
| [Blockchain Lab Open Data API](https://blockchains.github.io/blockchainlab-api/) | chains (chainid.network), EIPs/ERCs/BIPs |
| [Uniswap token list](https://tokens.uniswap.org) | token lookup |

Caveats: L2 gas figures are execution fees only (rollups add an L1 data fee, shown per-tx in the decoder when the receipt reports it). Public RPCs are pruned — very old Ethereum history (pre-block ~15.5M) may be unavailable.

## Tests

Everything is tested against **live** networks — no mocks:

```bash
npm install && npm test          # Node: units, ABI, ENS, fees on 7 chains, real tx decoding, Merkle/ERC-7201 vectors, USDC storage slot == balanceOf
pip install playwright && python3 test/e2e.py   # headless Chrome against the live Pages site, every tool
```

CI runs both on every push and daily ([live-tests.yml](.github/workflows/live-tests.yml)).

## Develop

Plain HTML + ES modules, ethers v6 and @openzeppelin/merkle-tree via import map (CDN). `python3 gen_pages.py` regenerates the tool pages; shared logic lives in [`assets/core.js`](assets/core.js).

## Related

[Open Data API](https://github.com/Blockchains/blockchainlab-api) · [MCP server](https://github.com/Blockchains/blockchainlab-mcp) · [Lens](https://github.com/Blockchains/blockchainlab-lens) · [Labs](https://github.com/Blockchains/blockchainlab-labs) · [Roadmap](https://github.com/Blockchains/blockchain-dev-roadmap) · [Interview questions](https://github.com/Blockchains/blockchain-interview-questions) · [Whitepaper library](https://blockchainlab.com/whitepaper?utm_source=github&utm_medium=readme&utm_campaign=blockchainlab-tools)

MIT licensed. Not financial advice.

---
Built by Blockchain Lab — [blockchainlab.com](https://blockchainlab.com/?utm_source=github&utm_medium=readme&utm_campaign=blockchainlab-tools)
