// Small UI helpers. Built by Blockchain Lab — https://blockchainlab.com
export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const params = new URLSearchParams(location.search);
export function busy(el, msg = "Working…") { el.innerHTML = `<p class="mut">${esc(msg)}</p>`; }
export function fail(el, e) { console.error(e); el.innerHTML = `<p class="err">Error: ${esc(e?.shortMessage || e?.message || e)}</p>`; }
export function kv(obj) { return `<table>${Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `<tr><th>${esc(k)}</th><td class="mono">${v}</td></tr>`).join("")}</table>`; }
export function table(rows, cols) { return `<table><thead><tr>${cols.map(c => `<th>${esc(c[0])}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
export const json = (o) => JSON.stringify(o, (k, v) => typeof v === "bigint" ? v.toString() : v, 2);
export function on(id, fn) { const el = document.getElementById(id); el.addEventListener("click", fn); return el; }
