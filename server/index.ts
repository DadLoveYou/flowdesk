import { createApp } from './app.js'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const dist = resolve('dist')
const { app, store } = await createApp({
  dataDir: process.env.DATA_DIR || './data',
  demo: process.env.DEMO_MODE !== 'false',
  adminPassword: process.env.ADMIN_PASSWORD,
  secureCookie: process.env.COOKIE_SECURE === 'true',
  staticDir: existsSync(dist) ? dist : undefined,
})
const server = app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log(`FlowDesk API: http://localhost:${process.env.PORT || 3001}`),
)
function shutdown() {
  server.close(() => {
    store.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
