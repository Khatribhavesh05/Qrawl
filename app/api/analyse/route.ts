import { NextRequest, NextResponse } from 'next/server'
import { analyseSite } from '@/lib/analyser'

export async function POST(req: NextRequest) {
    try {
        const { siteId, demo } = await req.json()
        if (demo === true && siteId === '8b20f9f2-2937-4558-a5c3-3b713c721bc9') {
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
