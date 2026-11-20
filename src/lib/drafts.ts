import { openDB } from 'idb'
import type { RequestForm } from '../../shared/domain'
export interface Draft { form: RequestForm; savedAt: string }
const database = openDB('flowdesk-drafts', 1, { upgrade(db) { db.createObjectStore('drafts') } })
export async function readDraft(key: string): Promise<Draft | undefined> { return (await database).get('drafts', key) }
export async function saveDraft(key: string, form: RequestForm) { const savedAt = new Date().toISOString(); await (await database).put('drafts', { form: JSON.parse(JSON.stringify(form)), savedAt }, key); return savedAt }
export async function removeDraft(key: string) { await (await database).delete('drafts', key) }
