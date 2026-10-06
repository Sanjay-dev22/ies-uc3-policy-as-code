# Policy as Code: a publication envelope for `IES_Policy`

This note proposes one additive object, `publication`, carried alongside the existing `IES_Policy` schema without changing it. It records who published a tariff, in what currency, and which earlier version it replaces, and the whole thing is signed so none of that can be altered quietly. It also asks IES to settle two calculation questions the schema doesn't currently answer. Both change the computed bill, with real numbers to show it.

Reference implementation: **[this repository](README.md)**. This builds on IES's existing draft, **[Policy as Code / Tariff Intelligence, IES/TI-PROFILE/0.5](https://india-energy-stack.gitbook.io/docs/draft-work-in-progress/tariff-intelligence)**, and its **[Implementation Guide](https://india-energy-stack.gitbook.io/docs/draft-work-in-progress/tariff-intelligence/tariff-intelligence)**.

| Field | Value |
|---|---|
| Applicability | Any SERC, DISCOM or system that publishes or consumes an `IES_Policy` (Policy as Code, sub-use-case Tariff Intelligence) |
| This version | Proposes one additive `publication` object carried alongside `IES_Policy`, and asks IES to settle two calculation questions. It changes no field inside `IES_Policy`, `EnergySlab` or `SurchargeTariff`. It does not cover `DISPATCH_GUIDE` or any other policy type. |

---

## Decisions

*Reviewers are asked to agree or amend the following. A, B and D are small and self-contained; C, E and F are questions where IES's own direction should decide.*

**Status of these decisions:** Proposed — under review

| # | Decision | Detail | State |
|---|---|---|---|
| A | Carry publisher, proof, currency and predecessor in a sibling `publication` object | Leave `IES_Policy` untouched. Add `{ issuer, issuedAt, replaces, currency, proof }` beside it. This is the "publication metadata" treatment §8.4 of the overview already points to, given a concrete shape. | Proposed |
| B | The signature covers the whole envelope | Sign the policy, the publication metadata and the proof options together (everything except the signature value). Signing the policy alone leaves `currency` and `replaces` editable without breaking the signature. A party that re-publishes a signed policy inline embeds the whole envelope unchanged, so it stays valid there. | Proposed |
| C | Declare currency once per policy, in the envelope | One ISO 4217 code in `publication.currency`, not a field on every slab, since one tariff does not mix currencies. §8.4 says "a future schema should make currency explicit"; if IES prefers that as a schema field, this becomes interim carriage. | Proposed; see §11.3 |
| D | `publication.replaces` holds the prior version's `id` | Not the `policyID`, which stays constant across amendments. `null` on first publication. Matches the amendment convention already named in §11 of the overview. | Proposed |
| E | State what a `PERCENT` surcharge is a percentage of | The profile should say which reading applies. Which one is for the authorities and existing tariff practice to determine; this note does not claim to know it. | Deferred to §11.1 |
| F | State the slab boundary convention | The profile should say how `start` and `end` are read, or restate the example so its boundaries meet. | Deferred to §11.2 |

---

## 1. Scope and Purpose

The stakeholders here are the authority that publishes a tariff (a SERC, or a DISCOM re-publishing one) and every system that has to bill from it or check it afterward: DISCOM billing engines, consumer apps, meters.

IES's draft already describes publishing a tariff as signed, machine-readable `IES_Policy`, in place of a PDF each DISCOM currently re-keys. Two things are missing from that picture, and this proposal addresses both.

The first gap is that the schema has no home for who published a policy, in what currency, or which version it amends. This isn't something found from outside; IES's own overview says so directly. Section 8.4, "Fields Not Present in the Current Upstream Policy Object," lists each one this way (table cells quoted exactly, column "Concept Used by This Page" to "Current Upstream Status" to "Treatment"):

- *Publisher / issuer DID* → "No `issuer` field in `IES_Policy`" → "Resolve the signer from the signed publication/exchange envelope"
- *Cryptographic `proof`* → "No W3C VC proof block in `IES_Policy`" → "Verify the Beckn/catalogue or dataset-envelope signature; do not insert an ungoverned proof field"
- *Prior-version `replaces` link* → "No such field in the current source" → "Carry as publication metadata until a governed upstream field exists"
- *Currency for `EnergySlab.price`* → "No slab-level currency/unit field" → "The profile assumes the authority's tariff context; a future schema should make currency explicit"

Section 11 of the overview adds: "Amendment convention — new `id`, same `policyID`, explicit `replaces` link — to be formalised." The Implementation Guide's "Open Items" make the same point in slightly different words, and the overview still carries a "🚧 Work in progress" tag on the whole use case.

None of this is a gap this note claims to have found first. What follows is one concrete, tested design for the publication metadata IES's own treatment column already points toward (Decisions A–D).

The second gap only surfaced while actually building a billing evaluator against the schema and its official example: two calculation questions the schema never answers (§11.1 and §11.2). Two implementations that both follow the schema correctly can still compute different bills for the same customer, because the schema's semantics leave room for more than one reading. A core aim of Policy as Code is that independent systems reading the same signed policy reach the same number; that aim isn't automatic just because the format is machine-readable.

## 2. What It Records / Covers

| Records | Detail | Source |
|---|---|---|
| Publisher | `publication.issuer` — the `did:web` identifier of the publishing authority | Proposed; W3C DID Core |
| Issue time | `publication.issuedAt` — when this envelope was issued | Proposed; ISO 8601 |
| Predecessor | `publication.replaces` — `id` of the version this amends, or `null` | Proposed |
| Currency | `publication.currency` — ISO 4217 code for every price in the policy | Proposed; ISO 4217 |
| Proof | `publication.proof` — signature scheme, key reference, creation time, purpose, signature value | Proposed; modelled on W3C Data Integrity |
| The policy itself | `policy` — the upstream `IES_Policy`, byte-for-byte unchanged | Existing `IES_Policy` |

The envelope does not carry the tariff's rates, slabs or surcharges. Those stay in `IES_Policy`, and no policy type other than the one it wraps is covered here.

## 3. How Each Item is Identified

Identifier patterns are IES's existing ones. Nothing new is invented.

| Subject | Identifier method | Example |
|---|---|---|
| Publisher | `did:web` on a domain the authority owns | `did:web:ies.serc.example` |
| Signing key | DID URL into the publisher's DID document | `did:web:ies.serc.example#key-1` |
| Policy (stable handle) | `policyID`, issuer-minted, unchanged by amendment | `RES-T1` |
| Policy (version) | `id`, unique per version | `urn:ies:policy:serc:RES-T1:2026-04` |
| Version being replaced | that earlier version's `id`, in `publication.replaces` | `urn:ies:policy:serc:RES-T1:2025-04` |

Apart from the signing-key row, these examples are the ones already in §3 of the overview.

## 4. Definitions

- **Publication envelope** — proposed term: the `{ policy, publication }` wrapper defined here. Proposed addition to the glossary.
- **Canonical form** — the single byte sequence a JSON object is reduced to before signing (sorted keys, no insignificant whitespace), so the same data always signs and verifies identically.
- **Blended rate** — proposed term: total energy charge for the period divided by total kWh. Used only in §11.1.
- **Marginal slab rate** — proposed term: the price of the slab a given kWh falls in. Used only in §11.1.

`did:web`, `policyID`, `id`, slab and surcharge are as defined in the overview and the IES glossary.

## 5. Basis of Standards

Fixed order of preference: **IS → CEA Regulations / IEGC → IEC → IEEE**. None applies here: tariffs are SERC instruments, and no IS covers the signed publication of one. The technical basis is:

| Standard or regulation | Role here |
|---|---|
| W3C DID Core (`did:web`) | Publisher identity; the verification key is resolved from the DID document, never taken from the envelope |
| W3C Data Integrity (`eddsa-jcs-2022`) | The model for a proof over a JSON-canonicalised document. The reference implementation uses a simplified form (see §11.5) and does not claim conformance |
| RFC 8785 (JSON Canonicalization Scheme) | The reference implementation's canonicalisation is a subset of it, sufficient for the shapes used |
| RFC 8032 (Ed25519) | Signature algorithm |
| ISO 4217 | Currency codes |
| ISO 8601 | Timestamps |
| Beckn Protocol v2 | Transport; the envelope rides inside the existing `DatasetItem` |

Checked against the published [IES term taxonomy](https://github.com/India-Energy-Stack/ies-accelerator/blob/main/schemas-ies/taxonomy.md): `issuer`, `proof`, `proof.proofPurpose` and `proof.verificationMethod` reuse IES's own `ElectricityCredential` schema, whose `proof` block requires the same five field names. One differs in shape, not name: `ElectricityCredential.issuer` is an object (`{ id, name }`, a Verifiable Credential convention); this envelope isn't a VC, so `publication.issuer` is a bare `did:web` string, resolved the same way. `replaces` and `policyID`/`policyType` don't appear in the taxonomy because `policyID`/`policyType` belong to the existing `IES_Policy` schema, and `replaces` is the new term Decision D proposes.

## 6. Where Indian Standards Do Not Yet Exist

No IS or CEA instrument covers the signed publication of a tariff. The shape of the envelope is therefore an IES decision, the same way the shape of `IES_Policy` itself is (§6 of the overview). International standards are used in its place.

## 7. The Record(s)

| Record | Schedule | Nature | Status |
|---|---|---|---|
| Publication envelope | I | Stays the same for a given policy version; an amendment is a new envelope | Executable today in the reference implementation; JSON Schema provided (Annexure C) |

## 8. Schedule I — Static Fields of the Publication Envelope

*Fixed when the envelope is issued; they change only when a corrected envelope is issued.*

| **Normative Path** | **Type** | **Schema Requires** | **Standard** *(informative)* | **Profile Guidance** *(informative)* |
|---|---|---|---|---|
| `policy` | object | Required; `@type` must be `IES_Policy` | Upstream `IES_Policy` | Unmodified upstream object |
| `publication.issuer` | string, `did:web:…` | Required | W3C DID Core | Publisher's DID |
| `publication.issuedAt` | date-time | Required | ISO 8601 | Time of issue |
| `publication.replaces` | string or null | Required (null allowed) | — | `id` of the amended version |
| `publication.currency` | string, three capitals | Required | ISO 4217 | Currency of every price in `policy` |
| `publication.proof.type` | string | Required | — | Scheme label |
| `publication.proof.verificationMethod` | string, DID URL | Required | W3C DID Core | Key inside the issuer's DID document |
| `publication.proof.created` | date-time | Required | ISO 8601 | Time the proof was made |
| `publication.proof.proofPurpose` | constant `assertionMethod` | Required | W3C Data Integrity | — |
| `publication.proof.proofValue` | base64 string | Required | RFC 8032 | Signature over everything else (Decision B) |

`issuedAt` and `proof.created` are two different facts and can differ: `issuedAt` is when the publisher declares the policy effective for publication; `proof.created` is when the signature itself was generated. The reference implementation sets them identically because it signs at the moment of authoring, but a real system could sign later than the stated effective date, and a verifier should not assume the two are interchangeable.

### 8.1 Example and Validation

A signed example is generated by `npm run author` (Annexure B). It is validated structurally against `schema/publication.schema.json`, and semantically by verifying the signature against the issuer's DID document. Both checks run inside `npm test`.

## 9. Schedule II

> **Not applicable.** An envelope is fixed at issuance. Slabs and surcharges change only by amendment, which is a new policy `id` in a new envelope. Nothing in this record keeps arriving after issuance.

## 10. How It Fits Together

```
SERC ──► IES_Policy ──► signs { policy + publication } ──► DatasetItem (Beckn) ──► DISCOM / app / meter
                                                                          │
                              verify: resolve issuer's did:web ──► key ──► check signature over the whole envelope
                              then: evaluate the policy (slabs, then time-of-day surcharges)
```

On the wire, the reference implementation puts the `policy` member in the `DatasetItem`'s `performanceAttributes.dataPayload`, matching the official example, and the `publication` member sits beside it as `iesPublication`. That name was chosen to stay distinct among the many schemas that populate the same field (§11.6 asks whether that's the right choice). A receiver rebuilds the envelope from those two members to verify it.

### 10.1 Why sign the envelope, when the transport already signs the message?

Beckn/IES already authenticates the message in transit: it confirms a given `DatasetItem` came from an authenticated exchange between known parties. That answers "did this arrive through a channel I trust," not "is this exact policy, with this exact currency and amendment link, what the named issuer actually signed." The envelope's own proof answers the second question, and keeps answering it after the artifact leaves the original exchange, for example once a DISCOM has stored it, copied it into its own catalogue, or handed it to a billing engine days later with no transport session left to check. Transport authenticity and artifact authenticity are different guarantees; this proposal only replaces the second one.

## 11. Points for Confirmation

1. **What is a `PERCENT` surcharge a percentage of?** The schema defines `SurchargeTariff.value` only as "The adjustment value (percentage or absolute)," and the overview says a billing system's job "collapses to a small evaluator: find the slab, find the matching ToD surcharge, apply." Neither states the base. Two readings are both consistent with the text: **(a)** the rate of the slab each surcharged kWh falls in, **(b)** the period's blended average rate. On the official example tariff (slabs ₹4.50 / ₹7.20 / ₹9.80; +20% 18:00–22:00; −10% 23:00–05:00) and a 350 kWh month (`test/fixtures/usage-normal.json`; run `npm run demo:ambiguity`):

   | | Base energy charge | Surcharges | Bill |
   |---|---|---|---|
   | Reading (a) | ₹2,380.00 | ₹94.40 | **₹2,474.40** |
   | Reading (b) | ₹2,380.00 | ₹54.40 | **₹2,434.40** |

   Same policy, same usage, a ₹40.00 difference. Reading (a) also needs an ordering assumption the schema doesn't state, that energy accrues in time order so slabs fill chronologically. This illustrates the ambiguity; it isn't a claim about what any DISCOM or vendor actually does, and the reference implementation only adopts (b) because an evaluator has to pick one. The authorities are better placed to decide which reading is correct, informed by how SERC tariff orders are actually applied. Until that's settled, no system can claim identical bills across implementations for a policy that mixes slabs with percentage surcharges.

2. **Where do slab boundaries fall?** The schema says `start` is "Energy consumption start point (inclusive) in kWh" and `end` is "Energy consumption end point (exclusive) in kWh." The official example (`devkits/data-exchange/uc3-tariff-policy`) writes slabs `0–100`, `101–300`, `301–null`. Read literally, energy from 100 up to but not including 101 kWh falls in no slab at all. Read the way a printed tariff order reads (first 100 units, next 200, the rest), it's unambiguous, but that reading isn't the schema's own. The effect is real and measurable: taking `end` as strictly exclusive leaves one unit per period unbilled every time a slab boundary is crossed; computing a slab's span as `end − start + 1` to compensate instead over-corrects, double-counting that same unit, which on a 400 kWh month changes the bill to ₹2,864.70 instead of ₹2,870.00 under the everyday reading. The reference implementation reads a slab as covering energy from `start − 1` up to `end`, matching that everyday reading, and is tested at 100, 101 and 100.5 kWh, the specific values where a wrong reading would show up. This one is IES's call; nothing else is blocked by it.

3. **Envelope field or schema field for currency?** Decision C carries currency in the envelope. §8.4 suggests a schema field eventually. Which does IES prefer, and should a per-slab unit also be allowed?

4. **Should `replaces` also be expressible before the schema governs it?** Decision D uses the envelope; §8.4 says "Carry as publication metadata until a governed upstream field exists." Confirm this is the intended interim. This proposal does not yet state a constraint on what a valid `replaces` target is; the reasonable rule is that it should name a prior version sharing the same `policyID` and the same `issuer`, not an arbitrary `id`, which Decision D's own worked example already assumes but doesn't say outright.

5. **Which proof suite?** The reference implementation signs `{ policy, publication }` with Ed25519 over a JSON-canonicalised form and labels it `Ed25519-JCS-envelope`. It's modelled on the W3C `eddsa-jcs-2022` Data Integrity suite but isn't conformant to it (base64 rather than multibase, and a simplified canonicaliser). A production design should use a standard suite. Which one?

6. **Where does the envelope sit in `DatasetItem`?** `performanceAttributes.iesPublication` was chosen here. The `DatasetItem` owners should confirm the name and location, or say where it actually belongs.

7. **Key resolution and rotation.** The reference implementation resolves the issuer's DID from a local file and checks only the current key. Fetching `https://<domain>/.well-known/did.json`, key rotation, and revocation are all out of scope so far. Note also what a valid signature does and doesn't establish: it proves the holder of a given private key signed this exact envelope, not that the matching DID is the legally authorised tariff-setting authority. That second fact is a governance question, outside what any proof block can certify on its own.

---

## Schemas Used in This Use Case

| Schema | Role |
|---|---|
| `IES_Policy`, `EnergySlab`, `SurchargeTariff` (upstream, unchanged) | The policy itself |
| `DatasetItem` (unchanged) | The Beckn carrier |
| Publication envelope (proposed) | `schema/publication.schema.json` in this repository |

## Value Unlock

A system that consumes a policy can check who published it and confirm that no price, currency or amendment link has been altered, using only the publisher's DID document. An authority can amend a tariff as a new signed envelope that names the version it replaces, instead of inventing its own convention. And implementers get the two calculation questions below answered once, in the profile, rather than each quietly choosing an answer on their own.

---

## Annexure A — Standards Referenced

| Standard | Scope |
|---|---|
| W3C DID Core | `did:web` identity and key resolution |
| W3C Data Integrity, `eddsa-jcs-2022` | Model for the proof; not claimed as conformed to |
| RFC 8785 | JSON canonicalisation (subset used) |
| RFC 8032 | Ed25519 |
| ISO 4217, ISO 8601 | Currency codes, timestamps |
| Beckn Protocol v2 | Transport |

## Annexure B — Example Payloads

`npm run author` writes `policies/mumbai-res-tariff.signed.json`. The `policy` member matches the `IES_Policy` in the devkit's `uc3-tariff-policy/examples/on-status-response-ready-inline.json` field for field, apart from `modificationDateTime`. Its rates are IES's own sample values (sample regulator "MERC," sample discom "MeraShehar," per the devkit README) and haven't been checked against any real tariff order. The envelope member looks like this:

```json
"publication": {
  "issuer": "did:web:ies.merc.example",
  "issuedAt": "2026-10-05T17:33:07.637Z",
  "replaces": null,
  "currency": "INR",
  "proof": {
    "type": "Ed25519-JCS-envelope",
    "verificationMethod": "did:web:ies.merc.example#key-1",
    "created": "2026-10-05T17:33:07.637Z",
    "proofPurpose": "assertionMethod",
    "proofValue": "t8qJFgP9CMlUaxkP3YaE/3KcUv0RmNlerIVQiAr+/yTVlfaJP93p9tZGOk6IXWwUsiBqdam2vK3VRQJxIcd7CQ=="
  }
}
```

The signing key is a locally generated test key standing in for a SERC's real `did:web` key. Nothing here carries any real-world authority.

## Annexure C — JSON Schema and Verification

Schema: `schema/publication.schema.json`. From a fresh clone: `npm run keygen && npm run author && npm test` (Node 18+, Python 3). In order, `npm test` runs: signature verification; conformance to the schema above, including rejection of a malformed currency; five tamper checks that must each be rejected (slab price, currency, `replaces`, `issuedAt`, wrong key); and six billing scenarios through two independently written evaluators, Node and Python, which must agree with each other and with totals computed by hand. `npm run demo:ambiguity` reproduces the table in §11.1.

**What has been exercised against the live IES/Beckn devkit sandbox.** A discover → confirm → status round trip was run against the real, live `beckn/DEG` devkit sandbox, with the envelope carried in the `DatasetItem` and the placeholder `sandbox-bpp` replaced by this repository's own webhook server, inside a disposable clone kept isolated from this repository. The full round trip completed and confirmed, independently, that:
- the delivered object recomputes to the identical bill, ₹2,434.4, as the local offline test suite;
- `verifyEnvelope()` returns `{ valid: true }` when checking the signature actually carried over the real network against the resolved `did:web` key, which is what shows the envelope-wide signature (Decision B) survives a genuine transit and not just local round-tripping;
- onix-bap's own schema validator, code this project did not write, independently logged `"Validation passed for @type: IES_Policy"` against the live payload.

This is reproducible with `sandbox-reproduction/README.md`. Nothing has been registered in a real IES registry, and steps 2 and 8–9 of the Implementation Guide's checklist remain out of scope.

## Annexure D — Derived Views

| Derived view | Inputs | Schema status | Treatment |
|---|---|---|---|
| Bill-calculation trace | usage quantities, selected slab, time-of-day adjustment | Derived | Produced by the reference evaluators; not exchanged |
| Reading (a) versus reading (b) comparison | the same policy and usage under each reading | Derived | Produced by `test/ambiguity-demo.js`; illustrative only |
