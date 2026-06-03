// Shared tiny helpers used across tools. Kept in one place so slugify/today
// are not duplicated (the code audit flags repeated helpers).

import { renameSync, rmSync, writeFileSync } from "node:fs";

export const today = () => new Date().toISOString().slice(0, 10);

export const nowIso = () => new Date().toISOString();

export const slugify = (text) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

// Emit and store paths with forward slashes regardless of OS. A version snapshot
// taken on Windows must match the same files computed on Linux CI, and committed
// artifacts should not carry backslashes.
export const toPosix = (p) => String(p).replaceAll("\\", "/");

// Write via a temp file then rename, so a generated file (the derived index.md
// files) is never observed half-written when agents run in parallel. On POSIX the
// rename is atomic; on Windows, where rename over an existing file can fail, fall
// back to a direct write of the same small derived content.
export function writeFileAtomic(file, data) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, data);
    try {
        renameSync(tmp, file);
    } catch {
        try {
            writeFileSync(file, data);
        } finally {
            rmSync(tmp, { force: true });
        }
    }
}
