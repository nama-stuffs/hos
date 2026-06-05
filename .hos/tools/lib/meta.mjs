// Single source of truth for the HOS framework version. This constant ships
// inside .hos/, so an installed copy always knows which framework release it is.
// hos.json records the version a project was last synced to (init/adopt/upgrade);
// comparing the two is how `hos upgrade` decides what to re-sync.
//
// Bump this on any release that changes framework-owned files (personas,
// protocols, audits, tools, accelerator schema). The root package.json version
// mirrors this value for npm/npx; meta.mjs is authoritative for the harness.

export const HOS_VERSION = "0.3.1-beta";
