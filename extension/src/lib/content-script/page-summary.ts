/**
 * Content Script — Page Summary Collector
 * Collects page metadata and text content for LLM context.
 */

interface PageSummary { title: string; url: string; description: string; headings: string[]; mainText: string; formInfo: { formCount: number; fieldCount: number; formPurposes: string[] } }

export function collectPageSummary(): PageSummary {
  const title = document.title || ''
  const url = window.location.href
  const metaDesc = document.querySelector('meta[name="description"]')
  const description = metaDesc?.getAttribute('content') || ''

  const headings: string[] = []
  document.querySelectorAll('h1, h2, h3').forEach(h => { const t = h.textContent?.trim(); if (t && t.length > 2) headings.push(t) })

  let mainText = ''
  const main = document.querySelector('main, article, [role="main"], .main-content, #content, .content')
  if (main) {
    mainText = main.textContent?.trim() || ''
  } else {
    const body = document.body.cloneNode(true) as HTMLElement
    body.querySelectorAll('script, style, nav, footer, header, .nav, .footer, .header, .sidebar, .menu').forEach(el => el.remove())
    mainText = body.textContent?.trim() || ''
  }
  mainText = mainText.replace(/\s+/g, ' ').trim().slice(0, 3000)

  const forms = document.querySelectorAll('form')
  const formPurposes: string[] = []
  let totalFields = 0
  forms.forEach(form => {
    const fields = form.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select')
    totalFields += fields.length
    const action = (form as HTMLFormElement).action || ''
    const fid = form.id || ''
    const ft = form.textContent?.toLowerCase() || ''
    const combined = fid + ft + action
    if (/login|sign.?in/i.test(combined)) formPurposes.push('login')
    else if (/register|sign.?up|create.?account/i.test(combined)) formPurposes.push('register')
    else if (/search/i.test(combined)) formPurposes.push('search')
    else if (/checkout|payment/i.test(combined)) formPurposes.push('checkout')
    else if (/contact|feedback|support/i.test(combined)) formPurposes.push('contact')
  })

  return { title, url, description, headings, mainText, formInfo: { formCount: forms.length, fieldCount: totalFields, formPurposes } }
}
