// Policy-authoring + signing logic. Used both as a library (by
// sandbox-reproduction/webhook-server/server.js, the live BPP webhook that
// builds + signs on every incoming `status` request from inside the running
// sandbox) and, below, as a CLI (`npm run author`) that writes the same
// two files to disk so they can be opened and compared by hand. One file,
// one code path either way -- the live webhook isn't running a copy of this.
import { sign } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canonicalize } from "./canonicalize.js";

// The IES_Policy object itself (schema-conformant, field-for-field matching
// the devkit's own uc3-tariff-policy/examples/on-status-response-ready-inline.json,
// apart from modificationDateTime; see PROPOSAL.md, Annexure B).
export function buildPolicy(now = new Date()) {
  return {
    "@context": "https://raw.githubusercontent.com/beckn/DEG/ies-specs/specification/external/schema/ies/core/context.jsonld",
    "@type": "IES_Policy",
    id: "policy-mumbai-res-001",
    objectType: "POLICY",
    createdDateTime: "2024-04-10T11:00:00Z",
    modificationDateTime: now.toISOString(), // reflects when THIS response was generated
    programID: "program-merashehar-001",
    policyID: "MUM-RES-T1",
    policyName: "Mumbai Residential Telescopic 2024",
    policyType: "TARIFF",
    samplingInterval: "R/2024-04-10T00:00:00Z/P1M",
    energySlabs: [
      { id: "slab-0-100", "@type": "EnergySlab", start: 0, end: 100, price: 4.5 },
      { id: "slab-101-300", "@type": "EnergySlab", start: 101, end: 300, price: 7.2 },
      { id: "slab-301-plus", "@type": "EnergySlab", start: 301, end: null, price: 9.8 }
    ],
    surchargeTariffs: [
      {
        id: "surcharge-evening-peak",
        "@type": "SurchargeTariff",
        recurrence: "P1D",
        interval: { start: "T18:00:00Z", duration: "PT4H" },
        value: 20,
        unit: "PERCENT"
      },
      {
        id: "discount-night-offpeak",
        "@type": "SurchargeTariff",
        recurrence: "P1D",
        interval: { start: "T23:00:00Z", duration: "PT6H" },
        value: -10,
        unit: "PERCENT"
      }
    ]
  };
}

// Signs `policy` with `privateKeyPem` and returns the full publication
// envelope (see PROPOSAL.md for why this shape, not a core-schema
// change, is how we address the "no issuer/proof field" gap).
// The signature covers the WHOLE envelope except the signature value itself:
// the policy, the publication metadata (issuer, issuedAt, replaces, currency)
// and the proof options (type, verificationMethod, created, proofPurpose).
// Signing `policy` alone would leave `currency` and `replaces` editable
// without breaking the signature -- a currency flip from INR to USD would
// still verify.
export function signPolicy(policy, privateKeyPem, issuer, now = new Date(), { replaces = null, currency = "INR" } = {}) {
  const publication = {
    issuer,
    issuedAt: now.toISOString(),
    replaces,
    currency,
    proof: {
      type: "Ed25519-JCS-envelope",
      verificationMethod: `${issuer}#key-1`,
      created: now.toISOString(),
      proofPurpose: "assertionMethod"
    }
  };
  const canonicalBytes = Buffer.from(canonicalize({ policy, publication }), "utf-8");
  const signature = sign(null, canonicalBytes, privateKeyPem);
  return {
    policy,
    publication: { ...publication, proof: { ...publication.proof, proofValue: signature.toString("base64") } }
  };
}

export function buildSignedPolicy(privateKeyPem, issuer) {
  const now = new Date();
  const policy = buildPolicy(now);
  return signPolicy(policy, privateKeyPem, issuer, now);
}

// CLI entry point: `node src/policyEngine.js` (npm run author).
// Authors the raw IES_Policy object, writes it to disk UNSIGNED, then signs
// that exact object and writes the signed publication envelope alongside
// it. Both files stay on disk afterward -- open them side by side to see
// exactly what signing added: nothing inside `policy` changes; a
// `publication` object (issuer, timestamp, currency, replaces, proof) is
// added around it. The live webhook runs the same two steps via
// buildSignedPolicy() above, just without writing the intermediate files.
if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  const POLICIES_DIR = new URL("../policies/", import.meta.url);
  const KEYS_DIR = new URL("../keys/", import.meta.url);
  mkdirSync(POLICIES_DIR, { recursive: true });

  const ISSUER = "did:web:ies.merc.example";
  const privateKeyPem = readFileSync(new URL("private.pem", KEYS_DIR));

  // Step 1 -- author the raw policy: exactly the SERC's own IES_Policy
  // object, matching the official schema field-for-field. No signature, no
  // issuer, nothing added yet. This file is never sent anywhere on its own;
  // it's here so you can diff it against the signed version below.
  const now = new Date();
  const policy = buildPolicy(now);
  writeFileSync(
    new URL("mumbai-res-tariff.raw.json", POLICIES_DIR),
    JSON.stringify(policy, null, 2)
  );
  console.log("1. Authored (unsigned): policies/mumbai-res-tariff.raw.json");
  console.log("   policyID:", policy.policyID, " id:", policy.id);

  // Step 2 -- sign it. This wraps the SAME object above, byte-for-byte, in a
  // `publication` envelope carrying who signed it, and a signature computed
  // over the policy and that publication metadata together.
  const envelope = signPolicy(policy, privateKeyPem, ISSUER, now);
  writeFileSync(
    new URL("mumbai-res-tariff.signed.json", POLICIES_DIR),
    JSON.stringify(envelope, null, 2)
  );
  console.log("2. Signed:              policies/mumbai-res-tariff.signed.json");
  console.log("   issuer:  ", envelope.publication.issuer);
  console.log("   proof:   ", envelope.publication.proof.type, "over the canonicalized policy + publication metadata");
  console.log("");
  console.log("Both files remain on disk: the .raw.json is what the SERC's own");
  console.log("system produces; the .signed.json is what actually gets published");
  console.log("over the network. The raw file itself is never transmitted.");
}
