import { contentTypeFor, safeObjectName, validateSlug } from '../_shared.js'

export async function onRequestGet({ params, env }) {
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean)
  const slug = parts[0]
  if (!validateSlug(slug)) return notFound()

  const assetPath = parts.length > 1 ? parts.slice(1).join('/') : 'index.html'
  if (!safeObjectName(assetPath)) return notFound()

  const object = await env.BUCKET.get(`pages/${slug}/${assetPath}`)
  if (!object) return notFound()

  const headers = new Headers()
  if (object.writeHttpMetadata) object.writeHttpMetadata(headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', contentTypeFor(assetPath))
  headers.set('Cache-Control', assetPath === 'index.html' ? 'public, max-age=60' : 'public, max-age=31536000, immutable')

  if (assetPath === 'index.html') {
    const html = await object.text()
    return new Response(injectBase(html, slug), { headers })
  }

  return new Response(object.body, { headers })
}

function injectBase(html, slug) {
  if (/<base\s/i.test(html)) return html
  const base = `<base href="/p/${slug}/">`
  return /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${base}`) : base + html
}

function notFound() {
  return new Response('<!doctype html><title>404</title><h1>404 - Page not found</h1>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  })
}
