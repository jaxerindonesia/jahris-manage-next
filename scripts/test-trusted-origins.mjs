import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  fs.readFileSync(new URL("../lib/security/origin.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText;
const env = {
  NEXTAUTH_URL: "https://hr.example.com",
  TRUSTED_ORIGINS:
    "http://localhost:3000, http://127.0.0.1:3000,http://192.168.18.10:3000",
};
const context = { exports: {}, process: { env }, URL, Set };
vm.runInNewContext(source, context);
const { isTrustedOrigin, isStateChangingRequest } = context.exports;
const check = (headers) =>
  isTrustedOrigin({
    nextUrl: { origin: "http://0.0.0.0:3000" },
    headers: new Headers(headers),
  });

for (const origin of [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://192.168.18.10:3000",
  "https://hr.example.com",
]) {
  assert.equal(check({ origin }), true, origin);
  assert.equal(check({ referer: `${origin}/branches` }), true, origin);
}
for (const origin of [
  "https://untrusted.example",
  "http://localhost:3001",
  "http://localhost.evil.example:3000",
  "null",
  "invalid",
]) {
  assert.equal(check({ origin }), false, origin);
}
assert.equal(check({}), false);
assert.equal(
  check({ origin: "https://untrusted.example", referer: "http://localhost:3000" }),
  false,
);
delete env.TRUSTED_ORIGINS;
assert.equal(check({ origin: "http://localhost:3000" }), false);
assert.equal(check({ origin: "https://hr.example.com" }), true);
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assert.equal(isStateChangingRequest(method), true);
}
assert.equal(isStateChangingRequest("GET"), false);
console.log("Trusted origin checks passed.");
