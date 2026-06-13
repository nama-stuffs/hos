// Resolves harness directory locations from this file's position.
// The tools live at .hos/tools/, so the harness root is one level up and the
// repo root is two. No configuration needed; layout is fixed.
//
// HOS_DIR may be overridden with the HOS_DIR environment variable so tests (and
// any external runner) can point the harness at a disposable store without
// touching the real .hos/ folder. TOOLS_DIR always stays at the real code
// location - the override reroutes state (memory, tickets, spec, reports), not
// the executing tool.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const TOOLS_DIR = resolve(here, "..");
export const HOS_DIR = process.env.HOS_DIR ? resolve(process.env.HOS_DIR) : resolve(TOOLS_DIR, "..");
export const REPO_ROOT = resolve(HOS_DIR, "..");

// The single settings file. Non-secret and readable by anyone.
export const HOS_JSON = join(HOS_DIR, "hos.json");

export const MEMORY_DIR = join(HOS_DIR, "memory");
export const POLICY_DIR = join(MEMORY_DIR, "policy");
export const FRICTION_DIR = join(MEMORY_DIR, "friction");
export const MEMORY_INDEX = join(MEMORY_DIR, "index.md");

export const TICKETS_DIR = join(HOS_DIR, "tickets");
export const TICKETS_INDEX = join(TICKETS_DIR, "index.md");
export const SESSIONS_LOG = join(TICKETS_DIR, "sessions.ndjson");
export const TASK_DIR = join(HOS_DIR, "task");

export const SPEC_DIR = join(HOS_DIR, "doc", "spec");
export const SPEC_INDEX = join(SPEC_DIR, "index.md");

// Generated reports and their screenshots. Disposable local artifacts; what the
// user does with a report is out of scope.
export const REPORTS_DIR = join(HOS_DIR, "reports");

// Disposable local runtime state (gitignored): caches, baselines, and the lock
// directory that serializes multi-agent read-modify-write (util.withLock).
export const CACHE_DIR = join(HOS_DIR, ".cache");

export const AGENTS_MD = join(REPO_ROOT, "AGENTS.md");
