import { NextRequest, NextResponse } from 'next/server'
import { analyseSite } from '@/lib/analyser'

export async function POST(req: NextRequest) {
    try {
        const { siteId } = await req.json()

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
