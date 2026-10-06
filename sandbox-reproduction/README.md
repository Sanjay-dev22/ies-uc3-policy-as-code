# Reproducing the live sandbox round trip

This reproduces the real `discover → confirm → status` sequence described in
`PROPOSAL.md`, Annexure C, against the actual `beckn/DEG` sandbox software,
not a mock. It needs Docker and a clone of the real devkit, so it is kept
separate from the plain `npm test` proof in the repository root.

This has been run end to end and confirmed: the delivered object recomputes
to the same bill as `npm test`, and the signature (covering the whole
envelope, per Decision B in `PROPOSAL.md`) verifies against data that
genuinely crossed the real network. Full detail: `PROPOSAL.md`, Annexure C.

## Steps

1. Clone the real devkit as a sibling folder:
   ```
   cd ..
   git clone https://github.com/beckn/DEG.git ies-devkit
   cd ies-uc3-policy-as-code
   ```
2. Apply the patch that swaps the stock fixture-replay stub for this
   repository's real webhook server:
   ```powershell
   Copy-Item sandbox-reproduction\devkit-setup\docker-compose.yml `
     ..\ies-devkit\devkits\data-exchange\install\docker-compose.yml -Force
   ```
3. From the repository root, generate a signing identity and author a signed
   policy (needed before the sandbox can serve one):
   ```
   npm run keygen
   npm run author
   ```
4. Start the sandbox:
   ```powershell
   cd ..\ies-devkit\devkits\data-exchange\install
   docker compose up -d --build
   ```
   Confirm seven healthy containers: `redis-bap`, `redis-bpp`, `beckn-router`,
   `onix-bap`, `onix-bpp`, `sandbox-bap`, and `sandbox-bpp` (built from
   `sandbox-reproduction/webhook-server/`, not the original
   `fidedocker/sandbox-2.0` image).
5. Run the round trip (skip the `cd` below if you're already back in the
   repository root, e.g. re-running without having just rebuilt the sandbox):
   ```powershell
   cd ..\..\..\..\ies-uc3-policy-as-code
   .\sandbox-reproduction\live-sandbox-roundtrip.ps1
   ```
   This fires `discover → confirm → status` against the live sandbox, extracts
   the delivered policy into `received-from-live-webhook.json`, then
   automatically recomputes its bill (`evaluator.py`) and independently
   verifies its signature (`verify-received.js`), both against data that
   genuinely crossed the network, not local files.

## Stopping the sandbox

```powershell
cd ..\ies-devkit\devkits\data-exchange\install
docker compose down
```
