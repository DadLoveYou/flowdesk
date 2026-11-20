import { test, expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'

async function login(page: Page, role: 'admin' | 'reviewer' | 'operator') {
  await page.goto('/login')
  await page.getByRole('button', { name: { admin: '管理员 全部功能', reviewer: '审核员 审核与查看', operator: '业务专员 申请与上传' }[role] }).click()
  await expect(page.getByRole('heading', { name: /今天也从容协作/ })).toBeVisible()
}
for (const role of ['admin', 'reviewer', 'operator'] as const) {
  test(`${role}: dynamically registers the correct navigation and preserves sessions on refresh`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await login(page, role)
    const nav = page.getByRole('navigation', { name: '主导航' })
    await expect(nav.getByRole('link', { name: '账号与权限' })).toHaveCount(role === 'admin' ? 1 : 0)
    await expect(nav.getByRole('link', { name: /审核中心/ })).toHaveCount(role === 'operator' ? 0 : 1)
    await expect(page.getByRole('link', { name: '新建申请', exact: true })).toHaveCount(role === 'reviewer' ? 0 : 1)
    await page.reload(); await expect(page.getByRole('heading', { name: /今天也从容协作/ })).toBeVisible()
    await nav.getByRole('link', { name: '申请管理', exact: true }).click()
    await expect(page.getByRole('columnheader', { name: '预算金额', exact: true })).toHaveCount(role === 'operator' ? 0 : 1)
    await expect(page.getByRole('table').getByRole('row')).not.toHaveCount(1)
    if (role === 'operator') { await page.goto('/users'); await expect(page.getByRole('heading', { name: '这个页面暂时无法访问' })).toBeVisible() }
    expect(errors).toEqual([])
  })
}
test('creates, rejects, revises and approves a business request across roles', async ({ browser }) => {
  const applicantContext = await browser.newContext(), reviewerContext = await browser.newContext()
  const applicant = await applicantContext.newPage(), reviewer = await reviewerContext.newPage()
  const title = `端到端采购申请-${randomUUID().slice(0, 8)}`
  await login(applicant, 'operator'); await applicant.getByRole('link', { name: '新建申请', exact: true }).click()
  await applicant.getByLabel('申请标题').fill(title)
  await applicant.getByLabel('申请主体').selectOption('personal'); await expect(applicant.getByLabel('企业名称')).toHaveCount(0)
  await applicant.getByLabel('预算金额').fill('25000'); await expect(applicant.getByLabel('预算依据')).toBeVisible()
  await applicant.getByLabel('预算依据').fill('已对比三家供应商，预算依据完整且满足研发需求。')
  await applicant.getByLabel('开始日期').fill('2026-11-20'); await applicant.getByLabel('结束日期').fill('2026-11-27')
  await applicant.getByLabel('申请说明').fill('申请采购用于研发测试的设备，现有设备已无法满足业务需求。')
  await applicant.getByRole('button', { name: '提交申请', exact: true }).click()
  await expect(applicant.getByRole('heading', { name: title, exact: true })).toBeVisible(); const url = applicant.url()
  await login(reviewer, 'reviewer'); await reviewer.goto(url)
  await reviewer.getByRole('button', { name: '退回修改', exact: true }).click(); await reviewer.getByLabel('修改意见').fill('请补充预算中的设备型号与配置。')
  await reviewer.getByRole('button', { name: '确认退回', exact: true }).click(); await expect(reviewer.getByRole('dialog')).toHaveCount(0)
  await applicant.reload(); await applicant.getByRole('link', { name: '修改并重新提交' }).click()
  await applicant.getByLabel('申请说明').fill('采购研发工作站，配置为 32 GB 内存与 1 TB 存储，预算和型号已补充完整。')
  await applicant.getByRole('button', { name: '提交申请', exact: true }).click(); await expect(applicant.getByRole('heading', { name: title })).toBeVisible()
  await reviewer.reload(); await reviewer.getByRole('button', { name: '审核通过', exact: true }).click()
  await reviewer.getByLabel('审核意见（选填）').fill('补充资料符合要求，同意申请。'); await reviewer.getByRole('button', { name: '确认通过', exact: true }).click()
  await expect(reviewer.getByRole('dialog')).toHaveCount(0); await applicant.reload()
  await expect(applicant.locator('.detail-meta .status-badge')).toHaveText('已通过')
  await expect(applicant.getByText('请补充预算中的设备型号与配置。', { exact: true })).toBeVisible()
  await applicant.screenshot({ path: test.info().outputPath('request-flow.png'), fullPage: true })
  await applicantContext.close(); await reviewerContext.close()
})
test('recovers account-scoped IndexedDB drafts after a page reload', async ({ page }) => {
  await login(page, 'operator'); await page.goto('/requests/new')
  const title = `本地草稿-${randomUUID().slice(0, 8)}`
  await page.getByLabel('申请标题').fill(title); await page.getByLabel('申请主体').selectOption('personal'); await page.getByLabel('预算金额').fill('21000')
  await expect(page.getByText('草稿已自动保存到本机')).toBeVisible(); await page.reload()
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(page.getByLabel('申请标题')).toHaveValue(title); await expect(page.getByLabel('预算依据')).toBeVisible()
  await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await expect(page.locator('.detail-meta .status-badge')).toHaveText('草稿')
})
test('pauses, resumes after reload, downloads and instantly reuses a real multi-chunk file', async ({ page }) => {
  await login(page, 'operator'); await page.goto('/files')
  const name = `e2e-${randomUUID().slice(0, 8)}.bin`, bytes = Buffer.alloc(8 * 1024 * 1024 + 99, 73), path = test.info().outputPath(name)
  writeFileSync(path, bytes)
  let hold = true
  await page.route('**/api/uploads/*/chunks/*', async route => { if (hold && !route.request().url().endsWith('/0')) await new Promise(resolve => setTimeout(resolve, 1200)); await route.continue().catch(() => {}) })
  const firstChunk = page.waitForResponse(response => response.url().endsWith('/chunks/0') && response.ok())
  await page.getByLabel('选择上传文件').setInputFiles(path); await firstChunk
  await page.getByRole('button', { name: `暂停${name}`, exact: true }).click(); await expect(page.getByText('已暂停 · 进度已保留')).toBeVisible()
  hold = false; await page.reload(); await page.getByLabel('选择上传文件').setInputFiles(path)
  await expect(page.getByText('上传完成，完整性校验通过', { exact: true })).toBeVisible()
  const row = page.getByRole('row').filter({ hasText: name }); const downloadPromise = page.waitForEvent('download'); await row.getByRole('link', { name: '下载', exact: true }).click()
  const download = await downloadPromise; expect(readFileSync((await download.path())!)).toEqual(bytes)
  await page.getByLabel('选择上传文件').setInputFiles(path); await expect(page.getByText('文件已存在，秒传完成', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('files.png'), fullPage: true })
})
test('creates a member and manages its permissions through the admin interface', async ({ page }) => {
  await login(page, 'admin'); await page.goto('/users'); await page.getByRole('button', { name: '添加成员' }).click()
  const username = `member_${randomUUID().slice(0, 8)}`
  await page.getByLabel('姓名', { exact: true }).fill('端到端成员'); await page.getByLabel('账号', { exact: true }).fill(username)
  await page.getByLabel('初始密码').fill('DemoPassword@123'); await page.getByRole('button', { name: '创建成员', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  const row = page.getByRole('row').filter({ hasText: username }); await row.getByRole('button', { name: '管理', exact: true }).click()
  await page.getByLabel('成员角色').selectOption('reviewer'); await page.getByRole('button', { name: '保存修改', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toContainText('审核员')
})
test('mobile navigation and forms stay within a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await login(page, 'operator')
  await page.getByRole('button', { name: '打开导航', exact: true }).click(); await page.getByRole('navigation').getByRole('link', { name: '申请管理', exact: true }).click()
  await expect(page.getByRole('heading', { name: '申请管理.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.getByRole('link', { name: '新建申请', exact: true }).click(); await expect(page.getByRole('heading', { name: '新建申请.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.screenshot({ path: test.info().outputPath('mobile-form.png'), fullPage: true })
})
