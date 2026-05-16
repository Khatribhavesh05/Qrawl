export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { analyseSite } from '@/lib/analyser'
import { DEMO_SITE_ID } from '@/lib/config/env'

export async function POST(req: NextRequest) {
    try {
        const { siteId, demo } = await req.json()
        if (demo === true && siteId === DEMO_SITE_ID) {
            const demoData = await import('@/lib/demo-data/amazon-audit.json')
            return NextResponse.json(demoData.default)
        }

        if (!siteId || typeof siteId !== 'string') {
            return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
        }

        const result = await analyseSite(siteId)

        return NextResponse.json({
            success: true,
            auditId: result.auditId,
            siteId: result.siteId,
            totalScore: result.totalScore,
            grade: result.grade,
            agentsJson: result.agentsJson
        })

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal server error'
        console.error('Analyse error:', err)
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
