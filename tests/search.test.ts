import { expect, test } from "bun:test";
import { createContext, runInContext } from "node:vm";

const page = await Bun.file(new URL("../src/pages/index.astro", import.meta.url)).text();
const script = page.split("<script is:inline>")[1].split("</script>")[0];

interface SearchResults {
  results: { data(): Promise<{ meta: { videoId: string } }> }[];
}

interface Pagefind {
  search(query: string): Promise<SearchResults>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function searchPage(ready: Promise<Pagefind>, fetch = async () => Response.json({
  title: "Latest review",
  series: "Zero Punctuation",
  captions: [["The latest game", 12]],
})) {
  const results = { innerHTML: "" };
  const context = createContext({
    ready,
    fetch,
    console: { error() {} },
    document: { getElementById: () => results, addEventListener() {} },
  });
  runInContext(`${script}\npagefindReady = ready;`, context);
  return {
    results,
    search(query: string): Promise<void> {
      context.query = query;
      return runInContext("performSearch(query)", context);
    },
  };
}

const latest: SearchResults = { results: [{ data: async () => ({ meta: { videoId: "latest" } }) }] };

test("a search waits for initialization and then shows results", async () => {
  const ready = deferred<Pagefind>();
  const page = searchPage(ready.promise);
  const pending = page.search("latest");
  expect(page.results.innerHTML).toContain("Searching");
  ready.resolve({ search: async () => latest });
  await pending;
  expect(page.results.innerHTML).toContain("Latest review");
});

test.each(["results", "error"])("late search %s cannot overwrite a newer search", async (outcome) => {
  const old = deferred<SearchResults>();
  const started = deferred<void>();
  const page = searchPage(Promise.resolve({ search: async (query) => {
    if (query === "old") { started.resolve(); return old.promise; }
    return latest;
  } }));
  const pending = page.search("old");
  await started.promise;
  await page.search("latest");
  const current = page.results.innerHTML;
  expect(current).toContain("Latest review");
  if (outcome === "error") old.reject(new Error("Old request failed"));
  else old.resolve({ results: [] });
  await pending;
  expect(page.results.innerHTML).toBe(current);
});

test.each(["search", "metadata", "captions"])("clearing search during %s loading stays empty", async (stage) => {
  const gate = deferred<void>();
  const started = deferred<void>();
  async function pause(at: string) {
    if (stage === at) { started.resolve(); await gate.promise; }
  }
  const page = searchPage(Promise.resolve({ search: async () => {
    await pause("search");
    return { results: [{ data: async () => {
      await pause("metadata");
      return { meta: { videoId: "latest" } };
    } }] };
  } }), async () => {
    await pause("captions");
    return Response.json({ title: "Latest review", series: "Zero Punctuation", captions: [["The latest game", 12]] });
  });
  const pending = page.search("latest");
  await started.promise;
  await page.search("");
  gate.resolve();
  await pending;
  expect(page.results.innerHTML).toBe("");
});

test("initialization failure gives a visible search error", async () => {
  const ready = deferred<Pagefind>();
  const page = searchPage(ready.promise);
  const pending = page.search("latest");
  ready.reject(new Error("Index unavailable"));
  await pending;
  expect(page.results.innerHTML).toContain("An error occurred while searching");
});
