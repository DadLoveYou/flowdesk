import type { RequestForm } from '../../shared/domain'
import config from './form-fields.json'
export interface Condition { field: keyof RequestForm; operator: 'eq' | 'gt'; value: string | number }
export interface FieldSchema { key: keyof RequestForm; label: string; type: 'text' | 'select' | 'number' | 'date' | 'textarea'; placeholder?: string; options?: { label: string; value: string }[]; required?: boolean; full?: boolean; help?: string; visible?: Condition }
const schema = config as { applicantFields: FieldSchema[]; detailFields: FieldSchema[] }
export const applicantFields = schema.applicantFields
export const detailFields = schema.detailFields
export function isFieldVisible(field: FieldSchema, form: RequestForm) {
  if (!field.visible) return true
  const { field: key, operator, value } = field.visible
  if (operator === 'eq') return form[key] === value
  if (operator === 'gt') return typeof form[key] === 'number' && (form[key] as number) > Number(value)
  return false
}
