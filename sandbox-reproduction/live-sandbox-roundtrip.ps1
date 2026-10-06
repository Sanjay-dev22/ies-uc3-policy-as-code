# Reproduces the live round trip this repository was proven against, against
# the real, running beckn/DEG sandbox network (see sandbox-reproduction/README.md
# for setup). PowerShell only, by design -- no Bash/Git Bash dependency anywhere
# in this repository, so it behaves identically on any machine that clones it.
# Needs: Docker Desktop running, curl.exe (built into Windows 10/11), Python 3,
# and the sandbox stack already up (docker compose up -d --build).
#
# Run from the repository root (see sandbox-reproduction/README.md, step 5):
#   powershell -ExecutionPolicy Bypass -File sandbox-reproduction\live-sandbox-roundtrip.ps1

$EXAMPLES = "..\ies-devkit\devkits\data-exchange\uc3-tariff-policy\examples"
$CALLER = "http://localhost:8081/bap/caller"

Write-Output "=== 1. discover (broadcast on the real testnet) ==="
# `docker compose up -d --build` returns as soon as containers START, not once
# onix-bap/onix-bpp/the router have actually finished initializing (they have
# no declared healthcheck) -- so the very first request can silently fail if
# fired too soon. Retry rather than assume the stack is ready.
$discoverOk = $false
for ($i = 1; $i -le 10; $i++) {
    curl.exe -s -X GET "$CALLER/discover" -H "Content-Type: application/json" -d "@$EXAMPLES\discover-request.json" | Out-File -Encoding utf8 discover-full.json
    if ((Get-Item discover-full.json).Length -gt 0) { $discoverOk = $true; break }
    Write-Output "  (sandbox not ready yet, retrying in 3s...)"
    Start-Sleep -Seconds 3
}
if (-not $discoverOk) {
    Write-Output "  Sandbox never responded after 30s -- check 'docker compose ps' and 'docker logs onix-bap', then re-run this script."
}
Get-Content discover-full.json -TotalCount 5
Write-Output "  (full response saved to discover-full.json -- run: python -m json.tool discover-full.json)"

# discover-full.json is overwritten every run -- it's a snapshot of THIS run
# only. discover-results.json is different: it's a running history, appended
# to (never overwritten), so you can see across many runs whether the same
# participant answers every time or a different one shows up.
try {
    $discover = Get-Content discover-full.json -Raw | ConvertFrom-Json
    $providerName = $discover.message.catalogs[0].provider.descriptor.name
    $bppId = $discover.context.bppId
    $bppUri = $discover.context.bppUri
    if (-not $providerName) { $providerName = "(name not found in this response shape)" }

    $entry = [PSCustomObject]@{
        timestamp    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        providerName = $providerName
        bppId        = $bppId
        bppUri       = $bppUri
    }

    $history = @()
    if (Test-Path discover-results.json) {
        $history = @(Get-Content discover-results.json -Raw | ConvertFrom-Json)
    }
    $history += $entry
    # -InputObject (not piped) so a 1-entry history still serializes as a
    # JSON array, not a bare object -- PowerShell's pipeline otherwise
    # unwraps single-element arrays before ConvertTo-Json ever sees them.
    ConvertTo-Json -InputObject $history -Depth 6 | Out-File -Encoding utf8 discover-results.json

    Write-Output "  Discovered: $providerName ($bppId) -- appended to discover-results.json (now $($history.Count) run(s) on record)"
} catch {
    Write-Output "  Could not parse discover response to log it in discover-results.json: $_"
}
Write-Output ""

Write-Output "=== 2. confirm (scoped to our local bpp.example.com) ==="
curl.exe -s -X POST "$CALLER/confirm" -H "Content-Type: application/json" -d "@$EXAMPLES\confirm-request.json"
Write-Output ""

Write-Output "=== 3. status (our webhook authors + signs a policy live, right now) ==="
curl.exe -s -X POST "$CALLER/status" -H "Content-Type: application/json" -d "@$EXAMPLES\status-request.json"
Write-Output ""

Start-Sleep -Seconds 3
Write-Output "=== our webhook's own log: proves it built + signed a fresh policy for this request ==="
docker logs sandbox-bpp --tail 4

Write-Output ""
Write-Output "=== onix-bap's own validator independently confirmed our live payload as schema-conformant IES_Policy ==="
$logs = docker logs onix-bap --since 15s 2>&1
$logs | Select-String "Validation passed for @type: IES_Policy"

Write-Output ""
Write-Output "=== extracting the actually-delivered policy (for independent verification) ==="
# Retry a few times: the on_status callback to sandbox-bap can land a moment
# after onix-bap's own validator log line above, since it's a separate async hop.
$extracted = $false
for ($i = 1; $i -le 5; $i++) {
    # NOTE: plain `>` redirection defaults to UTF-16 in Windows PowerShell,
    # which garbles the JSON for Python's UTF-8 parser -- force UTF-8 explicitly.
    docker logs sandbox-bap 2>&1 | Out-File -Encoding utf8 sandbox-bap-live.log
    python sandbox-reproduction\extract-received-policy.py sandbox-bap-live.log
    if ($LASTEXITCODE -eq 0) { $extracted = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $extracted) {
    Write-Output "Could not extract the delivered policy after 5 attempts -- check 'docker logs sandbox-bap' manually."
} else {
    Write-Output "Extracted to received-from-live-webhook.json."

    Write-Output ""
    Write-Output "=== recomputing the bill from the delivered object ==="
    python evaluator.py received-from-live-webhook.json test/fixtures/usage-normal.json

    Write-Output ""
    Write-Output "=== independently verifying the signature survived transit ==="
    node sandbox-reproduction\verify-received.js
}
