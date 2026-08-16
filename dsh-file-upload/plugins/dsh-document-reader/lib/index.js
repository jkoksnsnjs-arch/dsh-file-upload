import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const name = "document-reader";
const inject = ["tools", "fs", "systemPrompt", "webServer"];

const DEFAULT_MAX_CHARS = 200000;
const DEFAULT_TIMEOUT_MS = 120000;
const UPLOAD_PATH = "/api/upload-document";
const UPLOAD_FILES_PATH = "/api/upload-files";
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const UPLOAD_MAX_BODY_BYTES = UPLOAD_MAX_BYTES * 2;
const UPLOAD_RETENTION_DAYS = 30;
const UPLOAD_MAX_FILES_PER_SESSION = 50;
const UPLOAD_CLEANUP_INTERVAL_HOURS = 6;
const LEGACY_COM_APP = {
  ".doc": "word",
  ".xls": "excel",
  ".ppt": "powerpoint",
  ".pps": "powerpoint",
};
const UPLOAD_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ppt",
  ".pptx",
  ".pps",
  ".ppsx",
  ".odt",
  ".ods",
  ".odp",
  ".epub",
  ".rtf",
  ".txt",
  ".csv",
  ".tsv",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".log",
  ".xml",
  ".html",
  ".htm",
  ".yaml",
  ".yml",
  ".ini",
  ".toml",
  ".conf",
  ".properties",
]);

const Config = z.object({
  pythonPath: z.string(),
  maxChars: z.number().default(DEFAULT_MAX_CHARS),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
  retentionDays: z.number().default(UPLOAD_RETENTION_DAYS),
  maxFilesPerSession: z.number().default(UPLOAD_MAX_FILES_PER_SESSION),
  cleanupIntervalHours: z.number().default(UPLOAD_CLEANUP_INTERVAL_HOURS),
});

function codexPythonCandidates() {
  const candidates = [];
  if (process.env.DSH_DOCUMENT_PYTHON) candidates.push(process.env.DSH_DOCUMENT_PYTHON);
  const runtime = "C:\\Users\\jljno\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
  if (existsSync(runtime)) candidates.push(runtime);
  candidates.push("python", "py");
  return candidates;
}

function resolvePythonPath(config) {
  if (config.pythonPath) return config.pythonPath;
  for (const candidate of codexPythonCandidates()) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (existsSync(candidate)) return candidate;
    } else {
      return candidate;
    }
  }
  return "python";
}

function documentFormatForPath(filePath) {
  const ext = extname(filePath).toLowerCase();
  const formats = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".xlsm": "xlsx",
    ".pptx": "pptx",
    ".ppsx": "pptx",
    ".odt": "odt",
    ".ods": "ods",
    ".odp": "odp",
    ".epub": "epub",
    ".rtf": "rtf",
    ".txt": "text",
    ".csv": "text",
    ".tsv": "text",
    ".md": "text",
    ".markdown": "text",
    ".json": "text",
    ".jsonl": "text",
    ".log": "text",
    ".xml": "text",
    ".html": "text",
    ".htm": "text",
    ".yaml": "text",
    ".yml": "text",
    ".ini": "text",
    ".toml": "text",
    ".conf": "text",
    ".properties": "text",
  };
  return formats[ext];
}

const FORMAT_LABELS = {
  pdf: "PDF",
  docx: "Word",
  doc: "Word (legacy .doc)",
  xlsx: "Excel",
  xls: "Excel (legacy .xls)",
  pptx: "PowerPoint",
  ppt: "PowerPoint (legacy .ppt)",
  odt: "OpenDocument Text",
  ods: "OpenDocument Spreadsheet",
  odp: "OpenDocument Presentation",
  epub: "EPUB",
  rtf: "RTF",
  text: "plain text",
};

function sliceText(text, offset, limit) {
  const totalChars = text.length;
  if (offset > totalChars) {
    return { text: "", totalChars, offset, truncated: false };
  }
  const start = Math.max(0, offset - 1);
  const end = Math.min(totalChars, start + limit);
  return {
    text: text.slice(start, end),
    totalChars,
    offset,
    truncated: end < totalChars,
  };
}

function formatDocumentOutput(value) {
  const lines = value.text.split("\n");
  const preview = lines
    .map((line, index) => `${value.offset + index}: ${line}`)
    .join("\n");
  const endChar = value.offset + value.text.length - 1;
  const range = `${value.offset}-${endChar}`;
  const footer = value.truncated
    ? `(Showing characters ${range} of ${value.totalChars}. Use offset=${value.offset + value.text.length} to continue.)`
    : `(End of document - total ${value.totalChars} characters)`;
  return `<path>${value.path}</path>
<type>document</type>
<format>${value.format}</format>
<content>
${preview}

${footer}
</content>`;
}

async function extractWithPython(pythonPath, scriptPath, filePath, kind, maxChars, timeoutMs) {
  try {
    const { stdout } = await execFileAsync(
      pythonPath,
      [scriptPath, "--path", filePath, "--kind", kind, "--max-chars", String(maxChars)],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const detail = stderr || error?.message || String(error);
    throw new Error(`document extraction failed: ${detail}`);
  }
}

async function extractWithOfficeCom(scriptPath, filePath, appName, timeoutMs) {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Path",
        filePath,
        "-App",
        appName,
      ],
      {
        encoding: "utf8",
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout;
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    const detail = stderr || error?.message || String(error);
    throw new Error(
      `cannot read legacy Office file: ${detail}; if this keeps failing, save the file as .docx/.xlsx/.pptx and try again`,
    );
  }
}

async function resolveReadTarget(ctx, exec, requestedPath) {
  const cwd = exec.agent?.session.header.cwd;
  const target = await ctx.fs.resolve(requestedPath, {
    ...cwd !== void 0 ? { cwd } : {},
    signal: exec.signal,
  });
  const info = await ctx.fs.stat(target, exec.signal);
  if (info === void 0) throw new Error(`cannot read "${target.displayPath}": not found`);
  if (info.type !== "file") throw new Error(`cannot read "${target.displayPath}": not a regular file`);
  return { target, info };
}

function readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function cleanupUploads(root, retentionDays = UPLOAD_RETENTION_DAYS, maxFilesPerSession = UPLOAD_MAX_FILES_PER_SESSION) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  const now = Date.now();
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = join(root, entry.name);
    let files;
    try {
      files = readdirSync(sessionDir, { withFileTypes: true })
        .filter((file) => file.isFile())
        .map((file) => {
          const path = join(sessionDir, file.name);
          let mtime = 0;
          try {
            mtime = statSync(path).mtimeMs;
          } catch {}
          return { path, mtime };
        });
    } catch {
      continue;
    }
    const retained = [];
    for (const file of files) {
      if (now - file.mtime > retentionMs) {
        try {
          unlinkSync(file.path);
        } catch {}
      } else {
        retained.push(file);
      }
    }
    retained.sort((a, b) => a.mtime - b.mtime);
    for (let index = 0; index < retained.length - maxFilesPerSession; index++) {
      try {
        unlinkSync(retained[index].path);
      } catch {}
    }
  }
}

function readQuery(req) {
  const url = new URL(req.url ?? "/", "http://localhost");
  return {
    sessionId: url.searchParams.get("sessionId") ?? "",
    name: url.searchParams.get("name") ?? "",
  };
}

function listUploadedFiles(root, sessionId) {
  const directory = join(root, sessionId);
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = join(directory, entry.name);
    let stat;
    try {
      stat = statSync(filePath);
    } catch {
      continue;
    }
    files.push({
      name: entry.name,
      size: stat.size,
      mtime: stat.mtimeMs,
      path: filePath,
    });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

function deleteUploadedFile(root, sessionId, name) {
  if (typeof name !== "string" || name.length === 0 || name === "." || name === ".." || /[\\/]/.test(name)) {
    return { ok: false, code: "invalid-name" };
  }
  const filePath = join(root, sessionId, name);
  if (!existsSync(filePath)) return { ok: false, code: "not-found" };
  const info = statSync(filePath);
  if (!info.isFile()) return { ok: false, code: "not-a-file" };
  unlinkSync(filePath);
  return { ok: true };
}

function createUploadFilesHandler(uploadsRoot, retention) {
  return async (req, res) => {
    const { sessionId, name } = readQuery(req);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
      sendJson(res, 400, { ok: false, error: "invalid sessionId" });
      return;
    }
    if (req.method === "GET") {
      const files = listUploadedFiles(uploadsRoot, sessionId);
      sendJson(res, 200, { ok: true, files, retention });
      return;
    }
    if (req.method === "DELETE") {
      try {
        const result = deleteUploadedFile(uploadsRoot, sessionId, name);
        if (!result.ok) {
          const status = result.code === "not-found" ? 404 : 400;
          sendJson(res, status, { ok: false, error: result.code });
          return;
        }
        sendJson(res, 200, { ok: true, deleted: name });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error?.message ?? "delete failed" });
      }
      return;
    }
    sendJson(res, 405, { ok: false, error: "method not allowed" });
  };
}

function createUploadHandler(uploadsRoot, retention) {
  return async (req, res) => {
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    let raw;
    try {
      raw = await readRequestBody(req, UPLOAD_MAX_BODY_BYTES);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error?.message ?? "invalid request body" });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid JSON body" });
      return;
    }
    const sessionId = payload?.sessionId;
    const fileName = payload?.name;
    const data = payload?.data;
    if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
      sendJson(res, 400, { ok: false, error: "invalid sessionId" });
      return;
    }
    if (typeof fileName !== "string" || fileName.trim().length === 0) {
      sendJson(res, 400, { ok: false, error: "missing file name" });
      return;
    }
    if (typeof data !== "string" || data.length === 0) {
      sendJson(res, 400, { ok: false, error: "missing file data" });
      return;
    }
    const extension = extname(fileName).toLowerCase();
    if (!UPLOAD_EXTENSIONS.has(extension)) {
      sendJson(res, 400, { ok: false, error: `unsupported file type: ${extension || "(none)"}` });
      return;
    }
    const buffer = Buffer.from(data, "base64");
    if (buffer.length === 0 || buffer.length > UPLOAD_MAX_BYTES) {
      sendJson(res, 400, { ok: false, error: "file data must be between 1 byte and 50 MB" });
      return;
    }
    const safeName = basename(fileName).replace(/[\\/]/g, "_").slice(0, 200) || "upload";
    const directory = join(uploadsRoot, sessionId);
    try {
      mkdirSync(directory, { recursive: true });
      const filePath = join(directory, safeName);
      writeFileSync(filePath, buffer);
      try {
        cleanupUploads(uploadsRoot, retention.retentionDays, retention.maxFilesPerSession);
      } catch {}
      sendJson(res, 200, { ok: true, path: filePath });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error?.message ?? "write failed" });
    }
  };
}

function apply(ctx, config = {}) {
  const resolved = {
    pythonPath: config.pythonPath,
    maxChars: config.maxChars ?? DEFAULT_MAX_CHARS,
    timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retentionDays: config.retentionDays ?? UPLOAD_RETENTION_DAYS,
    maxFilesPerSession: config.maxFilesPerSession ?? UPLOAD_MAX_FILES_PER_SESSION,
    cleanupIntervalHours: config.cleanupIntervalHours ?? UPLOAD_CLEANUP_INTERVAL_HOURS,
  };
  if (!Number.isInteger(resolved.maxChars) || resolved.maxChars < 1000) {
    throw new Error(`document-reader: maxChars must be an integer of at least 1000`);
  }
  if (!Number.isInteger(resolved.timeoutMs) || resolved.timeoutMs < 1000) {
    throw new Error(`document-reader: timeoutMs must be an integer of at least 1000`);
  }
  if (!Number.isInteger(resolved.retentionDays) || resolved.retentionDays < 1) {
    throw new Error(`document-reader: retentionDays must be an integer of at least 1`);
  }
  if (!Number.isInteger(resolved.maxFilesPerSession) || resolved.maxFilesPerSession < 1) {
    throw new Error(`document-reader: maxFilesPerSession must be an integer of at least 1`);
  }
  if (!Number.isFinite(resolved.cleanupIntervalHours) || resolved.cleanupIntervalHours < 0.1) {
    throw new Error(`document-reader: cleanupIntervalHours must be a number of at least 0.1`);
  }
  const uploadsRoot = join(resolveDshHome(), "uploads");
  const retention = {
    retentionDays: resolved.retentionDays,
    maxFilesPerSession: resolved.maxFilesPerSession,
    cleanupIntervalHours: resolved.cleanupIntervalHours,
  };

  ctx.systemPrompt.section({
    name: "tool:read-document",
    order: 101,
    text: "Use the read_document tool to read PDF, Word, Excel, PowerPoint, OpenDocument, EPUB and other document files. The read tool only decodes UTF-8 text and cannot open these binary formats.",
  });

  ctx.tools.register(defineTool({
    name: "read_document",
    description: "Extract text from a PDF, Word, Excel, PowerPoint or other document file and return it as plain text.",
    parameters: {
      file_path: {
        type: "string",
        required: true,
        description: "Path to the document file, resolved by the filesystem backend.",
      },
      offset: {
        type: "number",
        description: "1-based character offset of the first returned character. Defaults to 1.",
      },
      limit: {
        type: "number",
        description: `Maximum number of characters to return. Defaults to ${resolved.maxChars}.`,
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", required: true },
          format: { type: "string", required: true },
          offset: { type: "integer", required: true },
          totalChars: { type: "integer", required: true },
          text: { type: "string", required: true },
          truncated: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => [{ type: "text", text: formatDocumentOutput(value) }],
      presentationMeta: (_args, value) => ({
        path: value.path,
        format: value.format,
        offset: value.offset,
        totalChars: value.totalChars,
        truncated: value.truncated,
      }),
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (args.file_path.trim().length === 0) throw new Error("file_path must be a non-empty string");
      const offset = args.offset === void 0 ? 1 : args.offset;
      if (!Number.isInteger(offset) || offset < 1) throw new Error("offset must be a positive integer");
      const limit = args.limit === void 0 ? resolved.maxChars : args.limit;
      if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");

      const { target, info } = await resolveReadTarget(ctx, exec, args.file_path);
      const extension = extname(target.displayPath).toLowerCase();
      let kind = documentFormatForPath(target.displayPath);
      if (kind === void 0 && extension === "") kind = "auto";
      if (kind === void 0) kind = "auto";

      const comApp = LEGACY_COM_APP[extension];
      let text;
      if (comApp !== void 0) {
        const scriptPath = new URL("./extract-office.ps1", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
        text = await extractWithOfficeCom(scriptPath, target.targetKey, comApp, resolved.timeoutMs);
        text = text.replace(/\r\n/g, "\n");
      } else {
        const pythonPath = resolvePythonPath(resolved);
        const scriptPath = new URL("./extract.py", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
        text = await extractWithPython(
          pythonPath,
          scriptPath,
          target.targetKey,
          kind,
          resolved.maxChars + offset - 1,
          resolved.timeoutMs,
        );
      }

      ctx.emit("fs/observed", target, {
        kind: "present",
        version: info.version,
      }, exec);

      return {
        path: target.displayPath,
        format: FORMAT_LABELS[kind] ?? basename(target.displayPath),
        ...sliceText(text, offset, limit),
      };
    },
    presentCall(args) {
      return {
        card: "generic",
        title: `Read document ${args.file_path}`,
        kind: "read",
        locations: [{ path: args.file_path }],
      };
    },
  }));

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: "exact",
      path: UPLOAD_PATH,
      handler: createUploadHandler(uploadsRoot, retention),
    });
    return disposeRoute;
  }, "document-reader: upload route");

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: "exact",
      path: UPLOAD_FILES_PATH,
      handler: createUploadFilesHandler(uploadsRoot, retention),
    });
    return disposeRoute;
  }, "document-reader: upload files route");

  ctx.effect(() => {
    const runCleanup = () => {
      try {
        cleanupUploads(uploadsRoot, resolved.retentionDays, resolved.maxFilesPerSession);
      } catch {}
    };
    runCleanup();
    const intervalMs = Math.max(60_000, Math.round(resolved.cleanupIntervalHours * 60 * 60 * 1000));
    const timer = setInterval(runCleanup, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
    return () => clearInterval(timer);
  }, "document-reader: scheduled upload cleanup");
}

export { Config, apply, inject, name };
