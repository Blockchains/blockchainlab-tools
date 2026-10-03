// Blockchain Lab Tools — shared client-side logic. Built by Blockchain Lab — https://blockchainlab.com
// Runs in the browser (via import map) and in Node (npm i ethers @openzeppelin/merkle-tree) for tests.
import { ethers } from "ethers";
import { StandardMerkleTree, SimpleMerkleTree } from "@openzeppelin/merkle-tree";

export const API = "https://blockchains.github.io/blockchainlab-api/v1";
export const SITE = "https://blockchainlab.com";
export const utm = (path, tool) => `${SITE}${path}${path.includes("?") ? "&" : "?"}utm_source=blockchainlab-tools&utm_medium=tool&utm_campaign=${tool}`;

export const CHAINS = {
  ethereum: { id: 1, name: "Ethereum", symbol: "ETH", gecko: "ethereum", rpcs: ["https://ethereum-rpc.publicnode.com"], explorer: "https://etherscan.io" },
  base: { id: 8453, name: "Base", symbol: "ETH", gecko: "ethereum", rpcs: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"], explorer: "https://basescan.org", l2: true },
  arbitrum: { id: 42161, name: "Arbitrum One", symbol: "ETH", gecko: "ethereum", rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"], explorer: "https://arbiscan.io", l2: true },
  optimism: { id: 10, name: "OP Mainnet", symbol: "ETH", gecko: "ethereum", rpcs: ["https://optimism-rpc.publicnode.com"], explorer: "https://optimistic.etherscan.io", l2: true },
  polygon: { id: 137, name: "Polygon PoS", symbol: "POL", gecko: "polygon-ecosystem-token", rpcs: ["https://polygon-bor-rpc.publicnode.com"], explorer: "https://polygonscan.com" },
  bsc: { id: 56, name: "BNB Smart Chain", symbol: "BNB", gecko: "binancecoin", rpcs: ["https://bsc-rpc.publicnode.com"], explorer: "https://bscscan.com" },
  avalanche: { id: 43114, name: "Avalanche C-Chain", symbol: "AVAX", gecko: "avalanche-2", rpcs: ["https://avalanche-c-chain-rpc.publicnode.com"], explorer: "https://snowtrace.io" },
};
export const chainById = (id) => Object.entries(CHAINS).find(([, c]) => c.id === Number(id))?.[0];

export async function rpc(chain, method, params = []) {
  const c = CHAINS[chain]; if (!c) throw new Error(`Unknown chain ${chain}`);
  let last;
  for (const url of c.rpcs) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || JSON.stringify(j.error));
      return j.result;
    } catch (e) { last = e; }
  }
  throw last;
}
const big = (h) => BigInt(h);

// ---------- Prices (DefiLlama coins API) ----------
export async function prices(ids) {
  const u = `https://coins.llama.fi/prices/current/${[...new Set(ids)].map(i => "coingecko:" + i).join(",")}`;
  const j = await getJSON(u);
  const out = {}; for (const [k, v] of Object.entries(j.coins || {})) out[k.split(":")[1]] = v.price; return out;
}

// ---------- Gas / fees ----------
export async function evmFees(chain) {
  const [gasPrice, hist] = await Promise.all([rpc(chain, "eth_gasPrice"), rpc(chain, "eth_feeHistory", ["0x14", "latest", [25, 50, 75]]).catch(() => null)]);
  const res = { chain, gasPriceWei: big(gasPrice) };
  if (hist && hist.baseFeePerGas) {
    res.baseFeeWei = big(hist.baseFeePerGas[hist.baseFeePerGas.length - 1]); // next block
    const tips = [0, 1, 2].map(i => { const arr = hist.reward.map(r => big(r[i])).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); return arr[Math.floor(arr.length / 2)]; });
    res.tipWei = { low: tips[0], mid: tips[1], high: tips[2] };
    res.oldestBlock = Number(hist.oldestBlock);
  }
  return res;
}
export function feeCost(f, gasUnits, tier = "mid") {
  const per = f.baseFeeWei !== undefined ? f.baseFeeWei + (f.tipWei?.[tier] ?? 0n) : f.gasPriceWei;
  return { perGasWei: per, totalWei: per * BigInt(gasUnits) };
}
async function getJSON(url, tries = 3) {
  let last; for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`); return await r.json(); } catch (e) { last = e; await new Promise(s => setTimeout(s, 600 * (i + 1))); } } throw last;
}
export async function btcFees() { // sat/vB — mempool.space, with Blockstream Esplora as fallback
  try { return { ...(await getJSON("https://mempool.space/api/v1/fees/recommended")), source: "mempool.space" }; }
  catch { const e = await getJSON("https://blockstream.info/api/fee-estimates"); const r = (n) => Math.ceil(e[n]); return { fastestFee: r("1"), halfHourFee: r("3"), hourFee: r("6"), economyFee: r("144"), minimumFee: Math.floor(e["1008"] || 1), source: "blockstream.info" }; }
}
// Fees are sampled over recent slots where these widely-used accounts were write-locked (USDC mint, wSOL mint, Jupiter v6 program).
export const SOL_HOT_ACCOUNTS = ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "So11111111111111111111111111111111111111112", "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"];
export async function solFees() {
  const r = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [SOL_HOT_ACCOUNTS] }) });
  const arr = ((await r.json()).result || []).map(x => x.prioritizationFee).sort((a, b) => a - b);
  const pct = (p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
  return { baseLamportsPerSignature: 5000, priorityMicroLamportsPerCU: { p50: pct(0.5), p75: pct(0.75), p90: pct(0.9) }, samples: arr.length };
}

// ---------- Units ----------
export const UNITS = { wei: 0, kwei: 3, mwei: 6, gwei: 9, szabo: 12, finney: 15, ether: 18, sat: 0, btc: 8, lamport: 0, sol: 9 };
export function convertUnits(value, from) {
  const fam = ["sat", "btc"].includes(from) ? "btc" : ["lamport", "sol"].includes(from) ? "sol" : "eth";
  const base = ethers.parseUnits(String(value).trim(), UNITS[from]);
  const keys = fam === "btc" ? ["sat", "btc"] : fam === "sol" ? ["lamport", "sol"] : ["wei", "kwei", "mwei", "gwei", "szabo", "finney", "ether"];
  const out = {}; for (const k of keys) out[k] = trimZeros(ethers.formatUnits(base, UNITS[k]));
  out._hex = "0x" + base.toString(16); return out;
}
const trimZeros = (s) => s.includes(".") ? s.replace(/\.?0+$/, "") : s;

// ---------- ABI ----------
export const selector = (sig) => ethers.id(normSig(sig)).slice(0, 10);
export const topic = (sig) => ethers.id(normSig(sig));
export function normSig(sig) {
  sig = sig.trim();
  if (sig.startsWith("event ")) return ethers.EventFragment.from(sig).format("sighash");
  if (sig.startsWith("error ")) return ethers.ErrorFragment.from(sig).format("sighash");
  return ethers.FunctionFragment.from(sig.startsWith("function ") ? sig : "function " + sig).format("sighash");
}
export function encodeCall(sig, args) {
  const iface = new ethers.Interface([sig.startsWith("function ") ? sig : "function " + sig]);
  const fn = iface.fragments[0];
  return iface.encodeFunctionData(fn, args);
}
export async function lookupSelector(sel) {
  sel = sel.slice(0, 10).toLowerCase();
  const out = new Set();
  try { const j = await (await fetch(`https://api.openchain.xyz/signature-database/v1/lookup?function=${sel}&filter=true`)).json(); (j.result?.function?.[sel] || []).forEach(x => out.add(x.name)); } catch {}
  if (!out.size) { try { const j = await (await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}&ordering=created_at`)).json(); (j.results || []).forEach(x => out.add(x.text_signature)); } catch {} }
  return [...out];
}
export async function lookupEvent(topic0) {
  try { const j = await (await fetch(`https://api.openchain.xyz/signature-database/v1/lookup?event=${topic0}&filter=true`)).json(); return (j.result?.event?.[topic0] || []).map(x => x.name); } catch { return []; }
}
const fmtArg = (v) => typeof v === "bigint" ? v.toString() : Array.isArray(v) ? v.map(fmtArg) : (v && typeof v.toArray === "function") ? v.toArray().map(fmtArg) : v;
export async function decodeCalldata(data, sigHint) {
  data = data.trim();
  if (data === "0x" || data.length < 10) return { selector: null, note: "Empty calldata (plain value transfer)" };
  const sel = data.slice(0, 10).toLowerCase();
  const cands = sigHint ? [sigHint] : await lookupSelector(sel);
  for (const s of cands) {
    try {
      const iface = new ethers.Interface(["function " + s.replace(/^function /, "")]);
      const fn = iface.fragments[0];
      const dec = iface.decodeFunctionData(fn, data);
      return { selector: sel, signature: fn.format("sighash"), args: fn.inputs.map((p, i) => ({ name: p.name || `arg${i}`, type: p.type, value: fmtArg(dec[i]) })), candidates: cands };
    } catch {}
  }
  return { selector: sel, signature: null, candidates: cands, note: "No matching signature decoded" };
}

// ---------- Addresses / ENS ----------
export function checkAddress(a) {
  a = a.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { valid: false };
  const checksum = ethers.getAddress(a.toLowerCase());
  const mixed = a !== a.toLowerCase() && a !== a.toUpperCase().replace("0X", "0x");
  return { valid: true, checksum, inputChecksumValid: mixed ? a === checksum : null };
}
let _mainnet;
export function mainnetProvider() { return _mainnet ||= new ethers.JsonRpcProvider(CHAINS.ethereum.rpcs[0], 1, { staticNetwork: ethers.Network.from(1) }); }
export async function resolveEns(name) { return await mainnetProvider().resolveName(name.trim()); }
export async function reverseEns(addr) { return await mainnetProvider().lookupAddress(addr.trim()); }
export async function addressInfo(chain, addr) {
  const [bal, code, nonce] = await Promise.all([rpc(chain, "eth_getBalance", [addr, "latest"]), rpc(chain, "eth_getCode", [addr, "latest"]), rpc(chain, "eth_getTransactionCount", [addr, "latest"])]);
  const res = { chain, balanceWei: big(bal), isContract: code && code !== "0x", codeBytes: code && code !== "0x" ? (code.length - 2) / 2 : 0, nonce: Number(nonce) };
  if (res.isContract) {
    const impl = await rpc(chain, "eth_getStorageAt", [addr, EIP1967.implementation, "latest"]);
    if (big(impl) !== 0n) res.eip1967Implementation = ethers.getAddress("0x" + impl.slice(-40));
    else {
      const legacy = await rpc(chain, "eth_getStorageAt", [addr, ethers.id("org.zeppelinos.proxy.implementation"), "latest"]);
      if (big(legacy) !== 0n) res.zeppelinosImplementation = ethers.getAddress("0x" + legacy.slice(-40));
    }
    if (res.codeBytes === 23 && code.startsWith("0xef0100")) res.eip7702DelegatesTo = ethers.getAddress("0x" + code.slice(8));
  }
  return res;
}
export async function erc20Meta(chain, token) {
  const call = (data) => rpc(chain, "eth_call", [{ to: token, data }, "latest"]);
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const str = (h) => { try { return coder.decode(["string"], h)[0]; } catch { try { return ethers.decodeBytes32String(h); } catch { return null; } } };
  const [n, s, d, t] = await Promise.all([call(selector("name()")), call(selector("symbol()")), call(selector("decimals()")), call(selector("totalSupply()"))].map(p => p.catch(() => "0x")));
  const decimals = d !== "0x" ? Number(big(d)) : null;
  return { name: n !== "0x" ? str(n) : null, symbol: s !== "0x" ? str(s) : null, decimals, totalSupply: t !== "0x" && decimals !== null ? ethers.formatUnits(big(t), decimals) : null };
}

// ---------- Transactions ----------
const KNOWN_EVENTS = ["Transfer(address,address,uint256)", "Approval(address,address,uint256)", "Swap(address,uint256,uint256,uint256,uint256,address)", "Swap(address,address,int256,int256,uint160,uint128,int24)", "Deposit(address,uint256)", "Withdrawal(address,uint256)", "Sync(uint112,uint112)", "TransferSingle(address,address,address,uint256,uint256)", "ApprovalForAll(address,address,bool)", "OwnershipTransferred(address,address)", "Upgraded(address)"];
export async function decodeTx(chain, hash) {
  const [tx, rc] = await Promise.all([rpc(chain, "eth_getTransactionByHash", [hash]), rpc(chain, "eth_getTransactionReceipt", [hash])]);
  if (!tx) throw new Error(`Transaction not found on ${CHAINS[chain].name}`);
  const out = { chain, hash, from: tx.from, to: tx.to, valueWei: big(tx.value), nonce: Number(tx.nonce), type: Number(tx.type), block: tx.blockNumber ? Number(tx.blockNumber) : null, input: tx.input };
  if (rc) {
    out.status = rc.status === "0x1" ? "success" : "reverted";
    out.gasUsed = big(rc.gasUsed); out.effectiveGasPriceWei = big(rc.effectiveGasPrice || tx.gasPrice); out.feeWei = out.gasUsed * out.effectiveGasPriceWei;
    if (rc.l1Fee) out.l1FeeWei = big(rc.l1Fee);
    if (rc.contractAddress) out.contractCreated = rc.contractAddress;
  }
  if (out.block !== null) { const b = await rpc(chain, "eth_getBlockByNumber", [tx.blockNumber, false]); out.timestamp = new Date(Number(b.timestamp) * 1000).toISOString(); }
  out.call = await decodeCalldata(tx.input);
  out.logs = [];
  const known = Object.fromEntries(KNOWN_EVENTS.map(s => [ethers.id(s), s]));
  for (const log of rc?.logs || []) {
    const t0 = log.topics[0]; let sigs = known[t0] ? [known[t0]] : [];
    const entry = { address: log.address, topic0: t0, event: null, args: null };
    if (!sigs.length && t0) sigs = await lookupEvent(t0);
    for (const s of sigs) {
      // try every indexed/non-indexed split that matches the topic count
      const types = ethers.FunctionFragment.from("function " + s).inputs.map(i => i.type);
      const nIdx = log.topics.length - 1; if (nIdx > types.length) continue;
      const combos = combinations(types.length, nIdx);
      for (const idxSet of combos) {
        const sigFull = `event ${s.split("(")[0]}(${types.map((t, i) => t + (idxSet.includes(i) ? " indexed" : "")).join(",")})`;
        try { const iface = new ethers.Interface([sigFull]); const p = iface.parseLog(log); if (p) { entry.event = s; entry.args = p.args.toArray().map(fmtArg); break; } } catch {}
      }
      if (entry.event) break;
    }
    out.logs.push(entry);
  }
  return out;
}
function combinations(n, k) { const res = []; const rec = (s, a) => { if (a.length === k) { res.push(a); return; } for (let i = s; i < n; i++) rec(i + 1, [...a, i]); }; rec(0, []); return res.slice(0, 64); }

// ---------- Hashing & Merkle ----------
export function hashes(input, mode = "text") {
  const bytes = mode === "hex" ? ethers.getBytes(input.trim()) : ethers.toUtf8Bytes(input);
  return { keccak256: ethers.keccak256(bytes), sha256: ethers.sha256(bytes), ripemd160: ethers.ripemd160(bytes), bytes: bytes.length };
}
export function merkleStandard(types, rows) { // OpenZeppelin StandardMerkleTree (double-hashed abi.encode leaves)
  const tree = StandardMerkleTree.of(rows, types);
  return { root: tree.root, proofs: rows.map((r, i) => ({ leaf: r, proof: tree.getProof(i) })), dump: tree.dump() };
}
export function merkleSimple(leaves) { // OpenZeppelin SimpleMerkleTree over bytes32 leaves
  const tree = SimpleMerkleTree.of(leaves);
  return { root: tree.root, proofs: leaves.map((l, i) => ({ leaf: l, proof: tree.getProof(i) })) };
}

// ---------- Storage slots ----------
export const EIP1967 = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
};
const coder = () => ethers.AbiCoder.defaultAbiCoder();
const toSlot = (s) => ethers.toBeHex(BigInt(s), 32);
export function mappingSlot(keyType, key, slot) { return ethers.keccak256(coder().encode([keyType, "uint256"], [key, BigInt(slot)])); }
export function nestedMappingSlot(keys, slot) { let s = toSlot(slot); for (const [t, k] of keys) s = mappingSlot(t, k, s); return s; }
export function arrayElementSlot(slot, index, elemSlots = 1) { return ethers.toBeHex(BigInt(ethers.keccak256(toSlot(slot))) + BigInt(index) * BigInt(elemSlots), 32); }
export function erc7201Slot(id) { const h = BigInt(ethers.id(id)) - 1n; return ethers.toBeHex(BigInt(ethers.keccak256(coder().encode(["uint256"], [h]))) & ~0xffn, 32); }
export async function readSlot(chain, address, slot) { return await rpc(chain, "eth_getStorageAt", [address, ethers.toBeHex(BigInt(slot), 32), "latest"]); }

// ---------- Data API helpers ----------
const _cache = {};
export async function dataset(name) { return _cache[name] ||= (await fetch(`${API}/${name}.json`)).json(); }
export async function tokenList() { return _cache.tokens ||= (await fetch("https://tokens.uniswap.org")).json(); }
export { ethers };
