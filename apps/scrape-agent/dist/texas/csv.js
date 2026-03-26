/** Minimal RFC4180-style CSV parse (quoted fields, commas). */
export function parseCsvRows(text) {
    const allRows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const s = text.replace(/^\uFEFF/, '');
    const flushRow = () => {
        row.push(field);
        field = '';
        if (row.some((cell) => cell.trim().length > 0)) {
            allRows.push(row);
        }
        row = [];
    };
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQuotes) {
            if (c === '"') {
                if (s[i + 1] === '"') {
                    field += '"';
                    i++;
                    continue;
                }
                inQuotes = false;
                continue;
            }
            field += c;
            continue;
        }
        if (c === '"') {
            inQuotes = true;
            continue;
        }
        if (c === ',') {
            row.push(field);
            field = '';
            continue;
        }
        if (c === '\r')
            continue;
        if (c === '\n') {
            flushRow();
            continue;
        }
        field += c;
    }
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        if (row.some((cell) => cell.trim().length > 0)) {
            allRows.push(row);
        }
    }
    if (allRows.length === 0)
        return { headers: [], rows: [] };
    const headers = allRows[0].map((h) => h.trim());
    return { headers, rows: allRows.slice(1) };
}
export function normalizeHeaderKey(h) {
    return h
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}
export function rowsToObjects(headers, rows) {
    const norm = headers.map((h) => normalizeHeaderKey(h));
    return rows.map((r) => {
        const o = {};
        norm.forEach((key, j) => {
            o[key] = (r[j] ?? '').trim();
        });
        return o;
    });
}
