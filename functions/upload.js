import { json, readManifest, safeObjectName, validateSlug, writeManifest } from './_shared.js'

export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData()
    const slug = form.get('slug')
    const name = String(form.get('name') || slug).trim() || slug
    const mode = form.get('mode')

    if (!slug) return json({ ok: false, error: 'missing_slug' }, 400)
    if (!validateSlug(slug)) return json({ ok: false, error: 'invalid_slug' }, 400)
    if (!mode) return json({ ok: false, error: 'missing_mode' }, 400)

    const manifest = await readManifest(env.BUCKET)
    if (manifest.some((page) => page.slug === slug)) return json({ ok: false, error: 'slug_exists' }, 409)

    let fileCount = 0
    if (mode === 'editor') {
      const htmlContent = form.get('htmlContent')
      if (!htmlContent || !String(htmlContent).trim()) return json({ ok: false, error: 'missing_html_content' }, 400)
      await env.BUCKET.put(`pages/${slug}/index.html`, String(htmlContent), {
        httpMetadata: { contentType: 'text/html; charset=utf-8' }
      })
      fileCount = 1
    } else if (mode === 'files') {
      const files = Array.from(form.entries()).filter(([key, value]) => key.startsWith('file_') && value && typeof value.arrayBuffer === 'function').map(([, value]) => value)
      if (!files.some((file) => file.name === 'index.html')) return json({ ok: false, error: 'no_html_in_files' }, 400)
      for (const file of files) {
        if (!safeObjectName(file.name)) return json({ ok: false, error: 'invalid_file_path' }, 400)
        await env.BUCKET.put(`pages/${slug}/${file.name}`, file.stream(), {
          httpMetadata: { contentType: file.type || 'application/octet-stream' }
        })
      }
      fileCount = files.length
    } else {
      return json({ ok: false, error: 'invalid_mode' }, 400)
    }

    const now = new Date().toISOString()
    manifest.push({
      slug,
      name,
      createdAt: now,
      updatedAt: now,
      url: `/p/${slug}`,
      fileCount
    })
    await writeManifest(env.BUCKET, manifest)
    return json({ ok: true, slug, url: `/p/${slug}` })
  } catch {
    return json({ ok: false, error: 'r2_write_failed' }, 500)
  }
}
