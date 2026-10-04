// Live integration tests for tool pack 2 (real network calls, no mocks). Run: node test/core2.test.mjs
import assert from "node:assert/strict";
import * as C from "../assets/core.js";
import * as D from "../assets/core2.js";
const { ethers } = C;
const ok = (m) => console.log("  ✓ " + m);
const results = []; let failed = 0;
async function t(name, fn) { try { await fn(); results.push([name, "PASS"]); } catch (e) { failed++; results.push([name, "FAIL", e.message]); console.log("  ✗ " + name + ": " + e.message); } }

await t("safe", async () => {
  // discover real Safes created in the last ~300 blocks via the v1.3.0 proxy factory's ProxyCreation event
  const head = Number(await C.rpc("ethereum", "eth_blockNumber"));
  let logs = []; for (let back = 300; !logs.length && back <= 3000; back += 300) logs = await C.rpc("ethereum", "eth_getLogs", [{ fromBlock: "0x" + (head - back).toString(16), toBlock: "0x" + (head - back + 300).toString(16), address: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2" }]);
  assert.ok(logs.length, "no ProxyCreation logs found");
  const safe = ethers.getAddress("0x" + logs[0].data.slice(26, 66));
  const info = await D.safeInfo("ethereum", safe); assert.ok(info.owners.length >= 1 && info.threshold >= 1);
  const tx = D.safeTx({ to: "0x000000000000000000000000000000000000dEaD", value: 1n, data: "0x", nonce: info.nonce });
  const local = D.safeTxHash(1, safe, tx, info.version); const onchain = await D.safeTxHashOnchain("ethereum", safe, tx);
  assert.equal(local.safeTxHash, onchain); ok(`Safe ${safe} v${info.version} ${info.threshold}/${info.owners.length}: local safeTxHash == getTransactionHash() on-chain`);
  const ms = D.encodeMultiSend([{ to: C.CHAINS.ethereum.rpcs && "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", data: C.encodeCall("transfer(address,uint256)", ["0x000000000000000000000000000000000000dEaD", 5n]) }, { to: "0x000000000000000000000000000000000000dEaD", value: 7n }]);
  const dec = await D.decodeSafeCalldata(ms); assert.equal(dec.kind, "multiSend"); assert.equal(dec.txs.length, 2); assert.equal(dec.txs[0].decoded.signature, "transfer(address,uint256)"); assert.equal(dec.txs[1].value, 7n); ok("MultiSend encode/decode round-trip + inner call decoded");
});
await t("eip712", async () => {
  const h = D.typedDataHash(D.EIP712_MAIL_EXAMPLE); assert.equal(h.digest, "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2"); ok("EIP-712 spec Mail digest vector");
  const s = await D.signTypedData(ethers.id("cow"), D.EIP712_MAIL_EXAMPLE); assert.equal(s.signer, "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826");
  assert.equal(D.recoverTypedData(D.EIP712_MAIL_EXAMPLE, s.signature), s.signer); ok("sign with keccak('cow') -> spec signer, recover matches");
  const w = ethers.Wallet.createRandom(); const sig = await w.signMessage("hello"); assert.equal(D.recoverPersonal("hello", sig), w.address); ok("EIP-191 personal_sign recover");
  const r = await D.erc1271("ethereum", "0x000000000000000000000000000000000000dEaD", h.digest, s.signature); assert.equal(r.valid, false); ok("ERC-1271 call on non-contract returns invalid");
});
await t("calldiff", async () => {
  const a = C.encodeCall("transfer(address,uint256)", ["0x000000000000000000000000000000000000dEaD", 1000n]), b = C.encodeCall("transfer(address,uint256)", ["0x000000000000000000000000000000000000dEaD", 2000n]);
  const d = await D.calldataDiff(a, b); assert.ok(d.sameFunction); assert.equal(d.changed, 1); assert.equal(d.rows.find(r => !r.same).b, "2000"); ok("calldata diff finds exactly the amount change (signature via openchain/4byte)");
});
await t("verify", async () => {
  const v = await D.verification("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); assert.ok(v.blockscout.verified, JSON.stringify(v.blockscout)); ok(`USDC verified on Blockscout as ${v.blockscout.name}; Sourcify: ${v.sourcify.match || v.sourcify.note}`);
  const s = await D.verification("ethereum", "0x43506849D7C04F9138D1A2050bbF3A0c054402dd"); assert.ok(s.sourcify.match, JSON.stringify(s.sourcify)); ok("Sourcify full match found for 0x4350…02dd");
  const n = await D.verification("ethereum", "0x000000000000000000000000000000000000dEaD"); assert.equal(n.verified, false); ok("EOA reported unverified");
});
await t("gashistory", async () => { const g = await D.gasHistory("ethereum", 1024); assert.ok(g.points.length >= 500, "points " + g.points.length); assert.ok(g.stats.median > 0); assert.ok(D.sparkSVG(g.points.map(p => p.baseFeeGwei)).startsWith("<svg")); ok(`gas history ${g.points.length} blocks, median base fee ${g.stats.median.toFixed(3)} gwei`); });
await t("bridge", async () => { const q = await D.bridgeQuotes({ from: "ethereum", to: "base", asset: "USDC", amount: 1000 }); const good = q.quotes.filter(x => x.ok && x.out > 980 && x.out <= 1000.5); assert.ok(good.length >= 2, JSON.stringify(q.quotes)); ok("bridge quotes 1000 USDC eth->base: " + q.quotes.map(x => `${x.provider}=${x.ok ? x.out.toFixed(2) : "ERR " + x.error}`).join(", ")); });
await t("approvals", async () => {
  // a real owner: whoever most recently approved Permit2 for USDC in the latest blocks; multicall result must equal a direct allowance() call
  const head = Number(await C.rpc("ethereum", "eth_blockNumber")); const APPROVAL = ethers.id("Approval(address,address,uint256)");
  let logs = []; for (let back = 100; !logs.length && back <= 2000; back += 100) logs = await C.rpc("ethereum", "eth_getLogs", [{ fromBlock: "0x" + (head - back).toString(16), toBlock: "0x" + (head - back + 100).toString(16), address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", topics: [APPROVAL, null, ethers.zeroPadValue("0x000000000022D473030F116dDEE9F6B43aC78BA3", 32)] }]);
  assert.ok(logs.length, "no Permit2 approvals found"); let owner;
  for (const l of logs.reverse()) { const o = ethers.getAddress("0x" + l.topics[1].slice(26)); if (await D.allowanceOf("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", o, "0x000000000022D473030F116dDEE9F6B43aC78BA3") > 0n) { owner = o; break; } }
  owner ||= ethers.getAddress("0x" + logs[0].topics[1].slice(26));
  const r = await D.approvals("ethereum", owner, [{ address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 }]);
  const direct = await D.allowanceOf("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", owner, "0x000000000022D473030F116dDEE9F6B43aC78BA3");
  const viaMc = r.approvals.find(a => a.spender === "0x000000000022D473030F116dDEE9F6B43aC78BA3")?.allowance ?? 0n; assert.equal(viaMc, direct);
  assert.ok(r.revokeCash.includes(owner)); ok(`approvals: ${owner} USDC->Permit2 allowance ${direct} (multicall == direct), ${r.approvals.length} live approvals across ${r.checkedSpenders} spenders`);
});
await t("ensbulk", async () => { const r = await D.ensBulk(["vitalik.eth", "nick.eth", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"]); assert.equal(r[0].address, "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"); assert.ok(r[1].address); assert.equal(r[2].name, "vitalik.eth"); ok(`ENS bulk: vitalik.eth, nick.eth=${r[1].address}, reverse ok, texts=${Object.keys(r[0].texts).join("/")}`); });
await t("solana", async () => { const sigs = await D.solRpc("getSignaturesForAddress", ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", { limit: 5 }]); const s = sigs.find(x => !x.err) || sigs[0]; const d = await D.decodeSolTx(s.signature); assert.ok(d.feeSOL > 0 && d.instructions.length > 0); assert.ok([...d.instructions, ...d.innerInstructions].some(i => i.program === "Jupiter Aggregator v6")); ok(`Solana tx ${s.signature.slice(0, 16)}… ${d.status} fee ${d.feeSOL} SOL, ${d.instructions.length} ix, ${d.tokenChanges.length} token changes`); });
await t("psbt", async () => {
  const md = await (await fetch("https://raw.githubusercontent.com/bitcoin/bips/master/bip-0174.mediawiki")).text();
  const sec = md.slice(md.indexOf("The following are valid PSBTs")); const m = sec.match(/Base64 String: <(?:pre|tt)>(cHNidP8[^<]+)<\/(?:pre|tt)>/); assert.ok(m, "BIP-174 vector not found");
  const d = D.decodePSBT(m[1]); assert.equal(d.kind, "PSBT"); assert.ok(d.inputs.length >= 1 && d.outputs.length >= 1); ok(`BIP-174 official valid PSBT decoded: ${d.inputs.length} in / ${d.outputs.length} out, outputs ${d.outputs.map(o => o.address || o.type).join(", ")}`);
  // build + sign + finalize our own P2WPKH spend, then decode raw tx and check fee
  const priv = ethers.getBytes(ethers.id("blockchainlab-psbt-test")); const pub = D.btc.utils ? null : null; // keep btc-signer API surface minimal
  const { secp256k1 } = await import("@noble/curves/secp256k1.js").catch(() => import("@noble/curves/secp256k1"));
  const pk = secp256k1.getPublicKey(priv, true); const pay = D.btc.p2wpkh(pk); const tx = new D.btc.Transaction();
  tx.addInput({ txid: "a".repeat(64), index: 0, witnessUtxo: { script: pay.script, amount: 100000n } }); tx.addOutputAddress(pay.address, 99000n); const psbt = tx.toPSBT();
  const d2 = D.decodePSBT(Buffer.from(psbt).toString("base64")); assert.equal(d2.feeSats, 1000n); assert.equal(d2.outputs[0].address, pay.address);
  tx.sign(priv); tx.finalize(); const d3 = D.decodePSBT(tx.hex); assert.equal(d3.kind, "raw transaction"); assert.ok(d3.txid && d3.vsize > 100); ok(`self-built PSBT fee 1000 sats; signed raw tx ${d3.txid.slice(0, 12)}… vsize ${d3.vsize}`);
});
await t("labels", async () => { const l = await D.addressLabels("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); assert.ok(l.labels.some(x => /USD Coin|USDC/i.test(x.label)), JSON.stringify(l.labels)); assert.equal(l.sanctioned, false);
  const sanc = await C.dataset("sanctioned-addresses"); const eth = sanc.data.find(x => x.chain === "ETH"); const s = await D.addressLabels("ethereum", eth.address); assert.equal(s.sanctioned, true); ok(`labels: USDC -> ${l.labels.length} labels; ${eth.address} flagged by OFAC list (${sanc.count} addresses)`); });
await t("vanity", async () => { const d = D.vanityDifficulty("dead"); assert.equal(d.difficulty, 65536); assert.equal(D.vanityDifficulty("dEaD", { caseSensitive: true }).difficulty, 65536 * 16); const rate = D.vanityBenchmark(500); assert.ok(rate > 10); ok(`vanity: 'dead' = 65,536 attempts; benchmark ${Math.round(rate)} keys/s in Node`);
  assert.equal(D.create2Address("0x0000000000000000000000000000000000000000", 0, "0x00"), "0x4D1A2e2bB4F88F0250f26Ffff098B0b30B26BF38"); ok("CREATE2 matches EIP-1014 example 0"); });
await t("priceimpact", async () => { const a = await D.priceImpact("ethereum", D.WETH.ethereum, C.CHAINS && "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 1, 500); assert.ok(a.amountOut > 100 && a.priceImpactPct < 0.5, JSON.stringify(a)); const b = await D.priceImpact("ethereum", D.WETH.ethereum, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 5000, 500); assert.ok(b.priceImpactPct > a.priceImpactPct); ok(`Uniswap v3 WETH/USDC 0.05%: 1 WETH -> ${a.amountOut.toFixed(2)} USDC (impact ${a.priceImpactPct.toFixed(4)}%), 5000 WETH impact ${b.priceImpactPct.toFixed(2)}%`); });
await t("mev", async () => { const v = await D.sandwichCheck("ethereum", "0xe7f3514e534215762a686f2535721c1ec07f95a09548dc669bafb5bc03fce7f4"); assert.equal(v.sandwiched, true); assert.equal(v.evidence.front.from, "0xae2fc483527b8ef99eb5d9b44875f005ba1fae13"); const f = await D.sandwichCheck("ethereum", v.evidence.front.hash); assert.equal(f.sandwiched, false); ok(`sandwich detected in block ${v.block}: front idx ${v.evidence.front.index}, victim ${v.index}, back idx ${v.evidence.back.index} (jaredfromsubway EOA)`); });
await t("stablecoins", async () => { const s = await D.stablecoins(); const usdt = s.find(x => x.symbol === "USDT"); assert.ok(usdt.circulating > 1e10 && Math.abs(usdt.price - 1) < 0.05); ok(`stablecoins ${s.length}, USDT $${(usdt.circulating / 1e9).toFixed(1)}bn @ ${usdt.price}`); });
await t("rpchealth", async () => { for (const ch of ["ethereum", "base"]) { const h = await D.rpcHealth(ch); assert.ok(h.endpoints.filter(e => e.healthy).length >= 1, JSON.stringify(h)); ok(`rpc health ${ch}: ${h.endpoints.filter(e => e.healthy).length}/${h.endpoints.length} healthy, head ${h.head}`); } });
console.log(JSON.stringify(results)); console.log(failed ? `${failed} FAILED` : "ALL OK"); process.exit(failed ? 1 : 0);
