import { sql } from 'drizzle-orm'
import { useAppDatabase } from '#server/utils/app-database'
import { requireAdmin } from '#layer/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const db = useAppDatabase(event)

  const rows = await db.all<{
    id: string
    slug: string
    name: string
    description: string | null
    customer_name: string | null
    catalog_source: string | null
    default_currency: string
    external_project_id: string | null
    created_at: string
    updated_at: string
    catalog_item_count: number
    competitor_count: number
    scrape_seed_count: number
  }>(sql`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.customer_name,
      p.catalog_source,
      p.default_currency,
      p.external_project_id,
      p.created_at,
      p.updated_at,
      (
        SELECT COUNT(*)
        FROM pi_project_catalog_items pci
        WHERE pci.project_id = p.id
      ) AS catalog_item_count,
      (
        SELECT COUNT(*)
        FROM pi_project_competitors pc
        WHERE pc.project_id = p.id
          AND COALESCE(pc.is_active, 1) = 1
      ) AS competitor_count,
      (
        SELECT COUNT(*)
        FROM pi_project_scrape_targets pst
        WHERE pst.project_id = p.id
          AND COALESCE(pst.is_active, 1) = 1
      ) AS scrape_seed_count
    FROM pi_projects p
    ORDER BY datetime(p.updated_at) DESC, p.name ASC
  `)

  return {
    projects: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      customerName: row.customer_name,
      catalogSource: row.catalog_source,
      defaultCurrency: row.default_currency,
      externalProjectId: row.external_project_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      counts: {
        catalogItems: Number(row.catalog_item_count ?? 0),
        competitors: Number(row.competitor_count ?? 0),
        scrapeSeeds: Number(row.scrape_seed_count ?? 0),
      },
    })),
  }
})
