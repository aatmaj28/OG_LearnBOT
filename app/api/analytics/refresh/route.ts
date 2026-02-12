import { NextResponse } from "next/server"
import { ensureDatabaseInitialized } from "@/lib/init-db"
import { triggerAnalyticsProcessing } from "@/lib/analytics-worker"

/**
 * POST /api/analytics/refresh
 * Runs the same analytics processing as the 4-hour worker (summaries, sentiment, topics)
 * and returns when done. Client can then refetch dashboard data.
 */
export async function POST() {
  try {
    await ensureDatabaseInitialized()
    await triggerAnalyticsProcessing()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Analytics] Refresh failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics refresh failed" },
      { status: 500 }
    )
  }
}
