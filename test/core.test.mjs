// Live integration tests (real network calls). Run: npm test  (needs network)
import assert from "node:assert/strict";
import * as C from "../assets/core.js";
const ok = (m) => console.log("  ✓ " + m);

// units
const u = C.convertUnits("1.5", "ether"); assert.equal(u.wei, "1500000000000000000"); assert.equal(u.gwei, "1500000000"); ok("units eth");
assert.equal(C.convertUnits("1", "btc").sat, "100000000"); assert.equal(C.convertUnits("2500000000", "lamport").sol, "2.5"); ok("units btc/sol");
// abi
assert.equal(C.selector("transfer(address,uint256)"), "0xa9059cbb"); ok("selector");
assert.equal(C.topic("event Transfer(address indexed from,address indexed to,uint256 value)"), "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"); ok("event topic");
const data = C.encodeCall("transfer(address,uint256)", ["0x000000000000000000000000000000000000dEaD", 1000n]);
const dec = await C.decodeCalldata(data); assert.equal(dec.signature, "transfer(address,uint256)"); assert.equal(dec.args[1].value, "1000"); ok("encode + decode via signature DB: " + dec.signature);
// address
// EIP-55 test vectors from the EIP itself
for (const v of ["0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359", "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB", "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"]) { const r = C.checkAddress(v.toLowerCase()); assert.equal(r.checksum, v); assert.equal(C.checkAddress(v).inputChecksumValid, true); }
assert.equal(C.checkAddress("0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed").inputChecksumValid, false); ok("EIP-55 checksum vectors");
const ens = await C.resolveEns("vitalik.eth"); assert.ok(C.checkAddress(ens).valid); ok("ENS resolve vitalik.eth -> " + ens);
const rev = await C.reverseEns(ens); assert.equal(rev, "vitalik.eth"); ok("ENS reverse");
const _x=0;const usdcInfo = await C.addressInfo("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); assert.ok(usdcInfo.isContract && usdcInfo.zeppelinosImplementation); ok("address info USDC proxy impl (zeppelinos slot) " + usdcInfo.zeppelinosImplementation);
const meta = await C.erc20Meta("base", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); assert.equal(meta.symbol, "USDC"); assert.equal(meta.decimals, 6); ok("erc20 meta Base USDC supply " + meta.totalSupply);
// fees
for (const ch of Object.keys(C.CHAINS)) { const f = await C.evmFees(ch); assert.ok(f.gasPriceWei > 0n); ok(`fees ${ch}: gasPrice ${C.ethers.formatUnits(f.gasPriceWei, "gwei")} gwei base ${f.baseFeeWei !== undefined ? C.ethers.formatUnits(f.baseFeeWei, "gwei") : "n/a"}`); }
const b = await C.btcFees(); assert.ok(b.fastestFee >= 0); ok("btc fees " + JSON.stringify(b));
const s = await C.solFees(); assert.ok(s.samples > 0); ok("sol fees " + JSON.stringify(s.priorityMicroLamportsPerCU));
const p = await C.prices(["ethereum", "bitcoin"]); assert.ok(p.ethereum > 0); ok("prices " + JSON.stringify(p));
// tx decode: take a real recent tx from the latest block on each chain
for (const ch of ["ethereum", "base", "arbitrum", "polygon"]) {
  const head = Number(await C.rpc(ch, "eth_blockNumber"));
  let pick = null;
  for (let n = head - 10; n > head - 40 && !pick; n--) {
    const blk = await C.rpc(ch, "eth_getBlockByNumber", ["0x" + n.toString(16), true]);
    pick = blk.transactions.find(t => t.input.startsWith("0xa9059cbb"));
  }
  assert.ok(pick, "no ERC-20 transfer tx found on " + ch);
  const t = await C.decodeTx(ch, pick.hash);
  assert.ok(t.status); assert.equal(t.call.signature, "transfer(address,uint256)");
  assert.ok(t.logs.some(l => l.event === "Transfer(address,address,uint256)"));
  ok(`tx ${ch} ${t.hash} status=${t.status} call=${t.call.signature} logs=${t.logs.length} decoded=${t.logs.filter(l => l.event).length}`);
}
// hashes & merkle
assert.equal(C.hashes("").keccak256, "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"); assert.equal(C.hashes("abc").sha256, "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"); ok("keccak/sha256 vectors");
const mt = C.merkleStandard(["address", "uint256"], [["0x1111111111111111111111111111111111111111", "5000000000000000000"], ["0x2222222222222222222222222222222222222222", "2500000000000000000"]]);
assert.equal(mt.root, "0xd4dee0beab2d53f2cc83e567171bd2820e49898130a22622b10ead383e90bd77"); ok("OZ StandardMerkleTree root matches OZ README vector");
// storage slots
assert.equal(C.erc7201Slot("example.main"), "0x183a6125c38840424c4a85fa12bab2ab606c4b6d0e7cc73c0c06ba5300eab500"); ok("ERC-7201 vector (example.main) matches EIP text");
assert.equal(C.EIP1967.implementation, C.ethers.toBeHex(BigInt(C.ethers.id("eip1967.proxy.implementation")) - 1n, 32)); ok("EIP-1967 slot derivation");
// USDC (FiatTokenV2) balances mapping is at slot 9: read a real balance and compare to balanceOf
const holder = "0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341"; // Sky/Maker PSM-style large holder; any holder works
const slot = C.mappingSlot("address", holder, 9);
const raw = await C.readSlot("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", slot);
const bal = await C.rpc("ethereum", "eth_call", [{ to: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", data: C.encodeCall("balanceOf(address)", [holder]) }, "latest"]);
assert.equal(BigInt(raw) & ((1n << 255n) - 1n), BigInt(bal)); ok("mapping slot: USDC balances[slot 9] == balanceOf() (" + C.ethers.formatUnits(BigInt(bal), 6) + " USDC)");
// data API
const chains = await C.dataset("chains"); assert.ok(chains.data.find(c => c.chainId === 8453)); ok("data API chains " + chains.count);
const tl = await C.tokenList(); assert.ok(tl.tokens.length > 100); ok("uniswap token list " + tl.tokens.length);
console.log("ALL OK");
