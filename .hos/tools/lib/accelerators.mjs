// Optional accelerator registry. HOS core never depends on entries here; install
// agents read the registry and ask the user whether to opt in.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOS_DIR } from "./paths.mjs";

const REGISTRY = join(HOS_DIR, "accelerators", "registry.json");

export function registry() {
    if (!existsSync(REGISTRY)) {
        return { version: 1, accelerators: [] };
    }
    const parsed = JSON.parse(readFileSync(REGISTRY, "utf8"));
    return {
        version: parsed.version || 1,
        accelerators: Array.isArray(parsed.accelerators) ? parsed.accelerators : []
    };
}

export function listAccelerators() {
    const r = registry();
    return {
        registry: REGISTRY,
        version: r.version,
        count: r.accelerators.length,
        accelerators: r.accelerators.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            repository: item.repository,
            prompt: item.prompt,
            localOnly: item.localOnly !== false
        }))
    };
}

export function installPlan(id = "") {
    const found = registry().accelerators.find((item) => item.id === id);
    if (!found) {
        return {
            ok: false,
            error: id ? `no accelerator registered with id "${id}"` : "accelerator id required",
            available: listAccelerators().accelerators.map((item) => item.id)
        };
    }

    return {
        ok: true,
        id: found.id,
        name: found.name,
        repository: found.repository,
        install: found.install || [],
        verify: found.verify || [],
        guardrails: [
            "Ask the user before installing.",
            "Do not make the accelerator part of the core HOS path.",
            "Do not use credentials unless the user explicitly provides and approves them.",
            "Keep a local fallback when the accelerator is absent."
        ]
    };
}
