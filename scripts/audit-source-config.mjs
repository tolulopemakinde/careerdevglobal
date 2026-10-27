import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", ".next", "public/careerdev-global-assets.tgz"]);
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".env", ".yaml", ".yml"]);
const findings = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (extensions.has(path.slice(path.lastIndexOf(".")))) inspect(path);
  }
}

function inspect(path) {
  const text = readFileSync(path, "utf8");
  const rel = relative(root, path);
  if (rel === "scripts/audit-source-config.mjs") return;
  const checks = [
    { label: "Supabase service-role secret", pattern: /SUPABASE_SERVICE_ROLE|service_role_secret|service_role_key/i },
    { label: "OpenAI secret assignment", pattern: /OPENAI_API_KEY\s*[:=]\s*["'`]?(?!process\.env)[A-Za-z0-9_-]{20,}/i },
    { label: "Private key material", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i },
    { label: "Vercel token assignment", pattern: /VERCEL_TOKEN\s*[:=]\s*["'`]?(?!process\.env)[A-Za-z0-9_-]{20,}/i },
  ];
  for (const check of checks) {
    const sanitizedText = check.label === "Supabase service-role secret" && rel.startsWith("supabase/functions/")
      ? text.replace(/Deno\.env\.get\(["\x27\x60](?:CAREERDEV|SUPABASE)_SERVICE_ROLE_KEY["\x27\x60]\)/g, "")
      : text;
    if (check.pattern.test(sanitizedText)) findings.push(`${rel}: ${check.label}`);
  }
}

walk(root);
if (findings.length) {
  console.error("Potential server-secret exposure detected:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log("Source audit passed: no likely server-only secret patterns found in tracked source files.");
}
