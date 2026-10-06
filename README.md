# UC3 — Policy as Code: publication envelope for `IES_Policy`

A schema proposal for India Energy Stack's Policy as Code use case
(Tariff Intelligence, `IES/TI-PROFILE/0.5`), with a working, tested reference
implementation.

**Read [`PROPOSAL.md`](PROPOSAL.md) first.** It is the actual proposal,
in IES's own concept-note format, with exact citations for every claim.

## What's real vs. what's a stand-in

`IES_Policy` itself is used unmodified, copied from the official devkit
example. The `publication` envelope (issuer, currency, `replaces`, proof) is
what's proposed. Signing uses a locally-generated test `did:web` key
standing in for a real authority's key. Full detail: `PROPOSAL.md` §8.1 and
Annexures B–C.

## Verify it yourself

```
mkdir ies-uc3-workspace
cd ies-uc3-workspace
git clone https://github.com/Sanjay-dev22/ies-uc3-policy-as-code.git ies-uc3-policy-as-code
cd ies-uc3-policy-as-code

npm install
npm run keygen
npm run author
npm test
```

`npm test` runs, in order: signature verification against the resolved
`did:web` key; conformance to `schema/publication.schema.json`; five tamper
checks (each must be rejected); and six billing scenarios through two
independently-written evaluators (Node and Python), each checked against a
hand-computed total.

```
npm run demo:ambiguity
```

Reproduces the one open calculation question raised in the proposal
(§11.1): the same policy and usage, read two defensible ways, producing
two different bills.

Requires Node 18+ and Python 3.

## Reproducing the live network round trip

There's also a separate, heavier proof: a real `discover → confirm → status`
sequence run against the actual `beckn/DEG` sandbox software. It's kept out
of the way in [`sandbox-reproduction/`](sandbox-reproduction/README.md),
since it needs Docker and a clone of the real devkit, and it isn't required
to verify the proposal above.

## License

CC-BY-4.0 (see `package.json`).
