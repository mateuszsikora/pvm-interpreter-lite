import { readdirSync, writeFileSync } from "fs";
import { join } from "path";
import { buildSync } from "esbuild";

const dist = "dist";
const outdir = "dist/cjs";

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "cjs") {
      files.push(...collectJsFiles(full));
    } else if (entry.name.endsWith(".js") && !entry.name.includes(".test.")) {
      files.push(full);
    }
  }
  return files;
}

buildSync({
  entryPoints: collectJsFiles(dist),
  outdir,
  outbase: dist,
  format: "cjs",
  platform: "node",
});

writeFileSync(join(outdir, "package.json"), '{"type":"commonjs"}\n');
