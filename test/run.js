// End-to-end proof for UC3 (Policy as Code): verify a signed IES_Policy, then
// run TWO INDEPENDENT billing evaluators — src/evaluator.js (Node) and
// evaluator.py (Python) — against identical usage data and confirm they
// produce identical bills. This is the exact claim the docs make about
// Tariff Intelligence: "multiple billing systems running the same Policy Pack
// produce identical results." It also exercises the specific edge cases the
// official implementation checklist calls out (Implementation Guide, Checklist
// step 7): open-ended top slab, surcharge-window wrap-around, percent vs
// absolute adders. The two evaluators could still agree on a shared wrong
// answer, so every scenario also carries a hand-computed expectedTotal to
// check against.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeBill } from "../src/evaluator.js";
import { verifyEnvelope } from "../src/verifyPolicy.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POLICIES = path.join(ROOT, "policies");
const FIXTURES = path.join(ROOT, "test", "fixtures");
const KEYS = path.join(ROOT, "keys");
const PY_EVALUATOR = path.join(ROOT, "evaluator.py");

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}

console.log("=== Step 0: signed policy exists? ===");
const signedPolicyPath = path.join(POLICIES, "mumbai-res-tariff.signed.json");
if (!existsSync(signedPolicyPath)) {
  console.error("Missing policies/mumbai-res-tariff.signed.json");
  console.error("Run first:  npm run keygen && npm run author");
  process.exit(1);
}

console.log("=== Step 1: verify signature against issuer's did:web document ===");
const envelope = loadJson(signedPolicyPath);
const did = loadJson(path.join(KEYS, "did.json"));
const verification = verifyEnvelope(envelope, did);
if (!verification.valid) {
  console.error(`Signature verification FAILED: ${verification.reason}`);
  process.exit(1);
}
console.log(`PASS  ${envelope.policy.policyID} signature verified against ${did.id}\n`);

console.log("=== Step 1a: signed envelope conforms to schema/publication.schema.json ===");
{
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(loadJson(path.join(ROOT, "schema", "publication.schema.json")));
  if (!validate(envelope)) {
    console.error("FAIL  envelope does not conform:", JSON.stringify(validate.errors, null, 2));
    process.exit(1);
  }
  const bad = JSON.parse(JSON.stringify(envelope));
  bad.publication.currency = "rupees";
  if (validate(bad)) { console.error("FAIL  schema accepted an invalid currency code"); process.exit(1); }
  console.log("PASS  signed envelope conforms; a malformed currency ('rupees') is rejected\n");
}

console.log("=== Step 1b: tamper checks — each altered copy must FAIL verification ===");
let tamperOk = true;
const clone = () => JSON.parse(JSON.stringify(envelope));
const mustFail = (label, mutate, didDoc = did) => {
  const copy = clone();
  mutate(copy);
  const r = verifyEnvelope(copy, didDoc);
  console.log(`  ${r.valid ? "FAIL (accepted a tampered copy!)" : "PASS"}  ${label}${r.valid ? "" : " -> rejected"}`);
  if (r.valid) tamperOk = false;
};
mustFail("slab price altered (4.5 -> 0.45)", (e) => { e.policy.energySlabs[0].price = 0.45; });
mustFail("currency altered (INR -> USD)", (e) => { e.publication.currency = "USD"; });
mustFail("replaces link altered (null -> another policy id)", (e) => { e.publication.replaces = "urn:ies:policy:other:1"; });
mustFail("issuedAt altered", (e) => { e.publication.issuedAt = "2020-01-01T00:00:00.000Z"; });
mustFail("signed by a different key claiming the same issuer", () => {}, (() => {
  const { publicKey } = generateKeyPairSync("ed25519");
  const other = JSON.parse(JSON.stringify(did));
  other.verificationMethod[0].publicKeyJwk = { ...publicKey.export({ format: "jwk" }), kid: "key-1" };
  return other;
})());
if (!tamperOk) { console.error("Tamper checks FAILED"); process.exit(1); }
console.log();

console.log("=== Step 2: run identical scenarios through Node + Python evaluators ===\n");

const scenarios = [
  {
    name: "Normal month: multi-slab allocation + evening surcharge + midnight-wrapping night discount",
    policyFile: signedPolicyPath,
    usageFile: path.join(FIXTURES, "usage-normal.json"),
    // 350 kWh: 100@4.5 + 200@7.2 + 50@9.8 = 2380 base, blended 6.80/kWh;
    // evening +20% on 60 kWh = +81.60; night -10% on 40 kWh = -27.20
    expectedTotal: 2434.4
  },
  {
    name: "Boundary: exactly 100 kWh (top of slab-0-100, no spillover)",
    policyFile: signedPolicyPath,
    usageFile: path.join(FIXTURES, "usage-boundary-100.json"),
    expectedTotal: 450 // 100 x 4.5
  },
  {
    name: "Open-ended top slab: 1000 kWh, well past slab-301-plus (end: null)",
    policyFile: signedPolicyPath,
    usageFile: path.join(FIXTURES, "usage-large.json"),
    expectedTotal: 8750 // 100 x 4.5 + 200 x 7.2 + 700 x 9.8
  },
  {
    name: "Absolute adder: INR_PER_KWH surcharge instead of PERCENT",
    policyFile: path.join(FIXTURES, "policy-inr-surcharge.json"),
    usageFile: path.join(FIXTURES, "usage-evening-only.json"),
    expectedTotal: 360 // 60 x 4.5 = 270 base + 60 x 1.50 INR/kWh adder = 90
  },
  {
    name: "Boundary: 101 kWh — the 101st unit belongs to slab-101-300",
    policyFile: signedPolicyPath,
    usageFile: path.join(FIXTURES, "usage-boundary-101.json"),
    expectedTotal: 457.2 // 100 x 4.5 + 1 x 7.2
  },
  {
    name: "Boundary: fractional 100.5 kWh straddling the slab-0-100 / slab-101-300 edge",
    policyFile: signedPolicyPath,
    usageFile: path.join(FIXTURES, "usage-fractional.json"),
    expectedTotal: 453.6 // 100 x 4.5 + 0.5 x 7.2
  }
];

let allPassed = true;

for (const scenario of scenarios) {
  const envelopeOrPolicy = loadJson(scenario.policyFile);
  const policy = envelopeOrPolicy.policy ?? envelopeOrPolicy;
  const usage = loadJson(scenario.usageFile);

  const nodeResult = computeBill(policy, usage);

  const pyRun = spawnSync("python", [PY_EVALUATOR, scenario.policyFile, scenario.usageFile], { encoding: "utf-8" });
  if (pyRun.status !== 0) {
    console.error(`Python evaluator failed for "${scenario.name}":\n${pyRun.stderr}`);
    allPassed = false;
    continue;
  }
  const pyResult = JSON.parse(pyRun.stdout);

  const fieldsMatch =
    nodeResult.total === pyResult.total &&
    nodeResult.baseCharge === pyResult.baseCharge &&
    JSON.stringify(nodeResult.slabBreakdown) === JSON.stringify(pyResult.slabBreakdown) &&
    JSON.stringify(nodeResult.surchargeBreakdown) === JSON.stringify(pyResult.surchargeBreakdown);

  console.log(`--- ${scenario.name} ---`);
  console.log(`  Node   total: Rs${nodeResult.total}`);
  console.log(`  Python total: Rs${pyResult.total}`);
  console.log(`  ${fieldsMatch ? "PASS — identical bill from both independent evaluators" : "FAIL — evaluators disagree"}`);
  if (!fieldsMatch) allPassed = false;
  const matchesExpected = nodeResult.total === scenario.expectedTotal;
  console.log(`  ${matchesExpected ? "PASS" : "FAIL"} — matches hand-computed expected total Rs${scenario.expectedTotal}`);
  if (!matchesExpected) allPassed = false;
  console.log();
}

console.log("=== Full audit trace, Node evaluator, first scenario ===");
const firstEnvelope = loadJson(scenarios[0].policyFile);
const firstUsage = loadJson(scenarios[0].usageFile);
const traceResult = computeBill(firstEnvelope.policy, firstUsage);
for (const line of traceResult.trace) console.log("  " + line);

console.log(`\n${allPassed ? "ALL SCENARIOS PASSED" : "SOME SCENARIOS FAILED"}`);
process.exit(allPassed ? 0 : 1);
