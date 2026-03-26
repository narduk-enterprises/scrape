import type { TexasStagingDataset } from '@narduk-enterprises/scrape-contract'
import type { ApiClient } from '../api-client.js'

/** Rows per HTTP batch (server splits each batch into D1-safe 5-row inserts). */
const CHUNK = 100

export async function ingestTexasRows(
  api: ApiClient,
  dataset: TexasStagingDataset,
  ctx: {
    sourceFileName: string
    sourceUrl: string
    sourceSnapshotDate: string
    fileChecksumSha256?: string
  },
  rows: Record<string, unknown>[],
): Promise<{ batches: number; inserted: number }> {
  let batches = 0
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const res = await api.ingestTexasStage({
      dataset,
      sourceFileName: ctx.sourceFileName,
      sourceUrl: ctx.sourceUrl,
      sourceSnapshotDate: ctx.sourceSnapshotDate,
      fileChecksumSha256: ctx.fileChecksumSha256,
      rows: chunk,
    })
    batches += 1
    inserted += res.inserted
  }
  return { batches, inserted }
}
