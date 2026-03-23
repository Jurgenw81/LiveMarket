export default async function handler(req, res) {
  const path = req.url.replace(/^\/api\/yahoo/, '')
  const upstream = `https://query1.finance.yahoo.com${path}`

  const upstreamRes = await fetch(upstream, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  })
  const body = await upstreamRes.text()

  res
    .status(upstreamRes.status)
    .setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    .setHeader('Access-Control-Allow-Origin', '*')
    .send(body)
}
