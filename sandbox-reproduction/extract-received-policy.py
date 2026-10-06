#!/usr/bin/env python3
"""
Extracts the actually-delivered {policy, publication} envelope from a
`docker logs sandbox-bap` capture: both the IES_Policy payload (carried
as `dataPayload`) and its signature block (carried alongside as
`iesPublication`, per webhook-server/server.js). Used automatically by
the round-trip scripts so verification runs against what was genuinely
received over the network, not a locally-authored copy: evaluator.py
recomputes the bill from `policy`, and verifyPolicy.js's verifyEnvelope()
can independently check `publication.proof` against the resolved did:web
key -- proving the signature (Decision B: the whole envelope, not just
the policy) survived the real network hop intact.

Usage: python extract-received-policy.py <log-file> [output.json]
"""
import json
import sys

def main():
    if len(sys.argv) < 2:
        print("Usage: python extract-received-policy.py <log-file> [output.json]")
        sys.exit(1)

    log_path = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else "received-from-live-webhook.json"

    with open(log_path, encoding="utf-8-sig", errors="replace") as f:
        content = f.read()

    decoder = json.JSONDecoder()
    idx, n = 0, len(content)
    found = None
    while idx < n:
        brace = content.find("{", idx)
        if brace == -1:
            break
        try:
            obj, end = decoder.raw_decode(content, brace)
            idx = end
            try:
                attrs = obj["message"]["contract"]["performance"][0]["performanceAttributes"]
                dp = attrs["dataPayload"]
                if dp.get("@type") == "IES_Policy":
                    found = {"policy": dp, "publication": attrs.get("iesPublication")}
            except Exception:
                pass
        except json.JSONDecodeError:
            idx = brace + 1

    if found:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(found, f, indent=2)
        policy = found["policy"]
        print(f"Extracted delivered envelope -> {out_path}")
        print(f"  policyID: {policy.get('policyID')}  modificationDateTime: {policy.get('modificationDateTime')}")
        print(f"  publication present: {found['publication'] is not None}")
    else:
        print("No delivered IES_Policy found in the log. Run the round trip first.")
        sys.exit(1)

if __name__ == "__main__":
    main()
