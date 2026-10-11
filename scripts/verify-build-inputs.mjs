import { statSync } from "node:fs";
import { join } from "node:path";

const archive = join(process.cwd(), "public", "careerdev-global-assets.tgz");
try {
  const stat = statSync(archive);
  if (!stat.isFile() || stat.size === 0) throw new Error("file is empty");
  console.log(`Build input check passed: ${archive} (${stat.size} bytes).`);
} catch (error) {
  console.error(`Build input check failed: ${archive} is missing or invalid (${error.message}).`);
  process.exitCode = 1;
}
