// Minimal YAML-ish frontmatter parser/serializer for memory policy files.
// Supports exactly what policies use: `key: scalar` and `key: [a, b, c]` lists.
// Not a general YAML implementation; kept tiny and dependency-free on purpose.

export function parse(text) {
    const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
    if (!match) {
        return { data: {}, body: text.trim() };
    }

    const data = {};
    for (const line of match[1].split("\n")) {
        const kv = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
        if (kv) {
            data[kv[1]] = parseScalar(kv[2]);
        }
    }

    return { data, body: match[2].trim() };
}

function parseScalar(raw) {
    const value = raw.trim();
    if (value.startsWith("[") && value.endsWith("]")) {
        return value
            .slice(1, -1)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return value;
}

export function serialize(data, body) {
    const lines = Object.entries(data).map(
        ([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.join(", ")}]` : value}`
    );

    return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}
