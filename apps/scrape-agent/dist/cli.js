#!/usr/bin/env node
/**
 * Local scrape worker CLI — talks to the Nuxt backend (Bearer SCRAPE_AGENT_SECRET).
 *
 * Env:
 *   SCRAPE_API_BASE    — e.g. https://scrape.nard.uk or http://localhost:3000
 *   SCRAPE_AGENT_SECRET — must match server SCRAPE_AGENT_SECRET
 *   SCRAPE_AGENT_ID     — stable machine id (default: hostname)
 */
import { readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { ingestBodySchema } from '@narduk-enterprises/scrape-contract';
const base = () => process.env.SCRAPE_API_BASE?.replace(/\/$/, '') || 'http://localhost:3000';
const secret = () => process.env.SCRAPE_AGENT_SECRET || '';
const agentId = () => process.env.SCRAPE_AGENT_ID || hostname() || 'unknown-agent';
function authHeaders() {
    const s = secret();
    if (!s)
        throw new Error('SCRAPE_AGENT_SECRET is required');
    return { Authorization: `Bearer ${s}`, 'Content-Type': 'application/json' };
}
async function heartbeat() {
    const res = await fetch(`${base()}/api/scrape/agent/heartbeat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: agentId(), hostname: hostname(), version: '0.1.0' }),
    });
    if (!res.ok)
        throw new Error(`heartbeat ${res.status}: ${await res.text()}`);
}
async function work(limit) {
    const res = await fetch(`${base()}/api/scrape/agent/work?limit=${limit}`, {
        headers: authHeaders(),
    });
    if (!res.ok)
        throw new Error(`work ${res.status}: ${await res.text()}`);
    return res.json();
}
async function ingest(body) {
    const parsed = ingestBodySchema.safeParse(body);
    if (!parsed.success) {
        console.error(parsed.error.flatten());
        throw new Error('Invalid ingest payload');
    }
    const res = await fetch(`${base()}/api/scrape/agent/ingest`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(parsed.data),
    });
    if (!res.ok)
        throw new Error(`ingest ${res.status}: ${await res.text()}`);
    return res.json();
}
function usage() {
    console.log(`scrape-agent — env SCRAPE_API_BASE, SCRAPE_AGENT_SECRET, optional SCRAPE_AGENT_ID

Commands:
  heartbeat              POST /api/scrape/agent/heartbeat
  work [limit]           GET /api/scrape/agent/work (default limit 25)
  ingest <file.json>     POST /api/scrape/agent/ingest (validated body)
  watch [seconds]        heartbeat + work on an interval (default 60s)
`);
}
async function main() {
    const [, , cmd = 'help', ...rest] = process.argv;
    switch (cmd) {
        case 'heartbeat':
            await heartbeat();
            console.log('ok');
            break;
        case 'work': {
            const limit = Number(rest[0]) || 25;
            const data = await work(limit);
            console.log(JSON.stringify(data, null, 2));
            break;
        }
        case 'ingest': {
            const path = rest[0];
            if (!path)
                throw new Error('usage: scrape-agent ingest <file.json>');
            const raw = await readFile(path, 'utf8');
            const body = JSON.parse(raw);
            const out = await ingest(body);
            console.log(JSON.stringify(out, null, 2));
            break;
        }
        case 'watch': {
            const sec = Number(rest[0]) || 60;
            const tick = async () => {
                try {
                    await heartbeat();
                    const w = (await work(50));
                    console.log(new Date().toISOString(), 'work items:', w.work?.length ?? 0);
                }
                catch (e) {
                    console.error(new Date().toISOString(), e);
                }
            };
            await tick();
            setInterval(tick, sec * 1000);
            break;
        }
        default:
            usage();
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
