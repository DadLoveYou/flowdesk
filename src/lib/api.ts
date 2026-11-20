export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly fields?: Record<string, string>) { super(message) }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth')) window.dispatchEvent(new Event('session-expired'))
    throw new HttpError(response.status, body.message || '请求失败，请稍后重试', body.fields)
  }
  if (path.startsWith('/requests') && ['POST', 'PUT'].includes(options.method || '')) window.dispatchEvent(new Event('business-updated'))
  return body as T
}
export const json = (body: unknown) => JSON.stringify(body)
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试'
export const money = (n: number) => new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 0 }).format(n)
export const fileSize = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`
export const dateTime = (value: string, short = false) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', ...(short ? {} : { hour: '2-digit', minute: '2-digit', hour12: false }) }).format(new Date(value))
