export const slugPattern = /^[a-z0-9-]{3,32}$/
export const manifestKey = '_manifest.json'

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export function validateSlug(slug) {
  return typeof slug === 'string' && slugPattern.test(slug)
}

export function safeObjectName(name) {
  return typeof name === 'string' && name.length > 0 && !name.startsWith('/') && !name.split('/').some((part) => part === '' || part === '..')
}

export async function readManifest(bucket) {
  const object = await bucket.get(manifestKey)
  if (!object) return []
  try {
    const value = await object.json()
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

export async function writeManifest(bucket, manifest) {
  await bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: 'application/json' }
  })
}

export async function listAll(bucket, prefix) {
  const objects = []
  let cursor = undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    objects.push(...page.objects)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return objects
}

export function checkAdmin(request, env) {
  const adminToken = env.TOKEN
  if (!adminToken) return false
  const token = request.headers.get('X-Admin-Token')
  return token === adminToken
}

export function contentTypeFor(path) {
  const ext = path.split('.').pop().toLowerCase()
  return {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    woff2: 'font/woff2',
    woff: 'font/woff'
  }[ext] || 'application/octet-stream'
}
