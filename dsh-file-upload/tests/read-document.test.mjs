import { apply as pluginApply } from "../plugins/dsh-document-reader/lib/index.js";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "dsh-read-test-"));
const filePath = join(dir, "hello.txt");
writeFileSync(filePath, "hello dsh read_document", "utf8");

let registered = null;
let promptSection = null;
const ctx = {
  systemPrompt: { section(section) { promptSection = section; } },
  tools: { register(tool) { registered = tool; } },
  fs: {
    async resolve(path) { return { targetKey: path, displayPath: path }; },
    async stat() { return { type: "file", version: "v1", size: 100 }; },
  },
  webServer: { register() { return () => {}; } },
  effect(fn) { return fn(); },
  emit() {},
};

try {
  pluginApply(ctx, {});
  if (!registered) throw new Error("read_document was not registered");
  if (!promptSection || promptSection.name !== "tool:read-document") {
    throw new Error("prompt section was not registered");
  }

  const result = await registered.execute(
    { file_path: filePath, limit: 200 },
    { agent: { session: { header: { cwd: dir } } }, signal: new AbortController().signal },
  );
  if (!result.text.includes("hello dsh read_document")) {
    throw new Error("extracted text mismatch");
  }
  console.log(JSON.stringify({ ok: true, format: result.format, totalChars: result.totalChars }));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
