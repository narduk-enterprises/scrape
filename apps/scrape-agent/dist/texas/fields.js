export function pickField(obj, ...candidates) {
    for (const k of candidates) {
        const v = obj[k];
        if (v !== undefined && v.trim().length > 0)
            return v.trim();
    }
    return '';
}
