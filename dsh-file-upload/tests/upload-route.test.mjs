import { apply as pluginApply } from "../plugins/dsh-document-reader/lib/index.js";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), "dsh-upload-test-"));

const routes = [];
const ctx = {
  systemPrompt: { section() {} },
  tools: { register() {} },
  fs: {},
  webServer: {
    register(entry) {
      routes.push(entry);
      return () => {};
    },
  },
  effect(fn) {
    const dispose = fn();
    return dispose;
  },
};

pluginApply(ctx, {});

const route = routes.find((entry) => entry.path === "/api/upload-document");
if (!route || route.path !== "/api/upload-document") throw new Error("upload route not registered");

function fakeRequest(body) {
  const listeners = {};
  return {
    method: "POST",
    on(event, fn) {
      listeners[event] = fn;
    },
    destroy() {},
    start() {
      listeners.data?.(Buffer.from(body));
      listeners.end?.();
    },
  };
}

function fakeResponse() {
  let status;
  let body = "";
  return {
    writeHead(code) {
      status = code;
    },
    end(text) {
      body = text;
    },
    get statusCode() {
      return status;
    },
    get json() {
      return JSON.parse(body);
    },
  };
}

const payload = {
  sessionId: "test-session-123",
  name: "示例.pdf",
  data: Buffer.from("hello document").toString("base64"),
};

const request = fakeRequest(JSON.stringify(payload));
const response = fakeResponse();
const pending = route.handler(request, response);
request.start();
await pending;

const result = response.json;
if (!result.ok) throw new Error(`upload failed: ${result.error}`);
const filePath = result.path;
if (!existsSync(filePath)) throw new Error("uploaded file missing");

console.log(JSON.stringify({ ok: result.ok, path: filePath, status: response.statusCode }));
