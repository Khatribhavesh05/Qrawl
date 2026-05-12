import Ajv from 'ajv'
import schema from './agents-schema-validator.json'

// ajv v6 — formats (uri, date-time) are built-in with { format: 'fast' }
const ajv = new Ajv({ allErrors: true, format: 'fast' })

const validate = ajv.compile(schema)

export interface ValidationResult {
    valid: boolean
    errors: string[]
}

export function validateAgentsJson(json: unknown): ValidationResult {
    const valid = validate(json) as boolean

    if (valid) {
        return { valid: true, errors: [] }
    }

    const errors = (validate.errors ?? []).map(err => {
        const path = err.dataPath || '(root)'
        return `${path}: ${err.message}`
    })

    return { valid: false, errors }
}
