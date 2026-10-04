# Generates the static tool pages. Run: python3 gen_pages.py
import os, html, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_pages2 import P2
BASE = "https://blockchains.github.io/blockchainlab-tools"
def U(path, c): return f"https://blockchainlab.com{path}?utm_source=blockchainlab-tools&utm_medium=tool&utm_campaign={c}"
NAV = [("gas","Gas"),("units","Units"),("abi","ABI"),("address","Address/ENS"),("tx","Tx decoder"),("hash","Hash/Merkle"),("storage","Storage slots"),("reference","EIP/ERC/BIP"),("chains","Chainlist"),("tokens","Tokens")]
IMPORTMAP = '''<script type="importmap">{"imports":{"ethers":"https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm","@openzeppelin/merkle-tree":"https://esm.sh/@openzeppelin/merkle-tree@1.0.8","@scure/btc-signer":"https://esm.sh/@scure/btc-signer@2.0.1","@scure/base":"https://esm.sh/@scure/base@2.0.0"}}</script>'''
NAV2 = [("safe","Safe multisig"),("eip712","EIP-712"),("calldiff","Calldata diff"),("verify","Verification"),("gas-history","Gas history"),("bridge","Bridge fees"),("approvals","Approvals"),("ens-bulk","ENS bulk"),("solana-tx","Solana tx"),("psbt","Bitcoin PSBT"),("labels","Address labels"),("vanity","Vanity/CREATE2"),("price-impact","Price impact"),("mev","MEV sandwich"),("stablecoins","Stablecoins"),("rpc-health","RPC health")]
ALLNAV = NAV + NAV2
def page(slug, title, desc, h1, lede, bl, body, script, depth=1):
    pre = "../" * depth if slug else "./"
    nav = "".join(f'<a href="{pre}{s}/" class="{"on" if s==slug else ""}">{n}</a>' for s,n in NAV[:6]) + '<select aria-label="All tools" onchange="location.href=this.value" style="width:auto;padding:4px 8px">' + f'<option value="">All {len(ALLNAV)} tools…</option>' + "".join(f'<option value="{pre}{s}/"{" selected" if s==slug else ""}>{n}</option>' for s,n in ALLNAV) + '</select><a href="https://blockchains.github.io/">Hub</a>'
    bllinks = " · ".join(f'<a href="{U(p,slug or "home")}">{html.escape(l)}</a>' for p,l in bl)
    canon = f"{BASE}/{slug+'/' if slug else ''}"
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><meta name="description" content="{html.escape(desc)}"><link rel="canonical" href="{canon}">
<meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}"><meta property="og:image" content="{BASE}/social-preview.png"><meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="{pre}assets/app.css">{IMPORTMAP}</head><body>
<nav><div class="wrap"><a class="brand" href="{pre or './'}">Blockchain Lab Tools</a>{nav}</div></nav>
<main class="wrap"><h1>{html.escape(h1)}</h1><p class="mut">{lede}</p>
{body}
<div class="card mut">Learn more on Blockchain Lab: {bllinks}</div></main>
<footer><div class="wrap">Built by Blockchain Lab — <a href="{U('/', slug or 'home')}">blockchainlab.com</a> · Runs entirely in your browser against public RPCs/APIs; nothing is sent to Blockchain Lab · <a href="https://github.com/Blockchains/blockchainlab-tools">Source</a> · <a href="https://blockchains.github.io/blockchainlab-api/">Open Data API</a> · Not financial advice.</div></footer>
<script type="module">
import * as C from "{pre}assets/core.js"; {'import * as D from "'+pre+'assets/core2.js"; ' if slug in P2 else ''}import {{ $, esc, params, busy, fail, kv, table, json, on }} from "{pre}assets/ui.js";
{script}
</script></body></html>'''

P = {}
CHAIN_OPTS = "".join(f'<option value="{k}">{n}</option>' for k,n in [("ethereum","Ethereum"),("base","Base"),("arbitrum","Arbitrum One"),("optimism","OP Mainnet"),("polygon","Polygon PoS"),("bsc","BNB Smart Chain"),("avalanche","Avalanche C-Chain")])

P["gas"] = ("Multi-chain gas & fee estimator (Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Bitcoin, Solana) | Blockchain Lab Tools",
 "Live gas prices and transaction cost in USD across EVM chains, Bitcoin sat/vB and Solana priority fees, read directly from public RPCs.",
 "Gas & fee estimator", "Live from public RPCs (eth_feeHistory over the last 20 blocks), mempool.space and Solana RPC. USD prices from DefiLlama. L2 figures are the L2 execution fee only; rollups also charge an L1 data fee that varies with calldata size.",
 [("/learn/concepts/rollup","Rollups"),("/learn/compare/plasma-vs-rollups","Plasma vs rollups"),("/intelligence/crypto-pulse","Crypto Pulse")],
 '''<div class="card"><div class="row"><div><label>Gas units (EVM)</label><input id="units" value="21000"></div><div><label>Preset</label><select id="preset"><option value="21000">Native transfer (21,000 gas)</option><option value="65000">ERC-20 transfer (~65,000, varies by token)</option><option value="180000">DEX swap (~180,000, varies)</option><option value="1000000">Contract deploy (1,000,000, varies)</option></select></div><div><label>Bitcoin tx size (vbytes)</label><input id="vb" value="141"></div></div><button id="go">Refresh</button></div>
<div id="out" class="card"></div><div id="btc" class="card"></div><div id="sol" class="card"></div>''',
 '''const fmtUsd = (n) => n < 0.01 ? "$" + n.toPrecision(2) : "$" + n.toFixed(n < 1 ? 4 : 2);
$("#preset").onchange = () => { $("#units").value = $("#preset").value; run(); };
let px = {};
async function evm() {
  const out = $("#out"); busy(out, "Querying 7 chains…");
  try {
    const keys = Object.keys(C.CHAINS); const units = BigInt($("#units").value || "21000");
    const res = await Promise.allSettled(keys.map(k => C.evmFees(k)));
    const rows = res.map((r, i) => ({ k: keys[i], r }));
    out.innerHTML = `<h3>EVM chains <span class="pill">${new Date().toLocaleTimeString()}</span></h3>` + table(rows, [
      ["Chain", x => esc(C.CHAINS[x.k].name)],
      ["Base fee (gwei)", x => x.r.status === "fulfilled" && x.r.value.baseFeeWei !== undefined ? C.ethers.formatUnits(x.r.value.baseFeeWei, "gwei") : x.r.status === "fulfilled" ? "n/a" : `<span class=err>${esc(x.r.reason?.message)}</span>`],
      ["Priority tip p25 / p50 / p75 (gwei)", x => x.r.status === "fulfilled" && x.r.value.tipWei ? ["low","mid","high"].map(t => C.ethers.formatUnits(x.r.value.tipWei[t], "gwei")).join(" / ") : ""],
      ["eth_gasPrice (gwei)", x => x.r.status === "fulfilled" ? C.ethers.formatUnits(x.r.value.gasPriceWei, "gwei") : ""],
      [`Cost for ${units} gas`, x => { if (x.r.status !== "fulfilled") return ""; const c = C.feeCost(x.r.value, units); const nat = Number(C.ethers.formatEther(c.totalWei)); const p = px[C.CHAINS[x.k].gecko]; return `${nat.toPrecision(4)} ${C.CHAINS[x.k].symbol}` + (p ? ` ≈ <b>${fmtUsd(nat * p)}</b>` : ""); }],
    ]) + (px.ethereum ? `<p class="mut">Prices: ETH $${px.ethereum?.toFixed(2)}, POL $${px["polygon-ecosystem-token"]?.toFixed(4)}, BNB $${px.binancecoin?.toFixed(2)}, AVAX $${px["avalanche-2"]?.toFixed(2)} (<a href="https://defillama.com/docs/api">DefiLlama coins API</a>).</p>` : `<p class="err">USD prices unavailable right now (DefiLlama); native-token costs shown.</p>`);
  } catch (e) { fail(out, e); }
}
async function btc() {
  const el = $("#btc"); busy(el, "Querying Bitcoin fee rates…");
  try { const b = await C.btcFees(); const vb = Number($("#vb").value || 141);
    el.innerHTML = `<h3>Bitcoin (sat/vB, ${esc(b.source)})</h3>` + table(Object.entries(b).filter(x=>x[0]!=="source"), [["Target", x => esc(x[0])], ["sat/vB", x => x[1]], [`Cost for ${vb} vB`, x => `${x[1] * vb} sats` + (px.bitcoin ? ` ≈ ${fmtUsd(x[1] * vb / 1e8 * px.bitcoin)}` : "")]]);
  } catch (e) { fail(el, e); }
}
async function sol() {
  const el = $("#sol"); busy(el, "Querying Solana priority fees…");
  try { const s = await C.solFees(); const sig = s.baseLamportsPerSignature / 1e9;
    el.innerHTML = `<h3>Solana</h3>` + kv({ "Base fee": `5,000 lamports per signature = ${sig} SOL` + (px.solana ? ` ≈ ${fmtUsd(sig * px.solana)}` : "") + ` (<a href="https://solana.com/docs/core/fees">Solana docs</a>)`, "Priority fee p50 / p75 / p90 (micro-lamports per CU)": `${s.priorityMicroLamportsPerCU.p50} / ${s.priorityMicroLamportsPerCU.p75} / ${s.priorityMicroLamportsPerCU.p90}`, "Sample": `${s.samples} recent slots touching USDC / wSOL / Jupiter accounts (getRecentPrioritizationFees)`, "Example: 200,000 CU at p75": `${(s.priorityMicroLamportsPerCU.p75 * 200000 / 1e6 / 1e9 + sig).toPrecision(3)} SOL total` });
  } catch (e) { fail(el, e); }
}
async function run() {
  px = await C.prices([...Object.values(C.CHAINS).map(c => c.gecko), "bitcoin", "solana"]).catch(() => ({}));
  await Promise.allSettled([evm(), btc(), sol()]);
}
on("go", run); run();''')

P["units"] = ("Wei / Gwei / Ether, Sats / BTC, Lamports / SOL unit converter | Blockchain Lab Tools",
 "Exact big-number conversion between wei, gwei, ether, satoshis, BTC, lamports and SOL — no floating point errors.",
 "Unit converter", "Exact integer maths (BigInt via ethers.js). Type a value and pick its unit.",
 [("/learn/fundamentals","Fundamentals"),("/learn/concepts/wallet","Wallets"),("/learn/glossary","Glossary")],
 '''<div class="card"><div class="row"><div><label>Value</label><input id="v" value="1"></div><div><label>Unit</label><select id="u"><option>wei</option><option selected>gwei</option><option>ether</option><option>kwei</option><option>mwei</option><option>szabo</option><option>finney</option><option>sat</option><option>btc</option><option>lamport</option><option>sol</option></select></div></div><button id="go">Convert</button></div><div id="out" class="card"></div>''',
 '''function run(){ const out=$("#out"); try { const r=C.convertUnits($("#v").value,$("#u").value); out.innerHTML=kv(Object.fromEntries(Object.entries(r).map(([k,v])=>[k==="_hex"?"hex (base unit)":k,esc(v)]))); } catch(e){ fail(out,e); } }
if(params.get("v")) $("#v").value=params.get("v"); if(params.get("u")) $("#u").value=params.get("u");
on("go",run); $("#v").oninput=run; $("#u").onchange=run; run();''')

P["abi"] = ("ABI encoder / decoder & function selector lookup | Blockchain Lab Tools",
 "Encode Solidity function calls, decode calldata, compute 4-byte selectors and event topics, and look up unknown selectors in the openchain / 4byte signature databases.",
 "ABI encoder / decoder", "Selector lookups use the public <a href='https://openchain.xyz/signatures'>openchain.xyz</a> database with <a href='https://www.4byte.directory/'>4byte.directory</a> as fallback.",
 [("/learn/concepts/smart-contract","Smart contracts"),("/learn/concepts/virtual-machine","Virtual machines"),("/development-lab/smart-contract-security-assurance","Smart-contract security")],
 '''<div class="card"><h3>Selector / topic</h3><label>Signature (function or "event …")</label><input id="sig" value="transfer(address,uint256)"><button id="sel">Compute</button><div id="selout"></div></div>
<div class="card"><h3>Encode call</h3><label>Function signature</label><input id="esig" value="transfer(address to, uint256 amount)"><label>Arguments (JSON array)</label><input id="eargs" value='["0x000000000000000000000000000000000000dEaD", "1000000"]'><button id="enc">Encode</button><div id="encout"></div></div>
<div class="card"><h3>Decode calldata</h3><label>Calldata (0x…)</label><textarea id="data">0xa9059cbb000000000000000000000000000000000000000000000000000000000000dead00000000000000000000000000000000000000000000000000000000000f4240</textarea><label>Optional signature (otherwise looked up)</label><input id="dsig" placeholder="transfer(address,uint256)"><button id="dec">Decode</button><div id="decout"></div></div>
<div class="card"><h3>Look up a selector</h3><input id="lk" value="0x095ea7b3"><button id="look">Look up</button><div id="lkout"></div></div>''',
 '''on("sel",()=>{const o=$("#selout");try{const s=$("#sig").value.trim();const n=C.normSig(s);o.innerHTML=kv({canonical:esc(n),selector:C.selector(s),"keccak256 (event topic0)":C.topic(s)});}catch(e){fail(o,e)}});
on("enc",()=>{const o=$("#encout");try{o.innerHTML=`<pre>${C.encodeCall($("#esig").value.trim(),JSON.parse($("#eargs").value))}</pre>`}catch(e){fail(o,e)}});
on("dec",async()=>{const o=$("#decout");busy(o,"Decoding…");try{const r=await C.decodeCalldata($("#data").value,$("#dsig").value.trim()||undefined);o.innerHTML=kv({selector:r.selector,signature:esc(r.signature||r.note),candidates:esc((r.candidates||[]).join(", "))})+(r.args?table(r.args,[["name",a=>esc(a.name)],["type",a=>esc(a.type)],["value",a=>`<span class=mono>${esc(json(a.value))}</span>`]]):"")}catch(e){fail(o,e)}});
on("look",async()=>{const o=$("#lkout");busy(o);try{const r=await C.lookupSelector($("#lk").value.trim());o.innerHTML=r.length?`<ul>${r.map(x=>`<li class=mono>${esc(x)}</li>`).join("")}</ul>`:"<p class=mut>No match in public signature databases.</p>"}catch(e){fail(o,e)}});
$("#selout").innerHTML=""; if(params.get("data")){$("#data").value=params.get("data");document.getElementById("dec").click();} else document.getElementById("sel").click();''')

P["address"] = ("Ethereum address checksum validator, ENS resolver & contract inspector | Blockchain Lab Tools",
 "Validate EIP-55 checksums, resolve ENS names (forward and reverse), and inspect any address on Ethereum, Base, Arbitrum, OP, Polygon, BNB or Avalanche: balance, nonce, contract code, proxy implementation, EIP-7702 delegation and ERC-20 metadata.",
 "Address, checksum & ENS", "Enter an address or ENS name. ENS is resolved on Ethereum mainnet via ethers.js.",
 [("/learn/concepts/public-key","Public keys"),("/learn/concepts/wallet","Wallets"),("/learn/concepts/custody","Custody")],
 f'''<div class="card"><div class="row"><div><label>Address or ENS name</label><input id="q" value="vitalik.eth"></div><div><label>Chain for on-chain info</label><select id="chain">{CHAIN_OPTS}</select></div></div><button id="go">Inspect</button></div><div id="out" class="card"></div>''',
 '''async function run(){const o=$("#out");busy(o,"Resolving…");try{let q=$("#q").value.trim(),ch=$("#chain").value,res={};let addr=q;
 if(!q.startsWith("0x")){addr=await C.resolveEns(q);if(!addr)throw new Error("ENS name does not resolve");res["ENS → address"]=addr;}
 const c=C.checkAddress(addr);if(!c.valid)throw new Error("Not a valid 20-byte hex address");
 res["EIP-55 checksum"]=c.checksum;res["Input checksum"]=c.inputChecksumValid===null?"(all lower/upper case — no checksum)":c.inputChecksumValid?"<span class=ok>valid</span>":"<span class=err>INVALID — check for typos</span>";
 const rev=await C.reverseEns(c.checksum).catch(()=>null);if(rev)res["Primary ENS name"]=esc(rev);
 const info=await C.addressInfo(ch,c.checksum);const cc=C.CHAINS[ch];
 res[`Balance (${cc.name})`]=`${C.ethers.formatEther(info.balanceWei)} ${cc.symbol}`;res["Nonce (txs sent)"]=info.nonce;res["Type"]=info.eip7702DelegatesTo?"EOA with EIP-7702 delegation":info.isContract?`Contract (${info.codeBytes} bytes)`:"Externally owned account (no code)";
 if(info.eip7702DelegatesTo)res["Delegates to"]=info.eip7702DelegatesTo;if(info.eip1967Implementation)res["EIP-1967 implementation"]=info.eip1967Implementation;if(info.zeppelinosImplementation)res["Proxy implementation (zeppelinos slot)"]=info.zeppelinosImplementation;
 if(info.isContract&&!info.eip7702DelegatesTo){const m=await C.erc20Meta(ch,c.checksum);if(m.symbol)res["ERC-20"]=esc(`${m.name} (${m.symbol}), ${m.decimals} decimals, supply ${m.totalSupply}`);}
 res["Explorer"]=`<a href="${cc.explorer}/address/${c.checksum}">${cc.explorer.replace("https://","")}</a>`;o.innerHTML=kv(res);}catch(e){fail(o,e)}}
if(params.get("q"))$("#q").value=params.get("q");if(params.get("chain"))$("#chain").value=params.get("chain");on("go",run);run();''')

P["tx"] = ("Transaction decoder for Ethereum, Base, Arbitrum, Polygon, OP | Blockchain Lab Tools",
 "Paste a transaction hash to decode the function call, arguments, event logs, status and fees on Ethereum, Base, Arbitrum, Polygon, OP Mainnet, BNB Chain and Avalanche via public RPC.",
 "Transaction decoder", "Reads the transaction and receipt from a public RPC and decodes calldata and logs using the openchain signature database. Note: public RPCs may not serve very old (pre-2022) Ethereum history.",
 [("/learn/concepts/finality","Finality"),("/learn/concepts/settlement","Settlement"),("/learn/concepts/smart-contract","Smart contracts")],
 f'''<div class="card"><div class="row"><div><label>Chain</label><select id="chain">{CHAIN_OPTS}</select></div><div style="grid-column:span 2"><label>Transaction hash</label><input id="h" placeholder="0x…"></div></div><button id="go">Decode</button> <button class="sec" id="latest">Use a recent tx from this chain</button></div><div id="out" class="card"></div>''',
 '''async function run(){const o=$("#out");busy(o,"Fetching transaction + receipt…");try{const ch=$("#chain").value,h=$("#h").value.trim();if(!/^0x[0-9a-fA-F]{64}$/.test(h))throw new Error("Enter a 32-byte tx hash");
 history.replaceState(null,"",`?chain=${ch}&hash=${h}`);const t=await C.decodeTx(ch,h),cc=C.CHAINS[ch];
 const head=kv({Status:t.status?`<span class="${t.status==="success"?"ok":"err"}">${t.status}</span>`:"pending",Block:t.block,Time:t.timestamp,From:`<a href="../address/?q=${t.from}&chain=${ch}">${t.from}</a>`,To:t.to?`<a href="../address/?q=${t.to}&chain=${ch}">${t.to}</a>`:"(contract creation)",Value:`${C.ethers.formatEther(t.valueWei)} ${cc.symbol}`,"Gas used":t.gasUsed?.toString(),"Effective gas price":t.effectiveGasPriceWei!==undefined?C.ethers.formatUnits(t.effectiveGasPriceWei,"gwei")+" gwei":"","Execution fee":t.feeWei!==undefined?`${C.ethers.formatEther(t.feeWei)} ${cc.symbol}`:"","L1 data fee":t.l1FeeWei!==undefined?`${C.ethers.formatEther(t.l1FeeWei)} ETH`:"",Nonce:t.nonce,"Tx type":t.type,"Contract created":t.contractCreated,Explorer:`<a href="${cc.explorer}/tx/${h}">${cc.explorer.replace("https://","")}</a>`});
 const call=`<h3>Call</h3>`+kv({Selector:t.call.selector,Function:esc(t.call.signature||t.call.note)})+(t.call.args?table(t.call.args,[["name",a=>esc(a.name)],["type",a=>esc(a.type)],["value",a=>`<span class=mono>${esc(json(a.value))}</span>`]]):"");
 const logs=`<h3>Events (${t.logs.length})</h3>`+table(t.logs,[["Contract",l=>`<a class=mono href="../address/?q=${l.address}&chain=${ch}">${l.address}</a>`],["Event",l=>esc(l.event||l.topic0)],["Args",l=>l.args?`<span class=mono>${esc(json(l.args))}</span>`:"<span class=mut>undecoded</span>"]]);
 o.innerHTML=head+call+logs;}catch(e){fail(o,e)}}
on("go",run);on("latest",async()=>{const ch=$("#chain").value;const n=Number(await C.rpc(ch,"eth_blockNumber"))-5;const b=await C.rpc(ch,"eth_getBlockByNumber",["0x"+n.toString(16),true]);const t=b.transactions.find(x=>x.input&&x.input.length>10)||b.transactions[0];$("#h").value=t.hash;run();});
if(params.get("chain"))$("#chain").value=params.get("chain");if(params.get("hash")){$("#h").value=params.get("hash");run();}else $("#out").innerHTML="<p class=mut>Paste a hash, or click “Use a recent tx”.</p>";''')

P["hash"] = ("Keccak-256, SHA-256 hasher & OpenZeppelin Merkle tree builder | Blockchain Lab Tools",
 "Hash text or hex with keccak256, sha256 and ripemd160, and build OpenZeppelin-compatible Merkle trees (StandardMerkleTree / SimpleMerkleTree) with root and proofs for airdrops and allowlists.",
 "Hashing & Merkle trees", "Merkle trees use the official <a href='https://github.com/OpenZeppelin/merkle-tree'>@openzeppelin/merkle-tree</a> library, so roots and proofs verify with OpenZeppelin's MerkleProof.sol.",
 [("/learn/concepts/hash","Hashes"),("/learn/concepts/merkle-tree","Merkle trees"),("/research/corpus/papers/bitcoin","Bitcoin whitepaper")],
 '''<div class="card"><h3>Hash</h3><div class="row"><div style="grid-column:span 2"><label>Input</label><input id="hin" value="hello"></div><div><label>Interpret as</label><select id="hmode"><option value="text">UTF-8 text</option><option value="hex">Hex bytes</option></select></div></div><div id="hout"></div></div>
<div class="card"><h3>Merkle tree</h3><div class="row"><div><label>Mode</label><select id="mmode"><option value="standard">StandardMerkleTree (abi-encoded rows)</option><option value="simple">SimpleMerkleTree (bytes32 leaves)</option></select></div><div><label>Leaf types (standard mode)</label><input id="mtypes" value="address,uint256"></div></div>
<label>Rows — one per line, comma-separated values (standard) or one bytes32 per line (simple)</label><textarea id="mrows">0x1111111111111111111111111111111111111111,5000000000000000000
0x2222222222222222222222222222222222222222,2500000000000000000</textarea><button id="mgo">Build tree</button><div id="mout"></div></div>''',
 '''function h(){const o=$("#hout");try{const r=C.hashes($("#hin").value,$("#hmode").value);o.innerHTML=kv({keccak256:r.keccak256,sha256:r.sha256,ripemd160:r.ripemd160,bytes:r.bytes})}catch(e){fail(o,e)}}
$("#hin").oninput=h;$("#hmode").onchange=h;h();
on("mgo",()=>{const o=$("#mout");try{const lines=$("#mrows").value.split("\\n").map(s=>s.trim()).filter(Boolean);let r;
 if($("#mmode").value==="standard"){const types=$("#mtypes").value.split(",").map(s=>s.trim());r=C.merkleStandard(types,lines.map(l=>l.split(",").map(s=>s.trim())));}else r=C.merkleSimple(lines);
 o.innerHTML=kv({Root:`<b>${r.root}</b>`,Leaves:lines.length})+table(r.proofs,[["Leaf",p=>`<span class=mono>${esc(json(p.leaf))}</span>`],["Proof",p=>`<span class=mono>${esc(json(p.proof))}</span>`]])+(r.dump?`<details><summary>Tree dump (JSON, load with StandardMerkleTree.load)</summary><pre>${esc(json(r.dump))}</pre></details>`:"");}catch(e){fail(o,e)}});
document.getElementById("mgo").click();''')

P["storage"] = ("Solidity storage slot calculator (mappings, arrays, ERC-7201, EIP-1967) | Blockchain Lab Tools",
 "Compute Solidity storage slots for mappings, nested mappings, dynamic arrays, ERC-7201 namespaces and EIP-1967 proxy slots — then read the live value from any EVM chain.",
 "Storage slot calculator", "Follows the <a href='https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html'>Solidity storage layout rules</a>, <a href='https://eips.ethereum.org/EIPS/eip-7201'>ERC-7201</a> and <a href='https://eips.ethereum.org/EIPS/eip-1967'>EIP-1967</a>.",
 [("/development-lab/smart-contract-security-assurance","Smart-contract security assurance"),("/learn/concepts/smart-contract","Smart contracts")],
 f'''<div class="card"><h3>Mapping slot</h3><div class="row"><div><label>Base slot (declaration position)</label><input id="ms" value="9"></div><div><label>Key type</label><select id="mt"><option>address</option><option>uint256</option><option>bytes32</option><option>string</option><option>bool</option></select></div><div><label>Key</label><input id="mk" value="0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341"></div></div>
<label>Nested keys (optional; one "type,value" per line, applied after the first key)</label><textarea id="mn" placeholder="address,0xSpender…"></textarea><button id="mgo">Compute</button><div id="mout"></div></div>
<div class="card"><h3>Dynamic array element</h3><div class="row"><div><label>Array slot</label><input id="as" value="3"></div><div><label>Index</label><input id="ai" value="0"></div><div><label>Slots per element</label><input id="ae" value="1"></div></div><button id="ago">Compute</button><div id="aout"></div></div>
<div class="card"><h3>ERC-7201 namespace</h3><label>Namespace id</label><input id="ns" value="openzeppelin.storage.ERC20"><button id="ngo">Compute</button><div id="nout"></div></div>
<div class="card"><h3>EIP-1967 proxy slots</h3><div id="eip"></div></div>
<div class="card"><h3>Read a live slot</h3><div class="row"><div><label>Chain</label><select id="rc">{CHAIN_OPTS}</select></div><div><label>Contract</label><input id="ra" value="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"></div><div><label>Slot</label><input id="rs" placeholder="paste a slot from above"></div></div><button id="rgo">eth_getStorageAt</button><div id="rout"></div></div>''',
 '''const use=(s)=>`${s} <button class="sec" onclick="document.getElementById('rs').value='${s}'">read it ↓</button>`;
on("mgo",()=>{const o=$("#mout");try{const keys=[[$("#mt").value,$("#mk").value.trim()],...$("#mn").value.split("\\n").map(s=>s.trim()).filter(Boolean).map(l=>{const i=l.indexOf(",");return[l.slice(0,i).trim(),l.slice(i+1).trim()]})];o.innerHTML=kv({Slot:use(C.nestedMappingSlot(keys,$("#ms").value))})}catch(e){fail(o,e)}});
on("ago",()=>{const o=$("#aout");try{o.innerHTML=kv({"Length lives at":C.ethers.toBeHex(BigInt($("#as").value),32),"Element slot":use(C.arrayElementSlot($("#as").value,$("#ai").value,$("#ae").value))})}catch(e){fail(o,e)}});
on("ngo",()=>{const o=$("#nout");try{o.innerHTML=kv({"Namespace root slot":use(C.erc7201Slot($("#ns").value.trim()))})}catch(e){fail(o,e)}});
$("#eip").innerHTML=kv(Object.fromEntries(Object.entries(C.EIP1967).map(([k,v])=>[k,use(v)])));
on("rgo",async()=>{const o=$("#rout");busy(o);try{const v=await C.readSlot($("#rc").value,$("#ra").value.trim(),$("#rs").value.trim());o.innerHTML=kv({"Raw value":v,"As uint256":BigInt(v).toString(),"As address (low 20 bytes)":"0x"+v.slice(-40)})}catch(e){fail(o,e)}});
document.getElementById("mgo").click();document.getElementById("ngo").click();document.getElementById("ago").click();''')

P["reference"] = ("EIP / ERC / BIP quick reference — searchable index | Blockchain Lab Tools",
 "Search every Ethereum EIP and ERC and every Bitcoin BIP by number, title or status. Rebuilt nightly from ethereum/EIPs, ethereum/ERCs and bitcoin/bips.",
 "EIP / ERC / BIP reference", "Data from the <a href='https://blockchains.github.io/blockchainlab-api/'>Blockchain Lab Open Data API</a> (parsed nightly from ethereum/EIPs, ethereum/ERCs and bitcoin/bips).",
 [("/whitepaper","Whitepaper library"),("/learn/blockchain-canon","Blockchain canon"),("/learn/what-changed","What changed")],
 '''<div class="card"><div class="row"><div style="grid-column:span 2"><label>Search (number or words)</label><input id="q" placeholder="e.g. 4337, account abstraction, taproot"></div><div><label>Set</label><select id="set"><option value="all">All</option><option value="eips">EIPs</option><option value="ercs">ERCs</option><option value="bips">BIPs</option></select></div><div><label>Status</label><select id="st"><option value="">Any</option><option>Final</option><option>Living</option><option>Last Call</option><option>Review</option><option>Draft</option><option>Stagnant</option><option>Withdrawn</option><option>Deployed</option><option>Complete</option><option>Proposed</option><option>Active</option><option>Closed</option></select></div></div></div><div id="out" class="card"></div>''',
 '''let all=[];const o=$("#out");busy(o,"Loading index…");
try{const [e,r,b]=await Promise.all(["eips","ercs","bips"].map(C.dataset));all=[...e.data.map(x=>({...x,set:"eips",label:"EIP-"+x.number})),...r.data.map(x=>({...x,set:"ercs",label:"ERC-"+x.number})),...b.data.map(x=>({...x,set:"bips",label:"BIP-"+x.number}))];
 o.dataset.gen=e.generated_at;render();}catch(e){fail(o,e)}
function render(){const q=$("#q").value.trim().toLowerCase(),set=$("#set").value,st=$("#st").value;
 const rows=all.filter(x=>(set==="all"||x.set===set)&&(!st||x.status===st)&&(!q||String(x.number)===q.replace(/\\D/g,"")&&/^\\D*\\d+$/.test(q)||(x.title||"").toLowerCase().includes(q)||x.label.toLowerCase()===q)).slice(0,300);
 o.innerHTML=`<p class=mut>${rows.length} shown${rows.length===300?" (first 300)":""} of ${all.length}. Index built ${o.dataset.gen}.</p>`+table(rows,[["#",x=>`<a href="${x.url}">${x.label}</a>`],["Title",x=>esc(x.title)],["Status",x=>esc(x.status)],["Type",x=>esc([x.type,x.category||x.layer].filter(Boolean).join(" / "))]]);}
$("#q").oninput=render;$("#set").onchange=render;$("#st").onchange=render;if(params.get("q")){$("#q").value=params.get("q");}''')

P["chains"] = ("Chainlist — EVM chain IDs, RPC endpoints & explorers, add to wallet | Blockchain Lab Tools",
 "Search 2,700+ EVM networks by name or chain ID, test public RPC latency live from your browser, and add a network to MetaMask/any EIP-3085 wallet.",
 "Chainlist", "From <a href='https://chainid.network/'>chainid.network</a> (ethereum-lists/chains) via the Blockchain Lab Open Data API. RPC tests run from your browser.",
 [("/learn/protocol-atlas","Protocol atlas"),("/learn/protocols","Protocol profiles"),("/learn/compare","Compare designs")],
 '''<div class="card"><div class="row"><div style="grid-column:span 2"><label>Search by name, short name or chain ID</label><input id="q" value="base"></div><div><label><input type="checkbox" id="tn" style="width:auto"> include testnets</label></div></div></div><div id="out" class="card"></div>''',
 '''let all=[];const o=$("#out");busy(o,"Loading chains…");
try{all=(await C.dataset("chains")).data;render();}catch(e){fail(o,e)}
function render(){const q=$("#q").value.trim().toLowerCase();const rows=all.filter(c=>($("#tn").checked||!c.testnet)&&(!q||String(c.chainId)===q||c.name.toLowerCase().includes(q)||(c.shortName||"").toLowerCase()===q)).slice(0,60);
 o.innerHTML=`<p class=mut>${rows.length} shown of ${all.length}</p>`+table(rows,[["Chain ID",c=>`<b>${c.chainId}</b> <span class=mono>0x${c.chainId.toString(16)}</span>`],["Name",c=>esc(c.name)+(c.infoURL?` <a href="${esc(c.infoURL)}">↗</a>`:"")],["Currency",c=>esc(c.nativeCurrency?.symbol)],["RPCs",c=>c.rpc.filter(u=>u.startsWith("http")).slice(0,4).map(u=>`<div class=mono>${esc(u)} <a href="#" data-rpc="${esc(u)}" data-id="${c.chainId}">test</a> <span></span></div>`).join("")||"<span class=mut>none public</span>"],["Explorer",c=>c.explorers[0]?`<a href="${esc(c.explorers[0].url)}">${esc(c.explorers[0].name)}</a>`:""],["",c=>`<button class="sec" data-add="${c.chainId}">Add to wallet</button>`]]);}
o.addEventListener("click",async ev=>{const t=ev.target;if(t.dataset.rpc){ev.preventDefault();const s=t.nextElementSibling;s.textContent="…";const t0=performance.now();try{const r=await fetch(t.dataset.rpc,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]})});const j=await r.json();const ok=parseInt(j.result,16)===Number(t.dataset.id);s.innerHTML=`<span class="${ok?"ok":"err"}">${ok?"✓":"✗ wrong chain"} ${Math.round(performance.now()-t0)} ms</span>`;}catch(e){s.innerHTML=`<span class=err>✗ ${esc(e.message)} (often CORS)</span>`}}
 if(t.dataset.add){const c=all.find(x=>x.chainId===Number(t.dataset.add));if(!window.ethereum){alert("No EIP-1193 wallet found in this browser.");return;}try{await window.ethereum.request({method:"wallet_addEthereumChain",params:[{chainId:"0x"+c.chainId.toString(16),chainName:c.name,nativeCurrency:c.nativeCurrency,rpcUrls:c.rpc.filter(u=>u.startsWith("https")).slice(0,3),blockExplorerUrls:c.explorers.map(e=>e.url).slice(0,1)}]})}catch(e){alert(e.message)}}});
$("#q").oninput=render;$("#tn").onchange=render;if(params.get("q"))$("#q").value=params.get("q");''')

P["tokens"] = ("Token list lookup — find ERC-20 addresses by symbol across chains | Blockchain Lab Tools",
 "Search the Uniswap default token list by symbol, name or address across Ethereum, Base, Arbitrum, OP, Polygon, BNB and Avalanche, and verify any token's on-chain name, symbol, decimals and supply.",
 "Token list lookup", "Searches the <a href='https://tokens.uniswap.org'>Uniswap default token list</a>. A token on a list is not an endorsement — always verify the contract on-chain (below).",
 [("/learn/concepts/tokenisation","Tokenisation"),("/learn/concepts/stablecoin","Stablecoins"),("/intelligence/stablecoins","Stablecoin intelligence")],
 f'''<div class="card"><label>Symbol, name or address</label><input id="q" value="USDC"></div><div id="out" class="card"></div>
<div class="card"><h3>Verify on-chain</h3><div class="row"><div><label>Chain</label><select id="vc">{CHAIN_OPTS}</select></div><div style="grid-column:span 2"><label>Token address</label><input id="va" placeholder="0x…"></div></div><button id="vgo">Read name / symbol / decimals / supply</button><div id="vout"></div></div>''',
 '''let list;const o=$("#out");busy(o,"Loading token list…");
try{list=await C.tokenList();render();}catch(e){fail(o,e)}
function render(){const q=$("#q").value.trim().toLowerCase();const rows=list.tokens.filter(t=>!q||t.symbol.toLowerCase()===q||t.name.toLowerCase().includes(q)||t.address.toLowerCase()===q).slice(0,80);
 o.innerHTML=`<p class=mut>${esc(list.name)} v${list.version.major}.${list.version.minor}.${list.version.patch} · ${rows.length} matches</p>`+table(rows,[["Token",t=>`${t.logoURI?`<img src="${esc(t.logoURI)}" width=18 height=18 style="vertical-align:middle" loading=lazy> `:""}<b>${esc(t.symbol)}</b> ${esc(t.name)}`],["Chain",t=>esc(C.CHAINS[C.chainById(t.chainId)]?.name||"chainId "+t.chainId)],["Address",t=>`<span class=mono>${t.address}</span>`],["Decimals",t=>t.decimals],["",t=>C.chainById(t.chainId)?`<button class=sec data-c="${C.chainById(t.chainId)}" data-a="${t.address}">verify</button>`:""]]);}
o.addEventListener("click",e=>{if(e.target.dataset.a){$("#vc").value=e.target.dataset.c;$("#va").value=e.target.dataset.a;document.getElementById("vgo").click();$("#vout").scrollIntoView();}});
on("vgo",async()=>{const v=$("#vout");busy(v);try{const m=await C.erc20Meta($("#vc").value,$("#va").value.trim());v.innerHTML=kv({Name:esc(m.name),Symbol:esc(m.symbol),Decimals:m.decimals,"Total supply":m.totalSupply});}catch(e){fail(v,e)}});
$("#q").oninput=render;''')

P.update(P2)
for slug,(title,desc,h1,lede,bl,body,script) in P.items():
    os.makedirs(slug, exist_ok=True)
    open(f"{slug}/index.html","w").write(page(slug,title,desc,h1,lede,bl,body,script))

# home
cards = "".join(f'<a class="card" href="{s}/"><b>{P[s][2]}</b><p class="mut">{html.escape(P[s][1])}</p></a>' for s,_ in NAV)
cards2 = "".join(f'<a class="card" href="{s}/"><b>{P[s][2]}</b> <span class="pill">new</span><p class="mut">{html.escape(P[s][1])}</p></a>' for s,_ in NAV2)
home_body = f'''<input id="tq" placeholder="Filter {len(ALLNAV)} tools… (e.g. safe, solana, gas)" oninput="for(const a of document.querySelectorAll('.grid a.card'))a.style.display=a.textContent.toLowerCase().includes(this.value.toLowerCase())?'':'none'" style="margin:8px 0 4px">
<h2>Security, wallets &amp; multichain</h2><div class="grid">{cards2}</div><h2>Core developer tools</h2><div class="grid">{cards}</div>
<div class="card"><h3>More from Blockchain Lab</h3><ul>
<li><a href="https://blockchains.github.io/blockchainlab-api/">Open Data API</a> — free JSON: chains, DeFi TVL, EIPs/ERCs/BIPs, grants, hackathons, 600+ whitepapers</li>
<li><a href="https://github.com/Blockchains/blockchainlab-mcp">blockchainlab-mcp</a> — let Cursor / Claude / Grok agents query these tools and datasets</li>
<li><a href="https://github.com/Blockchains/blockchainlab-lens">blockchainlab-lens</a> — explain any Etherscan address or tx in one click</li>
<li><a href="https://github.com/Blockchains/blockchainlab-labs">blockchainlab-labs</a> — 54 hands-on labs (Solidity, Noir ZK, Cairo) · <a href="https://blockchains.github.io/">Blockchain Lab Hub</a> (75 services) · <a href="https://github.com/Blockchains/blockchain-dev-roadmap">developer roadmap</a> · <a href="https://github.com/Blockchains/blockchain-interview-questions">interview questions</a></li>
<li><a href="https://github.com/Blockchains/hackathons">Hackathons tracker</a> · <a href="https://github.com/Blockchains/blockchainlab-feeds">feeds</a> · <a href="https://github.com/Blockchains/whitepapers">whitepapers repo</a></li></ul></div>'''
open("index.html","w").write(page("", f"Blockchain Lab Tools — {len(ALLNAV)} free client-side blockchain developer tools (Safe, EIP-712, gas, bridges, approvals, Solana, PSBT, MEV)",
 "Free, open-source, no-backend blockchain developer tools: Safe multisig tx builder, EIP-712 signer, calldata diff, contract verification, gas history, bridge fee compare, token approvals & revoke, ENS bulk, Solana tx decoder, Bitcoin PSBT decoder, address labels, vanity/CREATE2, Uniswap price impact, MEV sandwich checker, stablecoins, RPC health, plus gas, ABI, tx decoder, Merkle, storage slots and more.",
 "Blockchain Lab Tools", "Free developer utilities that run entirely in your browser against live public RPCs and APIs. No accounts, no tracking, no backend. Open source.",
 [("/","Blockchain Lab home"),("/tools","Blockchain Lab tools"),("/whitepaper","Whitepaper library"),("/learn/protocol-atlas","Protocol atlas"),("/forge/composer","Constructor")], home_body, "", depth=0))
# sitemap + robots
urls = [f"{BASE}/"] + [f"{BASE}/{k}/" for k,_ in ALLNAV]
open("sitemap.xml","w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{u}</loc></url>" for u in urls) + "</urlset>\n")
open("robots.txt","w").write(f"User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n")
print("pages:", len(P)+1)
