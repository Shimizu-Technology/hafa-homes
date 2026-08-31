/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

type Association = {
  applinks: {
    details: Array<{
      appIDs: string[]
      components: Array<{ '/': string }>
    }>
  }
}

describe('Apple universal-link deployment contract', () => {
  it('publishes the production app identity and exact customer record paths', () => {
    const associationUrl = new URL('../public/.well-known/apple-app-site-association', import.meta.url)
    const association = JSON.parse(readFileSync(associationUrl, 'utf8')) as Association
    const detail = association.applinks.details[0]
    const paths = detail.components.map((component) => component['/'])

    expect(detail.appIDs).toContain('4T358A5S74.com.shimizutechnology.hafahomes')
    expect(paths).toContain('/account/requests/*')
    expect(paths).toContain('/listings/*')
    expect(paths.some((path) => path.startsWith('/admin'))).toBe(false)
  })

  it('serves the association file before the SPA fallback with an explicit JSON content type', () => {
    const publicUrl = (name: string) => new URL(`../public/${name}`, import.meta.url)
    const redirects = readFileSync(publicUrl('_redirects'), 'utf8')
    const headers = readFileSync(publicUrl('_headers'), 'utf8')

    expect(redirects.indexOf('/.well-known/apple-app-site-association')).toBeLessThan(redirects.indexOf('/*    /index.html'))
    expect(headers).toContain('Content-Type: application/json')
  })
})
