import { contentTypeFor, json, listAll, readManifest, safeObjectName, validateSlug, writeManifest } from '../../_shared.js'

export async function onRequestGet({ params, env }) {
  try {
    const slug = params.slug
    const manifest = await readManifest(env.BUCKET)
    const record = manifest.find((page) => page.slug === slug)
    if (!record) return json({ ok: false, error: 'not_found' }, 404)
    const object = await env.BUCKET.get(`pages/${slug}/index.html`)
    if (!object) return json({ ok: false, error: 'index_not_found' }, 404)
    return json({ ok: true, ...record, html: await object.text() })
  } catch {
    return json({ ok: false, error: 'r2_read_failed' }, 500)
  }
}

export async function onRequestDelete({ params, env }) {
  try {
    const slug = params.slug
    const manifest = await readManifest(env.BUCKET)
    if (!manifest.some((page) => page.slug === slug)) return json({ ok: false, error: 'not_found' }, 404)
    const objects = await listAll(env.BUCKET, `pages/${slug}/`)
    await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)))
    await writeManifest(env.BUCKET, manifest.filter((page) => page.slug !== slug))
    return json({ ok: true })
  } catch {
    return json({ ok: false, error: 'r2_delete_failed' }, 500)
  }
}

export async function onRequestPatch({ request, params, env }) {
  try {
    const oldSlug = params.slug
    const body = await request.json()
    const newSlug = body.slug
    if (!newSlug) return json({ ok: false, error: 'missing_slug' }, 400)
    if (!validateSlug(newSlug)) return json({ ok: false, error: 'invalid_slug' }, 400)

    const manifest = await readManifest(env.BUCKET)
    const record = manifest.find((page) => page.slug === oldSlug)
    if (!record) return json({ ok: false, error: 'not_found' }, 404)
    if (manifest.some((page) => page.slug === newSlug)) return json({ ok: false, error: 'slug_exists' }, 409)

    const objects = await listAll(env.BUCKET, `pages/${oldSlug}/`)
    for (const object of objects) {
      const source = await env.BUCKET.get(object.key)
      if (!source) continue
      const relative = object.key.slice(`pages/${oldSlug}/`.length)
      await env.BUCKET.put(`pages/${newSlug}/${relative}`, source.body, {
        httpMetadata: source.httpMetadata
      })
    }
    await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)))

    record.slug = newSlug
    record.url = `/p/${newSlug}`
    await writeManifest(env.BUCKET, manifest)
    return json({ ok: true, slug: newSlug, url: record.url })
  } catch {
    return json({ ok: false, error: 'r2_rename_failed' }, 500)
  }
}

export async function onRequestPut({ request, params, env }) {
  try {
    const slug = params.slug
    const form = await request.formData()
    const nextSlug = String(form.get('slug') || slug).trim()
    const name = String(form.get('name') || slug).trim() || slug
    const mode = form.get('mode')
    if (!mode) return json({ ok: false, error: 'missing_mode' }, 400)
    if (!validateSlug(nextSlug)) return json({ ok: false, error: 'invalid_slug' }, 400)

    const manifest = await readManifest(env.BUCKET)
    const record = manifest.find((page) => page.slug === slug)
    if (!record) return json({ ok: false, error: 'not_found' }, 404)
    if (nextSlug !== slug && manifest.some((page) => page.slug === nextSlug)) return json({ ok: false, error: 'slug_exists' }, 409)

    if (nextSlug !== slug) {
      const oldObjects = await listAll(env.BUCKET, `pages/${slug}/`)
      for (const object of oldObjects) {
        const source = await env.BUCKET.get(object.key)
        if (!source) continue
        const relative = object.key.slice(`pages/${slug}/`.length)
        await env.BUCKET.put(`pages/${nextSlug}/${relative}`, source.body, {
          httpMetadata: source.httpMetadata
        })
      }
      await Promise.all(oldObjects.map((object) => env.BUCKET.delete(object.key)))
      record.slug = nextSlug
      record.url = `/p/${nextSlug}`
    }

    let fileCount = record.fileCount
    if (mode === 'editor') {
      const htmlContent = form.get('htmlContent')
      if (!htmlContent || !String(htmlContent).trim()) return json({ ok: false, error: 'missing_html_content' }, 400)
      await env.BUCKET.put(`pages/${nextSlug}/index.html`, String(htmlContent), {
        httpMetadata: { contentType: 'text/html; charset=utf-8' }
      })
      fileCount = (await listAll(env.BUCKET, `pages/${nextSlug}/`)).length
    } else if (mode === 'files') {
      const files = Array.from(form.entries()).filter(([key, value]) => key.startsWith('file_') && value && typeof value.arrayBuffer === 'function').map(([, value]) => value)
      if (!files.some((file) => file.name === 'index.html')) return json({ ok: false, error: 'no_html_in_files' }, 400)
      for (const file of files) {
        if (!safeObjectName(file.name)) return json({ ok: false, error: 'invalid_file_path' }, 400)
      }
      const objects = await listAll(env.BUCKET, `pages/${nextSlug}/`)
      await Promise.all(objects.map((object) => env.BUCKET.delete(object.key)))
      for (const file of files) {
        await env.BUCKET.put(`pages/${nextSlug}/${file.name}`, file.stream(), {
          httpMetadata: { contentType: file.type || contentTypeFor(file.name) }
        })
      }
      fileCount = files.length
    } else {
      return json({ ok: false, error: 'invalid_mode' }, 400)
    }

    record.name = name
    record.fileCount = fileCount
    record.updatedAt = new Date().toISOString()
    await writeManifest(env.BUCKET, manifest)
    return json({ ok: true, slug: nextSlug, url: record.url })
  } catch {
    return json({ ok: false, error: 'r2_update_failed' }, 500)
  }
}
