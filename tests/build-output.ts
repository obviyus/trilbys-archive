import assert from "node:assert/strict";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
let transcripts = 0;
let underscoreIds = 0;

for await (const file of new Bun.Glob("*.json").scan(join(root, "data/captions"))) {
  const data = await Bun.file(join(root, "data/captions", file)).json();
  if (data.captions.length === 0) continue;

  const id = data.video.id;
  const page = Bun.file(join(root, "dist/transcript", id, "index.html"));
  assert(await page.exists(), `Missing transcript page: ${id}`);
  assert((await page.text()).includes('data-pagefind-body'), `Transcript is not indexable: ${id}`);
  assert(await Bun.file(join(root, "dist/captions", `${id}.json`)).exists(), `Missing captions: ${id}`);
  transcripts++;
  if (id.startsWith("_")) underscoreIds++;
}

assert(transcripts > 0, "No transcripts checked");
const index = await Bun.file(join(root, "dist/pagefind/pagefind-entry.json")).json();
assert.equal(index.languages.en.page_count, transcripts, "Search index must contain every transcript");
console.log(`Verified ${transcripts} transcript pages and search entries, including ${underscoreIds} IDs starting with _.`);
