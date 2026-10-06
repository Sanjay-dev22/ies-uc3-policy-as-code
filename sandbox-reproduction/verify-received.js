// Standalone check, run by live-sandbox-roundtrip.ps1 right after it extracts
// received-from-live-webhook.json: independently verifies that the signature
// survived the real network transit intact. Kept as its own file rather than
// an inline `node -e` one-liner because Windows PowerShell silently strips
// embedded double quotes when forwarding a string argument to a native exe
// (node.exe here) -- the JS would run with every quote missing.
import { readFileSync } from "node:fs";
import { verifyEnvelope } from "../src/verifyPolicy.js";

const envelope = JSON.parse(readFileSync("received-from-live-webhook.json", "utf-8"));
const did = JSON.parse(readFileSync("keys/did.json", "utf-8"));
console.log(verifyEnvelope(envelope, did));
