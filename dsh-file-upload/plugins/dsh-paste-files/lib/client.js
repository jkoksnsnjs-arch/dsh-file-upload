window.__ModuleLoader__.load({
	id: "@local/dsh-paste-files",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let jsxRuntime = require("react/jsx-runtime");
		let reactDom = require("react-dom");

		const DOCUMENT_EXTENSIONS = new Set([
			".pdf", ".doc", ".docx", ".xls", ".xlsx", ".xlsm",
			".ppt", ".pptx", ".pps", ".ppsx", ".odt", ".ods", ".odp",
			".epub", ".rtf", ".txt", ".csv", ".tsv", ".md", ".markdown",
			".json", ".jsonl", ".log", ".xml", ".html", ".htm", ".yaml",
			".yml", ".ini", ".toml", ".conf", ".properties"
		]);
		const ACCEPT = Array.from(DOCUMENT_EXTENSIONS).join(",");
		const UPLOAD_ENDPOINT = "/api/upload-document";
		const FILES_ENDPOINT = "/api/upload-files";
		const AUTO_INSERT_KEY = "dsh-paste-files.autoInsertPath";

		function autoInsertPathEnabled() {
			try {
				return localStorage.getItem(AUTO_INSERT_KEY) !== "0";
			} catch {
				return true;
			}
		}

		function writeAutoInsertPath(enabled) {
			try {
				localStorage.setItem(AUTO_INSERT_KEY, enabled ? "1" : "0");
			} catch {}
		}

		function useAutoInsertPath() {
			const [enabled, setEnabled] = react.useState(autoInsertPathEnabled);
			const toggle = react.useCallback(() => {
				setEnabled((previous) => {
					const next = !previous;
					writeAutoInsertPath(next);
					return next;
				});
			}, []);
			return [enabled, toggle];
		}

		function isDocumentFile(file) {
			if (file.type && file.type.startsWith("image/")) return false;
			const dot = file.name.lastIndexOf(".");
			if (dot <= 0) return false;
			return DOCUMENT_EXTENSIONS.has(file.name.slice(dot).toLowerCase());
		}

		function bytesToBase64(bytes) {
			let binary = "";
			const chunkSize = 0x8000;
			for (let index = 0; index < bytes.length; index += chunkSize) {
				binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
			}
			return btoa(binary);
		}

		async function readFileBase64(file) {
			const buffer = await file.arrayBuffer();
			return bytesToBase64(new Uint8Array(buffer));
		}

		function extOf(name) {
			const dot = name.lastIndexOf(".");
			return dot <= 0 ? "" : name.slice(dot).toLowerCase();
		}

		function basenameOf(path) {
			const parts = String(path).split(/[\\/]/);
			return parts[parts.length - 1] || path;
		}

		function formatSize(bytes) {
			if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
			const units = ["B", "KB", "MB", "GB"];
			let value = bytes;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
		}

		function timeLabel(ms) {
			const date = new Date(ms);
			const pad = (value) => String(value).padStart(2, "0");
			return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}

		function rgba(hex, alpha) {
			const value = parseInt(hex.slice(1), 16);
			return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
		}

		function fileTone(name) {
			const ext = extOf(name);
			const tones = {
				".pdf": { label: "PDF", color: "#e5484d" },
				".doc": { label: "DOC", color: "#3b82f6" },
				".docx": { label: "DOC", color: "#3b82f6" },
				".odt": { label: "DOC", color: "#3b82f6" },
				".rtf": { label: "DOC", color: "#3b82f6" },
				".xls": { label: "XLS", color: "#16a34a" },
				".xlsx": { label: "XLS", color: "#16a34a" },
				".xlsm": { label: "XLS", color: "#16a34a" },
				".ods": { label: "XLS", color: "#16a34a" },
				".csv": { label: "CSV", color: "#16a34a" },
				".tsv": { label: "TSV", color: "#16a34a" },
				".ppt": { label: "PPT", color: "#f97316" },
				".pptx": { label: "PPT", color: "#f97316" },
				".pps": { label: "PPT", color: "#f97316" },
				".ppsx": { label: "PPT", color: "#f97316" },
				".odp": { label: "PPT", color: "#f97316" },
				".epub": { label: "EPUB", color: "#8b5cf6" },
				".txt": { label: "TXT", color: "#64748b" },
				".md": { label: "MD", color: "#64748b" },
				".markdown": { label: "MD", color: "#64748b" },
				".json": { label: "JSON", color: "#64748b" },
				".jsonl": { label: "JSON", color: "#64748b" },
				".log": { label: "LOG", color: "#64748b" },
				".xml": { label: "XML", color: "#64748b" },
				".html": { label: "HTML", color: "#64748b" },
				".htm": { label: "HTML", color: "#64748b" },
				".yaml": { label: "YAML", color: "#64748b" },
				".yml": { label: "YAML", color: "#64748b" },
				".ini": { label: "INI", color: "#64748b" },
				".toml": { label: "TOML", color: "#64748b" },
				".conf": { label: "CONF", color: "#64748b" },
				".properties": { label: "PROP", color: "#64748b" },
			};
			return tones[ext] || { label: "FILE", color: "#64748b" };
		}

		const storeBySession = new Map();

		function getStore(sessionId) {
			let store = storeBySession.get(sessionId);
			if (!store) {
				store = { files: [], listeners: new Set() };
				storeBySession.set(sessionId, store);
			}
			return store;
		}

		function setFiles(sessionId, updater) {
			const store = getStore(sessionId);
			store.files = updater(store.files);
			store.listeners.forEach((listener) => listener());
		}

		function patchEntry(sessionId, id, patch) {
			setFiles(sessionId, (list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
		}

		function subscribeFiles(sessionId, listener) {
			const store = getStore(sessionId);
			store.listeners.add(listener);
			return () => store.listeners.delete(listener);
		}

		function snapshotFiles(sessionId) {
			return getStore(sessionId).files;
		}

		function useUploadFiles(sessionId) {
			return react.useSyncExternalStore(
				(listener) => subscribeFiles(sessionId, listener),
				() => snapshotFiles(sessionId),
			);
		}

		function focusComposer() {
			const element = document.querySelector("textarea[data-phase]");
			if (element && typeof element.focus === "function") {
				element.focus();
				return true;
			}
			return false;
		}

		function insertComposerText(text) {
			const element = document.querySelector("textarea[data-phase]");
			if (!element) return false;
			element.focus();
			const start = element.selectionStart === null ? element.value.length : element.selectionStart;
			const end = element.selectionEnd === null ? start : element.selectionEnd;
			element.setRangeText(text, start, end, "end");
			element.dispatchEvent(new Event("input", { bubbles: true }));
			return true;
		}

		function insertUploadedPath(path) {
			insertComposerText(`\n已上传文件：${path}\n`);
		}

		async function runUpload(sessionId, id) {
			const store = getStore(sessionId);
			const entry = store.files.find((item) => item.id === id);
			if (!entry || entry.status === "uploading") return;
			patchEntry(sessionId, id, { status: "uploading", error: null });
			try {
				const data = await readFileBase64(entry.file);
				const response = await fetch(UPLOAD_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ sessionId, name: entry.file.name, data }),
				});
				const body = await response.json().catch(() => ({}));
				if (!response.ok || !body.ok) {
					throw new Error((body && body.error) || "upload failed");
				}
				if (!getStore(sessionId).files.some((item) => item.id === id)) {
					fetch(`${FILES_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(basenameOf(body.path))}`, {
						method: "DELETE",
					}).catch(() => {});
					return;
				}
				patchEntry(sessionId, id, { status: "done", path: body.path });
				if (autoInsertPathEnabled()) insertUploadedPath(body.path);
			} catch (error) {
				patchEntry(sessionId, id, {
					status: "error",
					error: String((error && error.message) || error),
				});
			}
		}

		function addFiles(sessionId, files) {
			const supported = Array.from(files).filter(isDocumentFile);
			if (supported.length === 0) return;
			const entries = supported.map((file) => ({
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				name: file.name,
				size: file.size,
				status: "queued",
				path: null,
				error: null,
				file,
			}));
			setFiles(sessionId, (list) => [...list, ...entries]);
			focusComposer();
			entries.forEach((entry) => runUpload(sessionId, entry.id));
		}

		function removeEntry(sessionId, id) {
			const store = getStore(sessionId);
			const entry = store.files.find((item) => item.id === id);
			setFiles(sessionId, (list) => list.filter((item) => item.id !== id));
			if (entry && entry.status === "done" && entry.path) {
				const name = basenameOf(entry.path);
				fetch(`${FILES_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(name)}`, {
					method: "DELETE",
				}).catch(() => {});
			}
		}

		function retryEntry(sessionId, id) {
			runUpload(sessionId, id);
		}

		function PaperclipIcon() {
			return jsxRuntime.jsx("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": true,
				children: jsxRuntime.jsx("path", {
					d: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			});
		}

		function CloseIcon() {
			return jsxRuntime.jsx("svg", {
				width: 12,
				height: 12,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": true,
				children: jsxRuntime.jsx("path", {
					d: "M18 6 6 18M6 6l12 12",
					stroke: "currentColor",
					strokeWidth: 2,
					strokeLinecap: "round",
				}),
			});
		}

		function TrashIcon() {
			return jsxRuntime.jsx("svg", {
				width: 13,
				height: 13,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": true,
				children: jsxRuntime.jsx("path", {
					d: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			});
		}

		function RefreshIcon() {
			return jsxRuntime.jsx("svg", {
				width: 12,
				height: 12,
				viewBox: "0 0 24 24",
				fill: "none",
				"aria-hidden": true,
				children: jsxRuntime.jsx("path", {
					d: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5",
					stroke: "currentColor",
					strokeWidth: 1.8,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}),
			});
		}

		function FileBadge({ name }) {
			const tone = fileTone(name);
			return jsxRuntime.jsx("span", {
				style: {
					width: 30,
					height: 34,
					borderRadius: 7,
					display: "inline-flex",
					alignItems: "center",
					justifyContent: "center",
					flex: "none",
					fontSize: 8.5,
					fontWeight: 700,
					letterSpacing: 0,
					color: tone.color,
					background: rgba(tone.color, 0.12),
					border: `1px solid ${rgba(tone.color, 0.35)}`,
				},
				children: tone.label,
			});
		}

		function Spinner() {
			return jsxRuntime.jsx("span", {
				style: {
					width: 13,
					height: 13,
					borderRadius: "50%",
					border: "2px solid rgba(128,128,128,.25)",
					borderTopColor: "var(--dsw-alias-brand-primary, #3964fe)",
					animation: "dsh-upload-spin .8s linear infinite",
					flex: "none",
				},
			});
		}

		const attachButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 28,
			height: 28,
			padding: 0,
			marginRight: 2,
			border: "1px solid transparent",
			borderRadius: 8,
			background: "transparent",
			cursor: "pointer",
			transition: "background .15s, color .15s",
		};

		function UploadButton({ sessionId, t }) {
			const inputRef = react.useRef(null);
			const [hover, setHover] = react.useState(false);

			const onPick = (event) => {
				const picked = Array.from(event.target.files || []);
				event.target.value = "";
				if (picked.length > 0) addFiles(sessionId, picked);
			};

			return jsxRuntime.jsxs("div", {
				style: { display: "inline-flex", alignItems: "center" },
				children: [
					jsxRuntime.jsx("button", {
						type: "button",
						"aria-label": t("attach"),
						title: t("attach"),
						style: {
							...attachButtonStyle,
							color: hover ? "var(--dsw-alias-label-primary, #111827)" : "var(--dsw-alias-label-secondary, #64748b)",
							background: hover ? "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12))" : "transparent",
						},
						onMouseEnter: () => setHover(true),
						onMouseLeave: () => setHover(false),
						onMouseDown: (event) => event.preventDefault(),
						onClick: () => {
							if (inputRef.current) inputRef.current.click();
						},
						children: jsxRuntime.jsx(PaperclipIcon, {}),
					}),
					jsxRuntime.jsx("input", {
						ref: inputRef,
						type: "file",
						multiple: true,
						accept: ACCEPT,
						tabIndex: -1,
						style: { display: "none" },
						onChange: onPick,
					}),
				],
			});
		}

		function ManagePanel({ sessionId, t, onClose }) {
			const [list, setList] = react.useState(null);
			const [retention, setRetention] = react.useState(null);
			const [error, setError] = react.useState(null);
			const [deleting, setDeleting] = react.useState(null);
			const [autoInsert, toggleAutoInsert] = useAutoInsertPath();
			const closeRef = react.useRef(null);

			const load = react.useCallback(async () => {
				setError(null);
				try {
					const response = await fetch(`${FILES_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`);
					const body = await response.json().catch(() => ({}));
					if (!response.ok || !body.ok) throw new Error((body && body.error) || "list failed");
					setList(body.files || []);
					setRetention(body.retention || null);
				} catch (err) {
					setError(String((err && err.message) || err));
					setList([]);
				}
			}, [sessionId]);

			react.useEffect(() => {
				load();
			}, [load]);

			react.useEffect(() => {
				if (closeRef.current) closeRef.current.focus();
				const onKeyDown = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [onClose]);

			const removeServer = async (name) => {
				setDeleting(name);
				try {
					await fetch(`${FILES_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(name)}`, {
						method: "DELETE",
					});
					await load();
				} finally {
					setDeleting(null);
				}
			};

			return reactDom.createPortal(
				jsxRuntime.jsx("div", {
					style: {
						position: "fixed",
						inset: 0,
						zIndex: 1200,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						background: "var(--dsw-alias-bg-mask-1, rgba(0,0,0,.38))",
						padding: 16,
					},
					onMouseDown: (event) => {
						if (event.target === event.currentTarget) onClose();
					},
					children: jsxRuntime.jsxs("div", {
						role: "dialog",
						"aria-modal": "true",
						"aria-label": t("manage.title"),
						style: {
							width: "min(540px, 100%)",
							maxHeight: "76vh",
							display: "flex",
							flexDirection: "column",
							background: "var(--dsw-alias-bg-overlay, #fff)",
							border: "1px solid var(--dsw-alias-border-l2, #e5e7eb)",
							borderRadius: 12,
							boxShadow: "0 18px 48px rgba(0,0,0,.35)",
							color: "var(--dsw-alias-label-primary, #111827)",
							overflow: "hidden",
						},
						children: [
							jsxRuntime.jsxs("div", {
								style: {
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									padding: "10px 12px 10px 16px",
									borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))",
								},
								children: [
									jsxRuntime.jsx("div", {
										style: { fontSize: 13, fontWeight: 600 },
										children: t("manage.title"),
									}),
									jsxRuntime.jsxs("div", {
										style: { display: "inline-flex", gap: 6 },
										children: [
											jsxRuntime.jsx("button", {
												ref: closeRef,
												type: "button",
												style: iconButtonStyle,
												"aria-label": t("manage.refresh"),
												title: t("manage.refresh"),
												onClick: load,
												children: jsxRuntime.jsx(RefreshIcon, {}),
											}),
											jsxRuntime.jsx("button", {
												type: "button",
												style: iconButtonStyle,
												"aria-label": t("close"),
												title: t("close"),
												onClick: onClose,
												children: jsxRuntime.jsx(CloseIcon, {}),
											}),
										],
									}),
								],
							}),
							jsxRuntime.jsxs("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 12,
									padding: "10px 16px",
									borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))",
								},
								children: [
									jsxRuntime.jsxs("div", {
										style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
										children: [
											jsxRuntime.jsx("div", { style: { fontSize: 12.5, fontWeight: 600 }, children: t("setting.autoInsert") }),
											jsxRuntime.jsx("div", {
												style: { fontSize: 11, lineHeight: "15px", color: "var(--dsw-alias-label-secondary, #64748b)" },
												children: t("setting.autoInsert.desc"),
											}),
										],
									}),
									jsxRuntime.jsx("button", {
										type: "button",
										role: "switch",
										"aria-checked": autoInsert,
										"aria-label": t("setting.autoInsert"),
										style: {
											width: 34,
											height: 20,
											padding: 0,
											flex: "none",
											border: "none",
											borderRadius: 999,
											cursor: "pointer",
											position: "relative",
											background: autoInsert ? "var(--dsw-alias-brand-primary, #3964fe)" : "rgba(128,128,128,.28)",
											transition: "background .15s",
										},
										onClick: toggleAutoInsert,
										children: jsxRuntime.jsx("span", {
											style: {
												position: "absolute",
												top: 3,
												left: 3,
												width: 14,
												height: 14,
												borderRadius: "50%",
												background: "#fff",
												boxShadow: "0 1px 3px rgba(0,0,0,.25)",
												transform: autoInsert ? "translateX(14px)" : "translateX(0)",
												transition: "transform .15s",
											},
										}),
									}),
								],
							}),
							jsxRuntime.jsx("div", {
								style: {
									flex: 1,
									overflowY: "auto",
									padding: 8,
									minHeight: 96,
								},
								children: error
									? jsxRuntime.jsx("div", { style: hintStyle, children: t("manage.error", { message: error }) })
									: list === null
										? jsxRuntime.jsx("div", { style: hintStyle, children: t("manage.loading") })
										: list.length === 0
											? jsxRuntime.jsx("div", { style: hintStyle, children: t("manage.empty") })
											: jsxRuntime.jsx("div", {
												style: { display: "flex", flexDirection: "column", gap: 4 },
												children: list.map((file) => jsxRuntime.jsxs("div", {
													style: rowStyle,
													children: [
														jsxRuntime.jsx(FileBadge, { name: file.name }),
														jsxRuntime.jsxs("div", {
															style: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
															children: [
																jsxRuntime.jsx("div", {
																	style: { fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
																	title: file.name,
																	children: file.name,
																}),
																jsxRuntime.jsx("div", {
																	style: { fontSize: 11, color: "var(--dsw-alias-label-secondary, #64748b)" },
																	children: `${formatSize(file.size)} · ${timeLabel(file.mtime)}`,
																}),
															],
														}),
														jsxRuntime.jsx("button", {
															type: "button",
															style: iconButtonStyle,
															"aria-label": t("manage.delete", { name: file.name }),
															title: t("manage.delete", { name: file.name }),
															disabled: deleting === file.name,
															onClick: () => removeServer(file.name),
															children: jsxRuntime.jsx(TrashIcon, {}),
														}),
													],
												}, file.name)),
											}),
							}),
							jsxRuntime.jsx("div", {
								style: {
									padding: "8px 14px 10px",
									fontSize: 11,
									lineHeight: "16px",
									color: "var(--dsw-alias-label-secondary, #64748b)",
									borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))",
								},
								children: retention
									? t("manage.retention", {
										max: retention.maxFilesPerSession,
										days: retention.retentionDays,
										hours: retention.cleanupIntervalHours,
									})
									: "",
							}),
						],
					}),
				}),
				document.body,
			);
		}

		const iconButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			width: 26,
			height: 26,
			padding: 0,
			border: "1px solid transparent",
			borderRadius: 7,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary, #64748b)",
			cursor: "pointer",
		};

		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 10,
			padding: "7px 8px",
			borderRadius: 9,
			background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,.07))",
		};

		const hintStyle = {
			padding: "18px 14px",
			fontSize: 12,
			lineHeight: "18px",
			textAlign: "center",
			color: "var(--dsw-alias-label-secondary, #64748b)",
		};

		const dockStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: 8,
			padding: "0 2px 8px",
		};

		const chipStyle = {
			display: "flex",
			alignItems: "center",
			gap: 9,
			maxWidth: "min(360px, 100%)",
			padding: "6px 7px 6px 8px",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-layer-2, rgba(128,128,128,.07))",
			border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))",
		};

		const chipBodyStyle = {
			flex: 1,
			minWidth: 0,
			display: "flex",
			flexDirection: "column",
			gap: 1,
		};

		const chipNameStyle = {
			fontSize: 12,
			fontWeight: 600,
			whiteSpace: "nowrap",
			overflow: "hidden",
			textOverflow: "ellipsis",
			color: "var(--dsw-alias-label-primary, #111827)",
		};

		const chipMetaStyle = {
			fontSize: 10.5,
			whiteSpace: "nowrap",
			overflow: "hidden",
			textOverflow: "ellipsis",
			color: "var(--dsw-alias-label-secondary, #64748b)",
		};

		const smallButtonStyle = {
			display: "inline-flex",
			alignItems: "center",
			height: 24,
			padding: "0 8px",
			border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))",
			borderRadius: 7,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary, #64748b)",
			fontSize: 11,
			cursor: "pointer",
			whiteSpace: "nowrap",
		};

		function statusText(item, t) {
			if (item.status === "uploading") return t("upload.uploading");
			if (item.status === "error") return t("upload.error", { message: item.error || "" });
			if (item.status === "done") return `${t("upload.done")} · ${formatSize(item.size)}`;
			return `${t("upload.queued")} · ${formatSize(item.size)}`;
		}

		function FileDock({ sessionId, t }) {
			const files = useUploadFiles(sessionId);
			const [manageOpen, setManageOpen] = react.useState(false);
			const [serverCount, setServerCount] = react.useState(0);

			const refreshCount = react.useCallback(async () => {
				try {
					const response = await fetch(`${FILES_ENDPOINT}?sessionId=${encodeURIComponent(sessionId)}`);
					const body = await response.json().catch(() => ({}));
					if (body && body.ok && Array.isArray(body.files)) setServerCount(body.files.length);
				} catch {}
			}, [sessionId]);

			react.useEffect(() => {
				refreshCount();
			}, [refreshCount]);

			react.useEffect(() => {
				if (files.some((item) => item.status === "done")) refreshCount();
			}, [files, refreshCount]);

			react.useEffect(() => {
				const onPaste = (event) => {
					const items = event.clipboardData && event.clipboardData.items;
					if (!items) return;
					const picked = [];
					for (const item of items) {
						if (item.kind !== "file") continue;
						const file = item.getAsFile();
						if (file && isDocumentFile(file)) picked.push(file);
					}
					if (picked.length === 0) return;
					event.preventDefault();
					event.stopPropagation();
					addFiles(sessionId, picked);
				};

				const onDrop = (event) => {
					const files = event.dataTransfer && event.dataTransfer.files;
					if (!files || files.length === 0) return;
					const picked = Array.from(files).filter(isDocumentFile);
					if (picked.length === 0) return;
					event.preventDefault();
					event.stopPropagation();
					addFiles(sessionId, picked);
				};

				document.addEventListener("paste", onPaste, true);
				document.addEventListener("drop", onDrop, true);
				return () => {
					document.removeEventListener("paste", onPaste, true);
					document.removeEventListener("drop", onDrop, true);
				};
			}, [sessionId]);

			return jsxRuntime.jsxs("div", {
				style: dockStyle,
				children: [
					files.map((item) => jsxRuntime.jsxs("div", {
						style: chipStyle,
						title: item.error ? `${item.name} · ${item.error}` : item.name,
						children: [
							jsxRuntime.jsx(FileBadge, { name: item.name }),
							jsxRuntime.jsxs("div", {
								style: chipBodyStyle,
								children: [
									jsxRuntime.jsx("div", { style: chipNameStyle, children: item.name }),
									jsxRuntime.jsx("div", { style: chipMetaStyle, children: statusText(item, t) }),
								],
							}),
							item.status === "uploading" && jsxRuntime.jsx(Spinner, {}),
							item.status === "error" && jsxRuntime.jsx("button", {
								type: "button",
								style: smallButtonStyle,
								onClick: () => retryEntry(sessionId, item.id),
								children: t("retry"),
							}),
							jsxRuntime.jsx("button", {
								type: "button",
								style: {
									...iconButtonStyle,
									width: 22,
									height: 22,
									flex: "none",
								},
								"aria-label": t("remove", { name: item.name }),
								title: t("remove", { name: item.name }),
								onClick: () => removeEntry(sessionId, item.id),
								children: jsxRuntime.jsx(CloseIcon, {}),
							}),
						],
					}, item.id)),
					jsxRuntime.jsx("button", {
						type: "button",
						style: smallButtonStyle,
						onClick: () => setManageOpen(true),
						children: serverCount > 0 ? t("manage.label", { count: serverCount }) : t("manage.open"),
					}),
					manageOpen && jsxRuntime.jsx(ManagePanel, {
						sessionId,
						t,
						onClose: () => setManageOpen(false),
					}),
				],
			});
		}

		const inject = ["slots", "locale"];

		function apply(ctx) {
			const zh = {
				"attach": "上传文件",
				"upload.queued": "等待上传",
				"upload.uploading": "上传中…",
				"upload.done": "已上传",
				"upload.error": "上传失败：{message}",
				"retry": "重试",
				"remove": "移除 {name}",
				"manage.label": "文件 {count}",
				"manage.open": "文件",
				"manage.title": "已上传文件",
				"manage.empty": "这个会话还没有上传文件",
				"manage.refresh": "刷新",
				"manage.delete": "删除 {name}",
				"manage.loading": "加载中…",
				"manage.error": "加载失败：{message}",
				"manage.retention": "自动清理：每个会话最多保留 {max} 个文件，超过 {days} 天自动删除，每 {hours} 小时检查一次。",
				"setting.autoInsert": "自动写入文件路径",
				"setting.autoInsert.desc": "上传后是否自动把文件地址显示在输入框里",
				"close": "关闭",
			};
			const en = {
				"attach": "Upload files",
				"upload.queued": "Queued",
				"upload.uploading": "Uploading…",
				"upload.done": "Uploaded",
				"upload.error": "Upload failed: {message}",
				"retry": "Retry",
				"remove": "Remove {name}",
				"manage.label": "Files {count}",
				"manage.open": "Files",
				"manage.title": "Uploaded files",
				"manage.empty": "No files uploaded in this session yet",
				"manage.refresh": "Refresh",
				"manage.delete": "Delete {name}",
				"manage.loading": "Loading…",
				"manage.error": "Failed to load: {message}",
				"manage.retention": "Auto cleanup: keep up to {max} files per session, delete files older than {days} days, checked every {hours} hours.",
				"setting.autoInsert": "Auto-insert file path",
				"setting.autoInsert.desc": "Show the uploaded file path in the message box automatically",
				"close": "Close",
			};
			ctx.effect(() => ctx.locale.register("paste-files", { zh, en }), "ui-paste-files: dictionaries");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.setAttribute("data-dsh-upload-style", "1");
				style.textContent = "@keyframes dsh-upload-spin{to{transform:rotate(360deg)}}";
				document.head.appendChild(style);
				return () => style.remove();
			}, "ui-paste-files: style");
			ctx.inject(["slots", "locale"], (scope) => {
				scope.slots.inject("conversation.input.left", () => scope.slots.register({
					name: "conversation.input.left",
					id: "paste-files",
					order: 1,
					locale: "paste-files",
				}, UploadButton));
				scope.slots.inject("conversation.input.dock", () => scope.slots.register({
					name: "conversation.input.dock",
					id: "paste-files",
					order: 5,
					locale: "paste-files",
				}, FileDock));
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
