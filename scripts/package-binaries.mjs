#!/usr/bin/env node
/**
 * package-binaries.mjs
 *
 * Packages pre-built binaries from the release workflow into release-assets/.
 * Called by semantic-release's prepareCmd:
 *   node scripts/package-binaries.mjs <version>
 *
 * In CI, binaries are downloaded to release-assets/ by download-artifact.
 * This script adds checksums and a version manifest.
 */

import { mkdirSync, readdirSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const version = process.argv[2] ?? "0.0.0";
const ASSETS_DIR = "release-assets";

mkdirSync(ASSETS_DIR, { recursive: true });

console.log(`\n📦 Packaging binaries for v${version}\n`);

// If running locally (no binaries downloaded), create placeholder info file
if (!existsSync(ASSETS_DIR) || readdirSync(ASSETS_DIR).length === 0) {
  console.log("ℹ️  No binary assets found (expected in CI). Creating version manifest only.");
}

// Write version manifest
const manifest = {
  name: "modern-ai-cli",
  version,
  publishedAt: new Date().toISOString(),
  platforms: {
    "linux-x64":  { file: `modern-ai-cli-linux-x64.tar.gz`,         install: "tar -xzf modern-ai-cli-linux-x64.tar.gz && sudo mv modern-ai-cli-linux-x64 /usr/local/bin/ai" },
    "linux-arm64":{ file: `modern-ai-cli-linux-arm64.tar.gz`,        install: "tar -xzf modern-ai-cli-linux-arm64.tar.gz && sudo mv modern-ai-cli-linux-arm64 /usr/local/bin/ai" },
    "macos-x64":  { file: `modern-ai-cli-macos-x64.tar.gz`,          install: "tar -xzf modern-ai-cli-macos-x64.tar.gz && sudo mv modern-ai-cli-macos-x64 /usr/local/bin/ai" },
    "macos-arm64":{ file: `modern-ai-cli-macos-arm64.tar.gz`,        install: "tar -xzf modern-ai-cli-macos-arm64.tar.gz && sudo mv modern-ai-cli-macos-arm64 /usr/local/bin/ai" },
    "win-x64":    { file: `modern-ai-cli-win-x64.exe.zip`,            install: "Expand-Archive modern-ai-cli-win-x64.exe.zip -DestinationPath ." },
  },
  npm: {
    install: `npm install -g modern-ai-cli@${version}`,
    registry: "https://registry.npmjs.org",
  },
};

writeFileSync(
  join(ASSETS_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf-8"
);

// Generate SHA256 for any binary files present
let processed = 0;
if (existsSync(ASSETS_DIR)) {
  for (const file of readdirSync(ASSETS_DIR)) {
    if (file.endsWith(".sha256") || file === "manifest.json") continue;

    const filePath = join(ASSETS_DIR, file);
    const content = readFileSync(filePath);
    const hash = createHash("sha256").update(content).digest("hex");
    writeFileSync(`${filePath}.sha256`, `${hash}  ${file}\n`, "utf-8");
    console.log(`  ✔ ${file} → ${hash.slice(0, 16)}…`);
    processed++;
  }
}

console.log(`\n✅ Manifest written. ${processed} binary checksums generated.\n`);
