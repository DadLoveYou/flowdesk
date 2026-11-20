import { it } from 'node:test'
import assert from 'node:assert/strict'
import { emptyForm, submissionErrors, rolePermissions } from '../shared/domain.js'
import { formSchema } from '../shared/validation.js'
import { applicantFields, detailFields, isFieldVisible } from '../src/lib/form-schema.js'
it('rejects nonexistent calendar dates and accepts valid leap days', () => {
  assert.equal(formSchema.safeParse({ ...emptyForm(), startDate: '2026-02-31' }).success, false)
  assert.equal(formSchema.safeParse({ ...emptyForm(), startDate: '2028-02-29' }).success, true)
})
it('requires company identity only for enterprise applicants', () => {
  assert.ok(submissionErrors(emptyForm()).companyName)
  assert.equal(submissionErrors({ ...emptyForm(), applicantType: 'personal' }).companyName, undefined)
})
it('requires budget explanations above the threshold and checks date ordering', () => {
  assert.ok(submissionErrors({ ...emptyForm(), amount: 20001 }).justification)
  assert.equal(submissionErrors({ ...emptyForm(), amount: 20000 }).justification, undefined)
  assert.ok(submissionErrors({ ...emptyForm(), startDate: '2026-11-21', endDate: '2026-11-20' }).endDate)
})
it('keeps account management and approval capabilities outside operator permissions', () => {
  assert.ok(rolePermissions.operator.includes('request:create'))
  assert.ok(!rolePermissions.operator.includes('request:review'))
  assert.ok(!rolePermissions.reviewer.includes('users'))
})
it('evaluates serializable field conditions without executing scripts', () => {
  const company = applicantFields.find(f => f.key === 'companyName')!, budget = detailFields.find(f => f.key === 'justification')!
  assert.equal(isFieldVisible(company, { ...emptyForm(), applicantType: 'personal' }), false)
  assert.equal(isFieldVisible(company, emptyForm()), true)
  assert.equal(isFieldVisible(budget, { ...emptyForm(), amount: 20000 }), false)
  assert.equal(isFieldVisible(budget, { ...emptyForm(), amount: 20001 }), true)
  assert.ok(JSON.parse(JSON.stringify(applicantFields))[2].visible)
})
