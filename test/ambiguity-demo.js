// Demonstrates Point for Confirmation 1 in PROPOSAL.md: the IES_Policy schema
// does not say what a PERCENT surcharge is a percentage OF, and the two
// defensible readings produce different bills for identical usage.
//
//   (a) marginal-slab reading — each surcharged kWh is adjusted by the rate of
//       the slab that particular kWh fell into.
//   (b) blended-rate reading — surcharged kWh are adjusted by the period's
//       average (blended) energy rate. This is what src/evaluator.js does.
//
// This script is an ILLUSTRATION of the ambiguity. It is not a claim about
// what any DISCOM or billing vendor actually does. Reading (a) additionally
// needs an ordering assumption — that energy accrues in time order through
// the billing period, so slabs fill chronologically — which the schema also
// does not state.
//
//   node test/ambiguity-demo.js [usage.json]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeBill, isInDailyWindow } from "../src/evaluator.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const policy = JSON.parse(readFileSync(path.join(ROOT, "policies", "mumbai-res-tariff.signed.json"), "utf-8")).policy;
const usagePath = process.argv[2] ?? path.join(ROOT, "test", "fixtures", "usage-normal.json");
const usage = JSON.parse(readFileSync(usagePath, "utf-8"));
const round2 = (n) => Math.round(n * 100) / 100;

const slabs = [...policy.energySlabs].sort((a, b) => a.start - b.start).map((s) => ({
  id: s.id,
  price: s.price,
  lower: Math.max(s.start - 1, 0), // same boundary convention as src/evaluator.js
  upper: s.end === null ? Infinity : s.end
}));

// Reading (b): the shipped evaluator.
const blended = computeBill(policy, usage);

// Reading (a): walk the intervals in time order; each interval's kWh occupies
// the next stretch of the cumulative-consumption axis, and every kWh in a
// surcharge window is adjusted at the price of the slab it sits in.
let cumulative = 0;
let surchargeA = 0;
const lines = [];
for (const iv of [...usage].sort((x, y) => new Date(x.startTime) - new Date(y.startTime))) {
  const from = cumulative;
  const to = cumulative + iv.kWh;
  cumulative = to;
  for (const s of policy.surchargeTariffs ?? []) {
    if (!isInDailyWindow(iv.startTime, s.interval)) continue;
    let amount = 0;
    if (s.unit === "INR_PER_KWH") {
      amount = iv.kWh * s.value;
    } else {
      for (const slab of slabs) {
        const overlap = Math.max(0, Math.min(to, slab.upper) - Math.max(from, slab.lower));
        amount += overlap * slab.price * (s.value / 100);
      }
    }
    surchargeA += amount;
    lines.push(`  ${s.id}: ${iv.kWh} kWh at cumulative ${from}-${to} kWh -> Rs${round2(amount)}`);
  }
}
const totalA = round2(blended.baseCharge + surchargeA);
const surchargeB = round2(blended.total - blended.baseCharge);

console.log(`Usage: ${path.basename(usagePath)}  (${blended.totalKwh} kWh total)`);
console.log(`Base energy charge (identical under both readings): Rs${blended.baseCharge}\n`);
console.log("Reading (a) — surcharge % applied to each kWh's own slab rate:");
for (const l of lines) console.log(l);
console.log(`  surcharges total Rs${round2(surchargeA)}  ->  bill Rs${totalA}\n`);
console.log(`Reading (b) — surcharge % applied to the blended average rate (Rs${round2(blended.baseCharge / blended.totalKwh)}/kWh):`);
console.log(`  surcharges total Rs${surchargeB}  ->  bill Rs${blended.total}\n`);
console.log(`Same policy, same usage, both schema-conformant: the bills differ by Rs${round2(Math.abs(totalA - blended.total))}.`);
