import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = dirname(require.resolve("pdfjs-dist/package.json"));
const destination = new URL("../public/pdfjs/", import.meta.url);
mkdirSync(destination, { recursive: true });
cpSync(join(source, "legacy/build/pdf.worker.min.mjs"), new URL("pdf.worker.legacy.min.mjs", destination));
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  cpSync(join(source, directory), new URL(directory, destination), { recursive: true });
}
