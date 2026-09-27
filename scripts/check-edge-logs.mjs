#!/usr/bin/env node
// Finds edge-function log lines that could leak personal data.
// Usage: node scripts/check-edge-logs.mjs     (exit code 1 if anything is found)
//
// Checks every console.log/error/warn/info call and our JSON loggers
// (log({...}), logStep(...)) in supabase/functions. String literals, object
// keys and values wrapped in redact(), maskEmail() or providerError() (see
// supabase/functions/_shared/safe-log.ts) are fine. Any other value whose
// name suggests personal data or a raw error/response body is reported.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "supabase/functions");
const CALL_RE = /\b(console\.(?:log|error|warn|info)|log|logStep)\s*\(/g;
const SAFE_CALLS = ["redact", "maskEmail", "providerError"];

// A value is risky if any part of its name matches one of these.
const RISKY = /^(email|emails|to|recipient|recipients|phone|phone_number|name|first_name|last_name|full_name|note|notes|text|body|detail|details|address|address_private|token|secret|password|subject|message|content|caption|question|answer|payload|err|error|e|res|response|result|data|json|profile|user|customer|session|req|request|webhook|event|headers)$/i;
// Parts of a name that mark it risky too (emailResponse, notifError, ...).
const RISKY_STEM = /(email|phone|response|payload|address|(^|_)token$|secret|password|detail|body|err$|error$)/i;
// Exact expressions known to be safe (constants, booleans).
// tokenBody: only Object.keys(tokenBody) (field names) is logged.
const ALLOW = new Set(["tool.name", "body?.backfill", "email_action_type", "tokenBody"]);
// ...unless the chain ends in one of these (ids, counts, statuses, codes).
const SAFE_LAST = /^(id|ids|userId|user_id|status|statusCode|code|type|kind|length|count|size|total|sent|ok|mode|step|action|attempt|ms|name_count)$/;

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith(".ts")) files.push(p);
  }
};
walk(ROOT);

/** The argument text of the call starting at `open` (index of "("). */
const argsAt = (src, open) => {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return src.slice(open + 1);
};

/** Removes string/template literal text, safe wrapper calls and object keys. */
const strip = (args) => {
  let s = args;
  // Template literals: keep only ${...} expressions.
  s = s.replace(/`(?:[^`\\]|\\.)*`/g, (m) => (m.match(/\$\{[^}]*\}/g) ?? []).map((x) => x.slice(2, -1)).join(" , "));
  s = s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, " ");
  for (const fn of SAFE_CALLS) {
    let idx;
    while ((idx = s.search(new RegExp(`\\b${fn}\\s*\\(`))) !== -1) {
      const open = s.indexOf("(", idx);
      const inner = argsAt(s, open);
      s = s.slice(0, idx) + " " + s.slice(open + inner.length + 2);
    }
  }
  s = s.replace(/\b[A-Za-z_]\w*\s*:(?!:)/g, " "); // object keys
  return s;
};

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  let m;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(src))) {
    const callee = m[1];
    // `log(` / `logStep(` only when it's our logger call, not e.g. a definition.
    const before = src.slice(Math.max(0, m.index - 20), m.index);
    if (callee !== "log" && callee !== "logStep" ? false : /(const|function|=>|\.)\s*$/.test(before)) continue;
    const open = m.index + m[0].length - 1;
    const args = argsAt(src, open);
    if (callee === "log" && !args.trim().startsWith("{")) continue;
    const rest = strip(args);
    const chains = rest.match(/[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*/g) ?? [];
    const risky = chains.filter((chain) => {
      const parts = chain.split(/\??\./);
      const last = parts[parts.length - 1];
      if (SAFE_LAST.test(last)) return false;
      if (["JSON", "Object", "String", "Number", "Math", "Date", "new", "true", "false", "null", "undefined", "Boolean", "Array"].includes(parts[0])) {
        return parts[0] === "JSON" && last === "stringify" && !/\{\s*fn\s*:/.test(args);
      }
      if (ALLOW.has(chain)) return false;
      return parts.some((p) => RISKY.test(p) || RISKY_STEM.test(p));
    });
    if (risky.length) {
      const line = src.slice(0, m.index).split("\n").length;
      findings.push(`${path.relative(process.cwd(), file)}:${line}  ${[...new Set(risky)].join(", ")}`);
    }
  }
}

if (findings.length) {
  console.log(`Risky log values (${findings.length}):`);
  for (const f of findings) console.log("  " + f);
  console.log("\nWrap them in redact(), maskEmail() or providerError() from supabase/functions/_shared/safe-log.ts, or log an id/status instead.");
  process.exit(1);
}
console.log(`OK: no risky log values in ${files.length} edge function files.`);
