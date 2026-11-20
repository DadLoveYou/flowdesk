import { z } from 'zod'
import { categories, departments } from './domain.js'
const dateField = z.string().refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, '日期格式不正确')
export const formSchema = z.object({
  title: z.string().trim().max(100), category: z.enum(categories), department: z.enum(departments), priority: z.enum(['normal', 'urgent']),
  applicantType: z.enum(['enterprise', 'personal']), companyName: z.string().trim().max(100), creditCode: z.string().trim().max(18),
  contact: z.string().trim().max(50), amount: z.number().finite().min(0).max(100000000), startDate: dateField, endDate: dateField,
  description: z.string().max(3000), justification: z.string().max(1000), attachmentIds: z.array(z.string().uuid()).max(10),
}).strict()
