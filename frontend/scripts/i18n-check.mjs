import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (locale) =>
  JSON.parse(
    readFileSync(join(here, "..", "src", "i18n", "messages", `${locale}.json`), "utf8"),
  );

function flatten(value, prefix = "", out = new Map()) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, out);
    } else {
      out.set(path, child);
    }
  }
  return out;
}

const en = flatten(read("en"));
const de = flatten(read("de"));
const missingInDe = [...en.keys()].filter((key) => !de.has(key));
const missingInEn = [...de.keys()].filter((key) => !en.has(key));
const empty = [...en.entries()]
  .filter(([, value]) => typeof value === "string" && value.trim() === "")
  .map(([key]) => key);

if (missingInDe.length || missingInEn.length || empty.length) {
  if (missingInDe.length) console.error("Missing in de:", missingInDe);
  if (missingInEn.length) console.error("Missing in en:", missingInEn);
  if (empty.length) console.error("Empty translations:", empty);
  process.exit(1);
}
console.log(`i18n ok: ${String(en.size)} keys in en/de`);
