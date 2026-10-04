// Blockchain Lab Tools — second tool pack (Safe, EIP-712, bridges, approvals, Solana, PSBT, MEV, …).
// Built by Blockchain Lab — https://blockchainlab.com . Runs in browser (import map) and Node (tests).
import { ethers } from "ethers";
import { CHAINS, rpc, tfetch, decodeCalldata, resolveEns, reverseEns, mainnetProvider, selector, dataset, tokenList } from "./core.js";
import * as btc from "@scure/btc-signer";
import { base64, hex } from "@scure/base";

const coder = ethers.AbiCoder.defaultAbiCoder();
const call = (chain, to, data, block = "latest") => rpc(chain, "eth_call", [{ to, data }, block]);
const iface = (sigs) => new ethers.Interface(sigs);
async function getJSON(url, opts = {}, ms = 15000) { const r = await tfetch(url, opts, ms); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error(`HTTP ${r.status}: ${t.slice(0, 160)}`); } if (!r.ok) throw new Error(j.message || j.error || `HTTP ${r.status}`); return j; }
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export async function multicall(chain, calls) { // calls: [{target, data}] -> [{success, returnData}]
  const I = iface(["function aggregate3((address target,bool allowFailure,bytes callData)[] calls) payable returns ((bool success,bytes returnData)[])"]);
  const res = await call(chain, MULTICALL3, I.encodeFunctionData("aggregate3", [calls.map(c => [c.target, true, c.data])]));
  return I.decodeFunctionResult("aggregate3", res)[0].map(r => ({ success: r[0], returnData: r[1] }));
}

// ---------- Safe (Gnosis Safe) ----------
const SAFE = iface(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)", "function nonce() view returns (uint256)", "function VERSION() view returns (string)",
  "function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) payable returns (bool)",
  "function multiSend(bytes transactions) payable"]);
export const SAFE_TX_TYPES = { SafeTx: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "nonce", type: "uint256" }] };
export function safeTx(p) { const Z = ethers.ZeroAddress; return { to: ethers.getAddress(p.to), value: BigInt(p.value || 0), data: p.data || "0x", operation: Number(p.operation || 0), safeTxGas: BigInt(p.safeTxGas || 0), baseGas: BigInt(p.baseGas || 0), gasPrice: BigInt(p.gasPrice || 0), gasToken: p.gasToken || Z, refundReceiver: p.refundReceiver || Z, nonce: BigInt(p.nonce || 0) }; }
export function safeTxHash(chainId, safe, tx, version = "1.3.0") { // Safe >= 1.3.0 domain includes chainId; older versions only verifyingContract
  const domain = cmpVer(version, "1.3.0") >= 0 ? { chainId, verifyingContract: safe } : { verifyingContract: safe };
  return { safeTxHash: ethers.TypedDataEncoder.hash(domain, SAFE_TX_TYPES, tx), domainSeparator: ethers.TypedDataEncoder.hashDomain(domain), messageHash: ethers.TypedDataEncoder.from(SAFE_TX_TYPES).hash(tx) };
}
const cmpVer = (a, b) => { const x = a.split(/[.+-]/).map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };
export async function safeInfo(chain, safe) {
  const [o, t, n, v] = await Promise.all(["getOwners", "getThreshold", "nonce", "VERSION"].map(f => call(chain, safe, SAFE.encodeFunctionData(f, [])).then(r => SAFE.decodeFunctionResult(f, r)[0])));
  return { chain, safe: ethers.getAddress(safe), owners: [...o], threshold: Number(t), nonce: Number(n), version: v };
}
export async function safeTxHashOnchain(chain, safe, tx) { const r = await call(chain, safe, SAFE.encodeFunctionData("getTransactionHash", [tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas, tx.gasPrice, tx.gasToken, tx.refundReceiver, tx.nonce])); return SAFE.decodeFunctionResult("getTransactionHash", r)[0]; }
export function encodeMultiSend(txs) { // MultiSend packed format: uint8 op | address to | uint256 value | uint256 len | bytes data
  const packed = ethers.concat(txs.map(t => ethers.solidityPacked(["uint8", "address", "uint256", "uint256", "bytes"], [t.operation || 0, t.to, BigInt(t.value || 0), ethers.dataLength(t.data || "0x"), t.data || "0x"])));
  return SAFE.encodeFunctionData("multiSend", [packed]);
}
export function decodeMultiSend(calldata) {
  const b = ethers.getBytes(SAFE.decodeFunctionData("multiSend", calldata)[0]); const out = []; let i = 0;
  while (i < b.length) { const op = b[i]; const to = ethers.getAddress(ethers.hexlify(b.slice(i + 1, i + 21))); const value = BigInt(ethers.hexlify(b.slice(i + 21, i + 53))); const len = Number(BigInt(ethers.hexlify(b.slice(i + 53, i + 85)))); const data = ethers.hexlify(b.slice(i + 85, i + 85 + len)); out.push({ operation: op, to, value, data }); i += 85 + len; }
  return out;
}
export async function decodeSafeCalldata(data) { // execTransaction / multiSend / anything else
  const sel = data.slice(0, 10).toLowerCase();
  if (sel === SAFE.getFunction("execTransaction").selector) { const d = SAFE.decodeFunctionData("execTransaction", data); const inner = { to: d[0], value: d[1], data: d[2], operation: Number(d[3]) }; return { kind: "execTransaction", tx: { ...inner, safeTxGas: d[4], baseGas: d[5], gasPrice: d[6], gasToken: d[7], refundReceiver: d[8] }, signatures: splitSafeSigs(d[9]), inner: await decodeSafeCalldata(d[2]) }; }
  if (sel === SAFE.getFunction("multiSend").selector) { const txs = decodeMultiSend(data); return { kind: "multiSend", txs: await Promise.all(txs.map(async t => ({ ...t, decoded: t.data !== "0x" ? await decodeCalldata(t.data) : null }))) }; }
  return { kind: "call", decoded: await decodeCalldata(data) };
}
function splitSafeSigs(sigs) { const b = ethers.getBytes(sigs); const out = []; for (let i = 0; i + 65 <= b.length; i += 65) { const v = b[i + 64]; out.push({ r: ethers.hexlify(b.slice(i, i + 32)), s: ethers.hexlify(b.slice(i + 32, i + 64)), v, type: v === 0 ? "contract (EIP-1271)" : v === 1 ? "approved hash" : v > 30 ? "eth_sign" : "EOA (EIP-712)" }); } return out; }

// ---------- EIP-712 / EIP-191 / ERC-1271 ----------
export function typedDataHash(td) { const types = { ...td.types }; delete types.EIP712Domain; return { digest: ethers.TypedDataEncoder.hash(td.domain, types, td.message), domainSeparator: ethers.TypedDataEncoder.hashDomain(td.domain), structHash: ethers.TypedDataEncoder.from(types).hash(td.message), primaryType: ethers.TypedDataEncoder.getPrimaryType(types) }; }
export async function signTypedData(privateKey, td) { const types = { ...td.types }; delete types.EIP712Domain; const w = new ethers.Wallet(privateKey); return { signer: w.address, signature: await w.signTypedData(td.domain, types, td.message) }; }
export function recoverTypedData(td, signature) { const types = { ...td.types }; delete types.EIP712Domain; return ethers.verifyTypedData(td.domain, types, td.message, signature); }
export const recoverPersonal = (message, signature) => ethers.verifyMessage(message, signature);
export async function erc1271(chain, contract, digest, signature) { const I = iface(["function isValidSignature(bytes32,bytes) view returns (bytes4)"]); try { const r = await call(chain, contract, I.encodeFunctionData("isValidSignature", [digest, signature])); const m = I.decodeFunctionResult("isValidSignature", r)[0]; return { magic: m, valid: m === "0x1626ba7e" }; } catch (e) { return { valid: false, error: e.message }; } }
export const EIP712_MAIL_EXAMPLE = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], Person: [{ name: "name", type: "string" }, { name: "wallet", type: "address" }], Mail: [{ name: "from", type: "Person" }, { name: "to", type: "Person" }, { name: "contents", type: "string" }] }, primaryType: "Mail", domain: { name: "Ether Mail", version: "1", chainId: 1, verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" }, message: { from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" }, to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" }, contents: "Hello, Bob!" } };

// ---------- Calldata diff ----------
export async function calldataDiff(a, b, sigHint) {
  const [da, db] = await Promise.all([decodeCalldata(a, sigHint), decodeCalldata(b, sigHint)]);
  const flat = (v, p = "") => Array.isArray(v) ? v.flatMap((x, i) => flat(x, `${p}[${i}]`)) : [[p, String(v)]];
  const fa = Object.fromEntries((da.args || []).flatMap(x => flat(x.value, x.name))), fb = Object.fromEntries((db.args || []).flatMap(x => flat(x.value, x.name)));
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
  const rows = keys.map(k => ({ field: k, a: fa[k], b: fb[k], same: fa[k] === fb[k] }));
  // raw 32-byte word diff as a fallback / complement
  const words = (h) => { h = h.trim().replace(/^0x/, ""); const s = h.slice(0, 8); const w = []; for (let i = 8; i < h.length; i += 64) w.push(h.slice(i, i + 64)); return [s, ...w]; };
  const wa = words(a), wb = words(b); const wordDiff = Array.from({ length: Math.max(wa.length, wb.length) }, (_, i) => ({ word: i === 0 ? "selector" : i - 1, a: wa[i], b: wb[i], same: wa[i] === wb[i] }));
  return { a: da, b: db, sameFunction: da.selector === db.selector, rows, changed: rows.filter(r => !r.same).length, wordDiff };
}

// ---------- Contract verification lookup ----------
export const BLOCKSCOUT = { ethereum: "https://eth.blockscout.com", base: "https://base.blockscout.com", arbitrum: "https://arbitrum.blockscout.com", optimism: "https://optimism.blockscout.com", polygon: "https://polygon.blockscout.com" };
export async function verification(chain, address) {
  const id = CHAINS[chain].id; const out = { chain, address, sourcify: null, blockscout: null };
  const [s, b] = await Promise.allSettled([
    getJSON(`https://sourcify.dev/server/v2/contract/${id}/${address}?fields=compilation`),
    BLOCKSCOUT[chain] ? getJSON(`${BLOCKSCOUT[chain]}/api/v2/smart-contracts/${address}`) : Promise.reject(new Error("no Blockscout instance for this chain")),
  ]);
  out.sourcify = s.status === "fulfilled" ? { match: s.value.match, creationMatch: s.value.creationMatch, runtimeMatch: s.value.runtimeMatch, verifiedAt: s.value.verifiedAt, compiler: s.value.compilation?.compilerVersion, name: s.value.compilation?.name, url: `https://repo.sourcify.dev/${id}/${address}` } : { match: null, note: /not found|404/i.test(s.reason?.message) ? "not verified on Sourcify" : s.reason?.message };
  out.blockscout = b.status === "fulfilled" ? { verified: !!(b.value.is_verified ?? b.value.is_fully_verified ?? b.value.source_code), name: b.value.name, compiler: b.value.compiler_version, optimization: b.value.optimization_enabled, license: b.value.license_type, proxyType: b.value.proxy_type, implementations: b.value.implementations, url: `${BLOCKSCOUT[chain]}/address/${address}?tab=contract` } : { verified: null, note: b.reason?.message };
  out.verified = !!(out.sourcify?.match || out.blockscout?.verified);
  out.explorer = `${CHAINS[chain].explorer}/address/${address}#code`;
  return out;
}

// ---------- Gas history ----------
export async function gasHistory(chain, blocks = 1024) {
  const n = Math.min(1024, blocks); const h = await rpc(chain, "eth_feeHistory", ["0x" + n.toString(16), "latest", [10, 50, 90]]);
  const oldest = Number(h.oldestBlock);
  const pts = h.baseFeePerGas.slice(0, -1).map((b, i) => ({ block: oldest + i, baseFeeGwei: Number(BigInt(b)) / 1e9, tipP50Gwei: h.reward ? Number(BigInt(h.reward[i][1])) / 1e9 : null, gasUsedRatio: h.gasUsedRatio[i] }));
  const s = pts.map(p => p.baseFeeGwei).sort((a, b) => a - b); const q = (x) => s[Math.min(s.length - 1, Math.floor(s.length * x))];
  return { chain, from: oldest, to: oldest + pts.length - 1, points: pts, stats: { min: s[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: s[s.length - 1], nextBaseFeeGwei: Number(BigInt(h.baseFeePerGas.at(-1))) / 1e9 } };
}
export function sparkSVG(values, w = 900, h = 180, color = "#5eead4") { const v = values.filter(x => x !== null && isFinite(x)); if (!v.length) return ""; const mx = Math.max(...v), mn = Math.min(...v); const sx = w / Math.max(1, values.length - 1); const y = (x) => h - 4 - ((x - mn) / ((mx - mn) || 1)) * (h - 8); return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${values.map((x, i) => `${(i * sx).toFixed(1)},${y(x ?? mn).toFixed(1)}`).join(" ")}"/></svg>`; }

// ---------- Bridge fee compare ----------
export const USDC = { ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
export const WETH = { ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", base: "0x4200000000000000000000000000000000000006", arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", optimism: "0x4200000000000000000000000000000000000006", polygon: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619" };
export async function bridgeQuotes({ from, to, asset = "USDC", amount, user = "0x000000000000000000000000000000000000dEaD" }) {
  const dec = asset === "USDC" ? 6 : 18; const amt = ethers.parseUnits(String(amount), dec).toString();
  const tokIn = asset === "USDC" ? USDC[from] : WETH[from], tokOut = asset === "USDC" ? USDC[to] : WETH[to];
  const nIn = asset === "USDC" ? tokIn : ethers.ZeroAddress, nOut = asset === "USDC" ? tokOut : ethers.ZeroAddress;
  const fi = CHAINS[from].id, ti = CHAINS[to].id; const fmt = (x) => Number(ethers.formatUnits(BigInt(x), dec));
  const q = [
    ["Across", async () => { const j = await getJSON(`https://app.across.to/api/suggested-fees?inputToken=${tokIn}&outputToken=${tokOut}&originChainId=${fi}&destinationChainId=${ti}&amount=${amt}`); if (j.isAmountTooLow) throw new Error("amount too low"); const out = BigInt(amt) - BigInt(j.totalRelayFee?.total ?? j.relayFeeTotal); return { out: fmt(out), etaSec: j.estimatedFillTimeSec, note: "relayer fee incl. gas; origin gas not included" }; }],
    ["LI.FI (best route)", async () => { const j = await getJSON(`https://li.quest/v1/quote?fromChain=${fi}&toChain=${ti}&fromToken=${nIn}&toToken=${nOut}&fromAmount=${amt}&fromAddress=${user}`); const gas = (j.estimate.gasCosts || []).reduce((s, g) => s + Number(g.amountUSD || 0), 0); return { out: fmt(j.estimate.toAmount), etaSec: j.estimate.executionDuration, via: j.toolDetails?.name, gasUSD: gas, note: `route via ${j.toolDetails?.name}` }; }],
    ["Relay", async () => { const j = await getJSON("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, originChainId: fi, destinationChainId: ti, originCurrency: nIn, destinationCurrency: nOut, amount: amt, tradeType: "EXACT_INPUT" }) }); return { out: fmt(j.details.currencyOut.amount), etaSec: j.details.timeEstimate, gasUSD: Number(j.fees?.gas?.amountUsd || 0), note: "relayer + gas fees deducted" }; }],
  ];
  const res = await Promise.allSettled(q.map(([, f]) => f()));
  return { from, to, asset, amount: Number(amount), quotes: res.map((r, i) => r.status === "fulfilled" ? { provider: q[i][0], ok: true, ...r.value, cost: Number(amount) - r.value.out } : { provider: q[i][0], ok: false, error: r.reason?.message }) };
}

// ---------- Token approvals ----------
export const SPENDERS = {
  "0x000000000022D473030F116dDEE9F6B43aC78BA3": "Uniswap Permit2", "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af": "Uniswap Universal Router (v4)", "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD": "Uniswap Universal Router (v1.2)",
  "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45": "Uniswap SwapRouter02", "0xE592427A0AEce92De3Edee1F18E0157C05861564": "Uniswap V3 SwapRouter", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D": "Uniswap V2 Router",
  "0x111111125421cA6dc452d289314280a0f8842A65": "1inch Router v6", "0x1111111254EEB25477B68fb85Ed929f73A960582": "1inch Router v5", "0xDef1C0ded9bec7F1a1670819833240f027b25EfF": "0x Exchange Proxy",
  "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110": "CoW Protocol Vault Relayer", "0xBA12222222228d8Ba445958a75a0704d566BF2C8": "Balancer V2 Vault", "0x1E0049783F008A0085193E00003D00cd54003c71": "OpenSea Seaport conduit",
  "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2": "Aave V3 Pool (Ethereum)", "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5": "KyberSwap Meta Aggregator", "0x6A000F20005980200259B80c5102003040001068": "ParaSwap Augustus v6",
};
const ERC20 = iface(["function allowance(address,address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)", "function approve(address,uint256) returns (bool)"]);
export async function approvals(chain, owner, tokens) {
  owner = ethers.getAddress(owner);
  if (!tokens?.length) { const tl = await tokenList(); tokens = tl.tokens.filter(t => t.chainId === CHAINS[chain].id).slice(0, 40).map(t => ({ address: t.address, symbol: t.symbol, decimals: t.decimals })); }
  const spenders = Object.keys(SPENDERS); const calls = []; for (const t of tokens) for (const s of spenders) calls.push({ target: t.address, data: ERC20.encodeFunctionData("allowance", [owner, s]), t, s });
  const out = []; for (let i = 0; i < calls.length; i += 300) { const chunk = calls.slice(i, i + 300); const r = await multicall(chain, chunk); r.forEach((x, j) => { if (x.success && x.returnData.length >= 66) { const v = BigInt(x.returnData.slice(0, 66)); if (v > 0n) out.push({ token: chunk[j].t, spender: chunk[j].s, spenderName: SPENDERS[chunk[j].s], allowance: v, unlimited: v >= (1n << 128n), revokeCalldata: ERC20.encodeFunctionData("approve", [chunk[j].s, 0n]) }); } }); }
  return { chain, owner, checkedTokens: tokens.length, checkedSpenders: spenders.length, approvals: out, revokeCash: `https://revoke.cash/address/${owner}?chainId=${CHAINS[chain].id}` };
}
export async function allowanceOf(chain, token, owner, spender) { return BigInt(await call(chain, token, ERC20.encodeFunctionData("allowance", [owner, spender]))); }

// ---------- ENS bulk ----------
export async function ensBulk(names, { texts = ["avatar", "url", "com.twitter", "com.github"] } = {}) {
  const p = mainnetProvider();
  return Promise.all(names.map(async (q) => { q = q.trim(); try {
    if (/^0x[0-9a-fA-F]{40}$/.test(q)) { const n = await reverseEns(q); return { input: q, address: ethers.getAddress(q), name: n, verified: n ? (await resolveEns(n))?.toLowerCase() === q.toLowerCase() : null }; }
    const r = await p.getResolver(q); if (!r) return { input: q, error: "no resolver (name not registered or not set)" };
    const addr = await r.getAddress(); const rec = {}; for (const k of texts) { try { const v = await r.getText(k); if (v) rec[k] = v; } catch {} }
    const rev = addr ? await reverseEns(addr).catch(() => null) : null;
    return { input: q, address: addr, resolver: r.address, primaryName: rev, isPrimary: rev?.toLowerCase() === q.toLowerCase(), texts: rec };
  } catch (e) { return { input: q, error: e.shortMessage || e.message }; } }));
}

// ---------- Solana tx decoder ----------
export const SOL_RPC = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
export async function solRpc(method, params) { let last; for (const u of SOL_RPC) { try { const j = await getJSON(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); if (j.error) throw new Error(j.error.message); return j.result; } catch (e) { last = e; } } throw last; }
export const SOL_PROGRAMS = { "11111111111111111111111111111111": "System Program", TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "SPL Token", TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022", ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token Account", ComputeBudget111111111111111111111111111111: "Compute Budget", JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter Aggregator v6", whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca Whirlpools", "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium AMM v4", CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM", LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM", MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": "Pump.fun", Vote111111111111111111111111111111111111111: "Vote", Stake11111111111111111111111111111111111111: "Stake", metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: "Metaplex Token Metadata" };
export async function decodeSolTx(sig) {
  let t; try { t = await solRpc("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 1, commitment: "confirmed" }]); } catch (e) { t = await solRpc("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]); } if (!t) throw new Error("Transaction not found (it may be too old for this public RPC)");
  const keys = t.transaction.message.accountKeys.map(k => k.pubkey ?? k);
  const name = (p) => SOL_PROGRAMS[p] || p;
  const ix = (i) => ({ program: name(i.programId), programId: i.programId, type: i.parsed?.type || null, info: i.parsed?.info || null, accounts: i.accounts?.length, dataLen: i.data ? i.data.length : undefined });
  const inner = (t.meta.innerInstructions || []).flatMap(g => g.instructions.map(i => ({ index: g.index, ...ix(i) })));
  const solChanges = keys.map((k, i) => ({ account: k, deltaSOL: (t.meta.postBalances[i] - t.meta.preBalances[i]) / 1e9 })).filter(x => x.deltaSOL !== 0);
  const tok = {}; for (const b of t.meta.preTokenBalances || []) tok[b.accountIndex] = { mint: b.mint, owner: b.owner, pre: Number(b.uiTokenAmount.uiAmountString), post: 0 };
  for (const b of t.meta.postTokenBalances || []) tok[b.accountIndex] = { ...(tok[b.accountIndex] || { mint: b.mint, owner: b.owner, pre: 0 }), post: Number(b.uiTokenAmount.uiAmountString) };
  return { signature: sig, slot: t.slot, blockTime: t.blockTime ? new Date(t.blockTime * 1000).toISOString() : null, status: t.meta.err ? "failed" : "success", error: t.meta.err, feeSOL: t.meta.fee / 1e9, computeUnits: t.meta.computeUnitsConsumed, version: t.version, signers: t.transaction.message.accountKeys.filter(k => k.signer).map(k => k.pubkey), instructions: t.transaction.message.instructions.map(ix), innerInstructions: inner, solChanges, tokenChanges: Object.values(tok).map(x => ({ ...x, delta: x.post - x.pre })).filter(x => x.delta !== 0), logs: t.meta.logMessages?.slice(0, 60) };
}

// ---------- Bitcoin PSBT / raw tx decoder ----------
export function decodePSBT(input) {
  input = input.trim(); const bytes = /^[0-9a-fA-F]+$/.test(input) ? hex.decode(input) : base64.decode(input);
  const isPsbt = bytes[0] === 0x70 && bytes[1] === 0x73 && bytes[2] === 0x62 && bytes[3] === 0x74 && bytes[4] === 0xff;
  const tx = isPsbt ? btc.Transaction.fromPSBT(bytes, { allowUnknownOutputs: true, allowUnknownInputs: true, allowLegacyWitnessUtxo: true, disableScriptCheck: true }) : btc.Transaction.fromRaw(bytes, { allowUnknownOutputs: true, allowUnknownInputs: true, disableScriptCheck: true });
  const addr = (script) => { try { return btc.Address(btc.NETWORK).encode(btc.OutScript.decode(script)); } catch { try { return btc.Address(btc.TEST_NETWORK).encode(btc.OutScript.decode(script)) + " (testnet)"; } catch { return null; } } };
  const type = (script) => { try { return btc.OutScript.decode(script).type; } catch { return "unknown"; } };
  const inputs = []; let inSum = 0n, inKnown = true;
  for (let i = 0; i < tx.inputsLength; i++) { const x = tx.getInput(i); let value = null, script = null;
    if (x.witnessUtxo) { value = x.witnessUtxo.amount; script = x.witnessUtxo.script; } else if (x.nonWitnessUtxo) { const o = x.nonWitnessUtxo.outputs[x.index]; value = o.amount; script = o.script; }
    if (value === null) inKnown = false; else inSum += value;
    inputs.push({ txid: x.txid ? hex.encode(x.txid) : null, vout: x.index, sequence: x.sequence, value, address: script ? addr(script) : null, type: script ? type(script) : null, partialSigs: x.partialSig?.length || 0, finalized: !!(x.finalScriptSig || x.finalScriptWitness), bip32: (x.bip32Derivation || []).map(([pk, d]) => ({ pubkey: hex.encode(pk), fingerprint: d.fingerprint.toString(16).padStart(8, "0"), path: btc.bip32Path ? "m/" + d.path.map(n => n >= 0x80000000 ? (n - 0x80000000) + "'" : n).join("/") : null })) }); }
  const outputs = []; let outSum = 0n; for (let i = 0; i < tx.outputsLength; i++) { const o = tx.getOutput(i); outSum += o.amount; outputs.push({ value: o.amount, address: addr(o.script), type: type(o.script), script: hex.encode(o.script) }); }
  const fee = inKnown ? inSum - outSum : null; let vsize = null; try { vsize = tx.vsize; } catch {}
  return { kind: isPsbt ? "PSBT" : "raw transaction", version: tx.version, locktime: tx.lockTime, inputs, outputs, inputTotal: inKnown ? inSum : null, outputTotal: outSum, feeSats: fee, vsize, feeRate: fee !== null && vsize ? Number(fee) / vsize : null, isFinal: tx.isFinal, txid: (() => { try { return tx.id; } catch { return null; } })() };
}

// ---------- Address labels ----------
export async function addressLabels(chain, address) {
  address = ethers.getAddress(address); const out = { chain, address, labels: [] };
  const [bs, ens, sanc, tl] = await Promise.allSettled([BLOCKSCOUT[chain] ? getJSON(`${BLOCKSCOUT[chain]}/api/v2/addresses/${address}`) : Promise.reject(new Error("no Blockscout")), chain === "ethereum" || true ? reverseEns(address) : null, dataset("sanctioned-addresses"), tokenList()]);
  if (bs.status === "fulfilled") { const b = bs.value; out.isContract = b.is_contract; if (b.name) out.labels.push({ source: "Blockscout contract name", label: b.name }); for (const t of [...(b.public_tags || []), ...(b.metadata?.tags || [])]) out.labels.push({ source: "Blockscout public tag", label: t.display_name || t.name || t.label }); if (b.token) out.labels.push({ source: "Blockscout token", label: `${b.token.name} (${b.token.symbol}) ${b.token.type}` }); if (b.implementations?.length) out.implementations = b.implementations; if (b.creator_address_hash) out.creator = b.creator_address_hash; }
  if (ens.status === "fulfilled" && ens.value) out.labels.push({ source: "ENS primary name", label: ens.value });
  if (tl.status === "fulfilled") { const t = tl.value.tokens.find(t => t.address.toLowerCase() === address.toLowerCase()); if (t) out.labels.push({ source: "Uniswap token list", label: `${t.name} (${t.symbol}) on chainId ${t.chainId}` }); }
  if (SPENDERS[address]) out.labels.push({ source: "Blockchain Lab known spenders", label: SPENDERS[address] });
  if (sanc.status === "fulfilled") { const hit = sanc.value.data.find(x => x.address.toLowerCase() === address.toLowerCase()); out.sanctioned = !!hit; if (hit) out.labels.push({ source: "OFAC SDN list (via 0xB10C)", label: `SANCTIONED ${hit.chain}` }); }
  return out;
}

// ---------- Vanity address estimator ----------
export function vanityDifficulty(pattern, { caseSensitive = false, position = "prefix" } = {}) {
  const p = pattern.replace(/^0x/, ""); if (!/^[0-9a-fA-F]*$/.test(p)) throw new Error("Pattern must be hex characters");
  const letters = (p.match(/[a-fA-F]/g) || []).length; let d = 16 ** p.length; if (caseSensitive) d *= 2 ** letters; if (position === "anywhere") d = d / Math.max(1, 40 - p.length + 1);
  return { pattern: p, difficulty: d, attempts50: Math.log(2) * d, attempts90: Math.log(10) * d };
}
export function vanityBenchmark(ms = 1000) { const t0 = Date.now(); let n = 0; while (Date.now() - t0 < ms) { ethers.computeAddress(ethers.hexlify(ethers.randomBytes(32))); n++; } return n / ((Date.now() - t0) / 1000); }
export const create2Address = (deployer, salt, initCode) => ethers.getCreate2Address(deployer, ethers.zeroPadValue(ethers.toBeHex(BigInt(salt)), 32), ethers.keccak256(initCode));

// ---------- Uniswap price impact ----------
export const UNIV3 = { ethereum: { factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" }, arbitrum: { factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" }, optimism: { factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" }, polygon: { factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" }, base: { factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a" } };
const V3 = iface(["function getPool(address,address,uint24) view returns (address)", "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)", "function liquidity() view returns (uint128)", "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"]);
export async function priceImpact(chain, tokenIn, tokenOut, amountIn, fee = 500) {
  const c = UNIV3[chain]; if (!c) throw new Error("Uniswap v3 not configured for " + chain);
  tokenIn = ethers.getAddress(tokenIn); tokenOut = ethers.getAddress(tokenOut);
  const [mi, mo] = await Promise.all([tokenIn, tokenOut].map(t => Promise.all([call(chain, t, ERC20.encodeFunctionData("decimals", [])), call(chain, t, ERC20.encodeFunctionData("symbol", []))]).then(([d, s]) => ({ dec: Number(BigInt(d)), sym: ERC20.decodeFunctionResult("symbol", s)[0] }))));
  const pool = V3.decodeFunctionResult("getPool", await call(chain, c.factory, V3.encodeFunctionData("getPool", [tokenIn, tokenOut, fee])))[0]; if (pool === ethers.ZeroAddress) throw new Error(`No ${fee / 1e4}% pool for this pair`);
  const s0 = V3.decodeFunctionResult("slot0", await call(chain, pool, V3.encodeFunctionData("slot0", [])));
  const amt = ethers.parseUnits(String(amountIn), mi.dec);
  const q = V3.decodeFunctionResult("quoteExactInputSingle", await call(chain, c.quoter, V3.encodeFunctionData("quoteExactInputSingle", [[tokenIn, tokenOut, amt, fee, 0]])));
  const sp = Number(s0[0]) / 2 ** 96; let p01 = sp * sp; // token1 per token0 in raw units
  const zeroForOne = tokenIn.toLowerCase() < tokenOut.toLowerCase();
  const midRaw = zeroForOne ? p01 : 1 / p01; const mid = midRaw * 10 ** (mi.dec - mo.dec);
  const out = Number(ethers.formatUnits(q[0], mo.dec)); const exec = out / Number(amountIn);
  const spa = Number(q[1]) / 2 ** 96; const afterRaw = zeroForOne ? spa * spa : 1 / (spa * spa); const after = afterRaw * 10 ** (mi.dec - mo.dec);
  return { chain, pool, fee, tokenIn: mi.sym, tokenOut: mo.sym, amountIn: Number(amountIn), amountOut: out, midPrice: mid, execPrice: exec, priceImpactPct: (1 - exec / (mid * (1 - fee / 1e6))) * 100, totalCostVsMidPct: (1 - exec / mid) * 100, priceAfter: after, ticksCrossed: Number(q[2]), gasEstimate: Number(q[3]) };
}

// ---------- MEV sandwich checker ----------
const T_V2 = ethers.id("Swap(address,uint256,uint256,uint256,uint256,address)"), T_V3 = ethers.id("Swap(address,address,int256,int256,uint160,uint128,int24)");
function swapsOf(rc) { return rc.logs.filter(l => l.topics[0] === T_V2 || l.topics[0] === T_V3).map(l => { if (l.topics[0] === T_V2) { const [a0i, a1i] = coder.decode(["uint256", "uint256", "uint256", "uint256"], l.data); return { pool: l.address.toLowerCase(), dir: a0i > 0n ? "0to1" : "1to0", v: 2 }; } const [a0] = coder.decode(["int256", "int256", "uint160", "uint128", "int24"], l.data); return { pool: l.address.toLowerCase(), dir: a0 > 0n ? "0to1" : "1to0", v: 3 }; }); }
export async function sandwichCheck(chain, hash) {
  const tx = await rpc(chain, "eth_getTransactionByHash", [hash]); if (!tx?.blockNumber) throw new Error("Transaction not found or pending");
  const rcs = await rpc(chain, "eth_getBlockReceipts", [tx.blockNumber]); const idx = Number(tx.transactionIndex);
  const byIdx = rcs.map(r => ({ i: Number(r.transactionIndex), hash: r.transactionHash, from: r.from.toLowerCase(), to: (r.to || "").toLowerCase(), swaps: swapsOf(r) }));
  const victim = byIdx.find(x => x.i === idx); const found = [];
  for (const vs of victim.swaps) {
    const before = byIdx.filter(x => x.i < idx && x.swaps.some(s => s.pool === vs.pool && s.dir === vs.dir));
    const after = byIdx.filter(x => x.i > idx && x.swaps.some(s => s.pool === vs.pool && s.dir !== vs.dir));
    for (const f of before) for (const b of after) if (f.hash !== b.hash && idx - f.i <= 8 && b.i - idx <= 8 && ((f.from === b.from) || (f.to && f.to === b.to && f.to !== victim.to)) && f.from !== victim.from) found.push({ pool: vs.pool, front: { hash: f.hash, index: f.i, from: f.from, to: f.to }, back: { hash: b.hash, index: b.i, from: b.from, to: b.to } });
  }
  const best = found.sort((a, b) => (b.front.index - a.front.index) || (a.back.index - b.back.index))[0];
  return { chain, hash, block: Number(tx.blockNumber), index: idx, blockTxs: rcs.length, swapsInTx: victim.swaps.length, sandwiched: !!best, evidence: best || null, candidates: found.length, method: "Heuristic: a tx before the victim swaps the same pool in the same direction and a tx after swaps it back, both from the same EOA or bot contract, within 8 positions of the victim. Heuristic, not proof." };
}
export async function findSandwiches(chain, blockNumber) { // scan a block for A-V-A patterns (used by tests and the 'scan latest block' button)
  const rcs = await rpc(chain, "eth_getBlockReceipts", ["0x" + blockNumber.toString(16)]); const txs = rcs.map(r => ({ i: Number(r.transactionIndex), hash: r.transactionHash, from: r.from.toLowerCase(), to: (r.to || "").toLowerCase(), swaps: swapsOf(r) })).filter(x => x.swaps.length);
  const res = []; for (const v of txs) for (const vs of v.swaps) { const f = txs.find(x => x.i < v.i && v.i - x.i <= 8 && x.from !== v.from && x.swaps.some(s => s.pool === vs.pool && s.dir === vs.dir) && txs.some(y => y.i > v.i && y.i - v.i <= 8 && (y.from === x.from || (x.to && y.to === x.to && x.to !== v.to)) && y.swaps.some(s => s.pool === vs.pool && s.dir !== vs.dir))); if (f) res.push({ victim: v.hash, front: f.hash, pool: vs.pool }); }
  return res;
}

// ---------- Stablecoins (DefiLlama) ----------
export async function stablecoins() { const j = await getJSON("https://stablecoins.llama.fi/stablecoins?includePrices=true"); return j.peggedAssets.map(a => { const peg = Object.keys(a.circulating || {})[0]; const circ = a.circulating?.[peg] || 0, wk = a.circulatingPrevWeek?.[peg] || 0; return { name: a.name, symbol: a.symbol, pegType: a.pegType, mechanism: a.pegMechanism, price: a.price ?? null, circulating: circ, change7dPct: wk ? (circ / wk - 1) * 100 : null, chains: (a.chains || []).length }; }).sort((a, b) => b.circulating - a.circulating); }

// ---------- RPC health ----------
export const PUBLIC_RPCS = { ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://rpc.ankr.com/eth", "https://1rpc.io/eth", "https://eth.drpc.org", "https://cloudflare-eth.com"], base: ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.llamarpc.com", "https://1rpc.io/base", "https://base.drpc.org"], arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc", "https://1rpc.io/arb", "https://arbitrum.drpc.org"], optimism: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io", "https://1rpc.io/op", "https://optimism.drpc.org"], polygon: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com", "https://1rpc.io/matic", "https://polygon.drpc.org"], bsc: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org", "https://1rpc.io/bnb", "https://bsc.drpc.org"], avalanche: ["https://avalanche-c-chain-rpc.publicnode.com", "https://api.avax.network/ext/bc/C/rpc", "https://1rpc.io/avax/c", "https://avalanche.drpc.org"] };
export async function rpcHealth(chain, urls = PUBLIC_RPCS[chain]) {
  const res = await Promise.all(urls.map(async (u) => { const t0 = Date.now(); try { const r = await tfetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }, { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }]) }, 8000); const j = await r.json(); const arr = Array.isArray(j) ? j : [j]; const cid = arr.find(x => x.id === 1)?.result, bn = arr.find(x => x.id === 2)?.result; if (!bn) { const r2 = await tfetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] }) }, 8000); const j2 = await r2.json(); if (!j2.result) throw new Error(j2.error?.message || "no result"); return { url: u, ok: true, latencyMs: Date.now() - t0, block: Number(j2.result), chainIdOk: null, batch: false }; } return { url: u, ok: true, latencyMs: Date.now() - t0, block: Number(bn), chainIdOk: cid ? Number(cid) === CHAINS[chain].id : null, batch: true }; } catch (e) { return { url: u, ok: false, latencyMs: Date.now() - t0, error: String(e.message || e).slice(0, 120) }; } }));
  const head = Math.max(...res.filter(r => r.ok).map(r => r.block), 0); res.forEach(r => { if (r.ok) { r.lag = head - r.block; r.healthy = r.lag <= 5 && r.chainIdOk !== false; } else r.healthy = false; });
  return { chain, head, endpoints: res.sort((a, b) => (b.healthy - a.healthy) || (a.latencyMs - b.latencyMs)) };
}
export { ethers, btc };
