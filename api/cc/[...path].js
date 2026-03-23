export default async function handler(req, res) {
  const path = req.url.replace(/^\/api\/cc/, '')
  const upstream = `https://min-api.cryptocompare.com${path}`

  const upstreamRes = await fetch(upstream)
  const body = await upstreamRes.text()

  res
    .status(upstreamRes.status)
    .setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'application/json')
    .setHeader('Access-Control-Allow-Origin', '*')
    .send(body)
}
