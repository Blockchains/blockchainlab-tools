# Browser end-to-end test of every tool page against live public sources.
# usage: python3 test/e2e.py [base_url]   (default: https://blockchains.github.io/blockchainlab-tools)
import sys, json
from playwright.sync_api import sync_playwright
BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://blockchains.github.io/blockchainlab-tools").rstrip("/")
results = []
def check(name, fn):
    try: fn(); results.append((name, "PASS", "")); print("PASS", name)
    except Exception as e: results.append((name, "FAIL", str(e)[:300])); print("FAIL", name, str(e)[:300])
with sync_playwright() as p:
    import os
    exe = "/usr/bin/google-chrome" if os.path.exists("/usr/bin/google-chrome") else None
    b = p.chromium.launch(executable_path=exe, args=["--no-sandbox"]) if exe else p.chromium.launch(args=["--no-sandbox"])
    pg = b.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    def go(path):
        errs.clear(); r = pg.goto(BASE + path, wait_until="domcontentloaded"); assert r.status == 200, f"HTTP {r.status}"
    def noerr(sel):
        t = pg.inner_text(sel); assert "Error:" not in t, t[:300]; assert not errs, errs; return t
    def home():
        go("/"); assert pg.locator(".grid a.card").count() == 26, pg.locator(".grid a.card").count()
    def gas():
        last = None
        for attempt in range(2):  # one retry: public endpoints occasionally rate-limit
            try:
                go("/gas/"); pg.wait_for_selector("#out h3", timeout=45000); pg.wait_for_selector("#btc h3", timeout=45000); pg.wait_for_selector("#sol h3", timeout=45000)
                t = noerr("main"); assert "Ethereum" in t and "Avalanche" in t and "sat/vB" in t and "≈ $" in t, t[:400]; return
            except Exception as e: last = e
        raise last
    def units():
        go("/units/?v=1.5&u=ether"); pg.wait_for_selector("#out table"); t = noerr("#out"); assert "1500000000000000000" in t and "1500000000" in t
    def abi():
        go("/abi/"); pg.wait_for_selector("#selout table"); assert "0xa9059cbb" in noerr("#selout")
        pg.click("#enc"); pg.wait_for_selector("#encout pre"); assert pg.inner_text("#encout").startswith("0xa9059cbb")
        pg.click("#dec"); pg.wait_for_selector("#decout table", timeout=20000); t = noerr("#decout"); assert "transfer(address,uint256)" in t and "1000000" in t, t
        pg.click("#look"); pg.wait_for_selector("#lkout ul", timeout=20000); assert "approve(address,uint256)" in pg.inner_text("#lkout")
    def address():
        go("/address/?q=vitalik.eth"); pg.wait_for_selector("#out table", timeout=30000); t = noerr("#out"); assert "EIP-55 checksum" in t and "Balance" in t and "vitalik.eth" in t, t
        go("/address/?q=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&chain=base"); pg.wait_for_selector("#out table", timeout=30000); t = noerr("#out"); assert "USDC" in t and "Contract" in t, t
    def tx():
        for ch in ["ethereum", "base", "arbitrum", "polygon"]:
            go(f"/tx/"); pg.select_option("#chain", ch); pg.click("#latest"); pg.wait_for_selector("#out h3", timeout=45000); t = noerr("#out"); assert "Status" in t and "Events" in t, (ch, t[:300])
            print("   tx", ch, pg.url.split("hash=")[-1][:20], "ok")
    def hashp():
        go("/hash/"); pg.wait_for_selector("#hout table"); t = noerr("#hout"); assert "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" in t  # keccak("hello")
        pg.wait_for_selector("#mout table", timeout=20000); assert "0xd4dee0beab2d53f2cc83e567171bd2820e49898130a22622b10ead383e90bd77" in noerr("#mout")
    def storage():
        go("/storage/"); pg.wait_for_selector("#nout table"); t = noerr("main"); assert "0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00" in t, "ERC-7201 ERC20 slot mismatch"
        slot = pg.inner_text("#mout td").split()[0]; pg.fill("#rs", slot); pg.click("#rgo"); pg.wait_for_selector("#rout table", timeout=20000); assert "As uint256" in noerr("#rout")
    def reference():
        go("/reference/?q=4337"); pg.wait_for_selector("#out table", timeout=20000); pg.fill("#q", "4337"); t = noerr("#out"); assert "ERC-4337" in t or "EIP-4337" in t, t[:300]
        pg.fill("#q", "taproot"); t = noerr("#out"); assert "BIP-341" in t, t[:300]
    def chains():
        go("/chains/?q=8453"); pg.wait_for_selector("#out table", timeout=30000); pg.fill("#q", "8453"); t = noerr("#out"); assert "Base" in t
        pg.locator("a[data-rpc]").first.click(); pg.wait_for_function("document.querySelector('a[data-rpc]').nextElementSibling.textContent.includes('ms')||document.querySelector('a[data-rpc]').nextElementSibling.textContent.includes('✗')", timeout=20000)
        print("   rpc test:", pg.locator("a[data-rpc]").first.evaluate("e=>e.nextElementSibling.textContent"))
    def tokens():
        go("/tokens/"); pg.wait_for_selector("#out table", timeout=30000); t = noerr("#out"); assert "USDC" in t
        pg.locator("button[data-a]").first.click(); pg.wait_for_selector("#vout table", timeout=20000); assert "USDC" in noerr("#vout") or "USD" in noerr("#vout")

    def W(sel, t=45000): pg.wait_for_selector(sel, timeout=t)
    def safe():
        go("/safe/"); pg.click("#dgo"); W("#dout pre"); t = noerr("#dout"); assert "multiSend" in t and "approve(address,uint256)" in t, t[:300]
    def eip712():
        go("/eip712/"); W("#hout table"); assert "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2" in noerr("#hout")
        pg.click("#sk"); W("#hout table"); signer = pg.inner_text("#hout td").split()[0]; pg.click("#v"); W("#vout table"); assert signer in noerr("#vout")
    def calldiff():
        go("/calldiff/"); W("#out table", 30000); t = noerr("#out"); assert "1 decoded field(s) differ" in t and "2500000" in t, t[:300]
    def verify():
        go("/verify/"); W("#out h3", 30000); assert "Verified source available" in noerr("#out")
    def gashist():
        go("/gas-history/"); W("#out svg", 45000); assert "Base fee min" in noerr("#out")
    def bridge():
        go("/bridge/"); W("#out table", 45000); t = noerr("#out"); assert "best" in t, t[:300]
    def approvals():
        go("/approvals/"); W("#out table", 60000); t = noerr("#out"); assert "Revoke.cash" in t, t[:300]
    def ensbulk():
        go("/ens-bulk/"); W("#out table", 45000); t = noerr("#out"); assert "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" in t, t[:300]
    def solana():
        go("/solana-tx/"); pg.click("#latest"); W("#out h3", 45000); t = noerr("#out"); assert "Compute units" in t and "Instructions" in t, t[:300]
    def psbt():
        go("/psbt/"); W("#out h3", 30000); t = noerr("#out"); assert "PSBT" in t and "1L2tGENeoh4mSoiUZrSbs1J3jazSdJH9QS" in t, t[:300]
    def labels():
        go("/labels/"); W("#out table", 45000); t = noerr("#out"); assert "Permit2" in t and "Not on the OFAC" in t, t[:300]
    def vanity():
        go("/vanity/"); W("#c2o table"); assert "0x" in noerr("#c2o"); W("#out table", 20000); assert "65,536" in noerr("#out")
    def pimpact():
        go("/price-impact/"); W("#out table", 45000); t = noerr("#out"); assert "Price impact" in t and "USDC" in t, t[:300]
    def mev():
        go("/mev/"); W("#out h3", 45000); t = noerr("#out"); assert "Likely sandwiched" in t and "0xae2fc483527b8ef99eb5d9b44875f005ba1fae13" in t, t[:300]
    def stables():
        go("/stablecoins/"); W("#out table", 30000); assert "USDT" in noerr("#out")
    def rpch():
        go("/rpc-health/"); W("#srv table", 45000); t = noerr("main"); assert "healthy" in t, t[:300]
    for n, f in [("home", home), ("gas", gas), ("units", units), ("abi", abi), ("address", address), ("tx", tx), ("hash", hashp), ("storage", storage), ("reference", reference), ("chains", chains), ("tokens", tokens), ("safe", safe), ("eip712", eip712), ("calldiff", calldiff), ("verify", verify), ("gas-history", gashist), ("bridge", bridge), ("approvals", approvals), ("ens-bulk", ensbulk), ("solana-tx", solana), ("psbt", psbt), ("labels", labels), ("vanity", vanity), ("price-impact", pimpact), ("mev", mev), ("stablecoins", stables), ("rpc-health", rpch)]:
        check(n, f)
    b.close()
json.dump(results, open("/tmp/e2e-results.json", "w"), indent=1)
print(sum(1 for r in results if r[1] == "PASS"), "/", len(results), "passed")
sys.exit(0 if all(r[1] == "PASS" for r in results) else 1)
