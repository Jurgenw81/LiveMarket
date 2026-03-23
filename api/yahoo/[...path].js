export const config = { runtime: 'edge' }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://finance.yahoo.com/',
}

// Cached within the same edge worker instance
let cachedCrumb = null
let cachedCookie = null

async function fetchCrumb() {
  // Try direct crumb fetch (works when Yahoo sets a cookie inline)
  const r1 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: BASE_HEADERS,
  })
  if (r1.ok) {
    const text = await r1.text()
    if (text && text !== 'Unauthorized' && !text.startsWith('<')) {
      return { crumb: text.trim(), cookie: r1.headers.get('set-cookie')?.split(';')[0] || '' }
    }
  }

  // Fallback: get a session cookie from fc.yahoo.com first
  const r0 = await fetch('https://fc.yahoo.com/', { headers: BASE_HEADERS })
  const rawCookie = r0.headers.get('set-cookie') || ''
  const cookie = rawCookie.split(/,(?=[^ ])/).map(c => c.split(';')[0]).filter(Boolean).join('; ')

  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    headers: { ...BASE_HEADERS, Cookie: cookie },
  })
  const crumb = (await r2.text()).trim()
  return { crumb, cookie }
}

export default async function handler(request) {
  const url = new URL(request.url)
  // Strip /api/yahoo prefix to get the actual Yahoo Finance path
  const path = url.pathname.replace(/^\/api\/yahoo/, '')

  if (!cachedCrumb) {
    try {
      const { crumb, cookie } = await fetchCrumb()
      cachedCrumb = crumb
      cachedCookie = cookie
    } catch {
      // proceed without crumb; some symbols still work
    }
  }

  const sep = url.search ? '&' : '?'
  const crumbParam = cachedCrumb ? `${sep}crumb=${encodeURIComponent(cachedCrumb)}` : ''
  const upstream = `https://query2.finance.yahoo.com${path}${url.search}${crumbParam}`

  const headers = { ...BASE_HEADERS }
  if (cachedCookie) headers['Cookie'] = cachedCookie

  const upstreamRes = await fetch(upstream, { headers })

  // Invalidate crumb if Yahoo says it's expired
  if (upstreamRes.status === 401) {
    cachedCrumb = null
    cachedCookie = null
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': upstreamRes.headers.get('content-type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
