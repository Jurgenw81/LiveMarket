export default async function handler(req, res) {
  const upstreamPath = (req.url || '').replace(/^\/api\/yahoo/, '')
  const upstream = `https://query2.finance.yahoo.com${upstreamPath}`

  const upstreamRes = await fetch(upstream, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://finance.yahoo.com/',
    },
  })

  const body = await upstreamRes.text()
  res
    .status(upstreamRes.status)
    .setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    .setHeader('Access-Control-Allow-Origin', '*')
    .send(body)
}
