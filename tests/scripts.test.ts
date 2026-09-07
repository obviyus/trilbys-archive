import { afterAll, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const fixtures = await mkdtemp(join(tmpdir(), "trilbys-scripts-test-"));
afterAll(() => rm(fixtures, { recursive: true, force: true }));

test.each([
  "build-captions-index",
  "build-stats",
  "enrich-publish-dates",
  "grab-captions",
  "transcribe-fallback",
])("%s exits with failure on unreadable input", async (name) => {
  const cwd = join(fixtures, name);
  await mkdir(join(cwd, "scripts"), { recursive: true });
  await symlink(join(root, "node_modules"), join(cwd, "node_modules"));
  await copyFile(join(root, "scripts", `${name}.ts`), join(cwd, "scripts", `${name}.ts`));

  // Collection scripts must fail before they can make any network request.
  const readsProgress = name === "grab-captions" || name === "transcribe-fallback";
  if (readsProgress) await Bun.write(join(cwd, "data/progress.json"), "{");

  const child = Bun.spawn([process.execPath, "run", `scripts/${name}.ts`], {
    cwd,
    env: { PATH: process.env.PATH, GROQ_API_KEY: "test-no-network" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toContain(readsProgress ? "JSON" : "ENOENT");
  expect(exitCode).not.toBe(0);
});

test("build stops before stats and Astro when caption generation fails", async () => {
  const cwd = join(fixtures, "pipeline");
  await mkdir(join(cwd, "scripts"), { recursive: true });
  await copyFile(join(root, "package.json"), join(cwd, "package.json"));
  await copyFile(join(root, "scripts/build-captions-index.ts"), join(cwd, "scripts/build-captions-index.ts"));
  await Bun.write(join(cwd, "scripts/build-stats.ts"), 'await Bun.write("stats-started", "yes");');

  const child = Bun.spawn([process.execPath, "run", "build"], { cwd, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  expect(stderr).toContain("ENOENT");
  expect(exitCode).not.toBe(0);
  expect(await Bun.file(join(cwd, "stats-started")).exists()).toBe(false);
});
