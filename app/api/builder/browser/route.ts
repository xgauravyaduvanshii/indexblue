import { NextRequest } from 'next/server';

const HOP_BY_HOP_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'frame-options',
  'permissions-policy',
]);

function injectHtmlShell(html: string, baseUrl: string, tabId: string | null) {
  const baseTag = `<base href="${baseUrl}">`;
  const bootstrap = `
<template data-indexblue-browser-proxy="1"></template>
<script>
(function () {
  var currentTabId = ${JSON.stringify(tabId)};

  function buildProxyUrl(nextUrl) {
    var params = new URLSearchParams();
    params.set('url', nextUrl);
    if (currentTabId) params.set('tabId', currentTabId);
    return '/api/builder/browser?' + params.toString();
  }

  function postState(extra) {
    try {
      window.parent.postMessage(Object.assign({
        type: 'indexblue-browser-state',
        url: window.location.href,
        title: document.title || window.location.href,
        tabId: currentTabId
      }, extra || {}), window.location.origin);
    } catch (error) {}
  }

  window.addEventListener('load', function () {
    postState();
  });

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    var nextUrl = new URL(href, ${JSON.stringify(baseUrl)}).toString();
    var wantsNewTab =
      anchor.getAttribute('target') === '_blank' ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.button === 1;
    if (wantsNewTab) {
      event.preventDefault();
      window.parent.postMessage({
        type: 'indexblue-browser-open-tab',
        url: nextUrl,
        title: anchor.textContent || nextUrl,
        sourceTabId: currentTabId
      }, window.location.origin);
      return;
    }
    event.preventDefault();
    window.location.href = buildProxyUrl(nextUrl);
  }, true);

  document.addEventListener('auxclick', function (event) {
    if (event.button !== 1) return;
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    event.preventDefault();
    var nextUrl = new URL(href, ${JSON.stringify(baseUrl)}).toString();
    window.parent.postMessage({
      type: 'indexblue-browser-open-tab',
      url: nextUrl,
      title: anchor.textContent || nextUrl,
      sourceTabId: currentTabId
    }, window.location.origin);
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    var action = form.getAttribute('action') || ${JSON.stringify(baseUrl)};
    if (!action) return;
    event.preventDefault();
    var targetUrl = new URL(action, ${JSON.stringify(baseUrl)});
    var method = (form.getAttribute('method') || 'GET').toUpperCase();
    if (method !== 'GET') {
      window.parent.postMessage({
        type: 'indexblue-browser-state',
        url: targetUrl.toString(),
        title: document.title || targetUrl.toString(),
        tabId: currentTabId,
        blockedReason: 'Form submission with non-GET method must open outside the builder browser.'
      }, window.location.origin);
      window.open(targetUrl.toString(), '_blank', 'noopener,noreferrer');
      return;
    }
    var formData = new FormData(form);
    var params = new URLSearchParams();
    formData.forEach(function (value, key) {
      if (typeof value === 'string') params.append(key, value);
    });
    targetUrl.search = params.toString();
    window.location.href = buildProxyUrl(targetUrl.toString());
  }, true);
})();
</script>`;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}${bootstrap}`);
  }
  return `<!doctype html><html><head>${baseTag}${bootstrap}</head><body>${html}</body></html>`;
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get('url');
  const tabId = request.nextUrl.searchParams.get('tabId');
  if (!target) {
    return new Response('Missing url parameter.', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response('Invalid URL.', { status: 400 });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return new Response('Only http and https URLs are supported.', { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        'user-agent':
          request.headers.get('user-agent') ??
          'Mozilla/5.0 (compatible; Indexblue Builder Browser/1.0)',
        accept: request.headers.get('accept') ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': request.headers.get('accept-language') ?? 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    return new Response(
      `<!doctype html><html><body style="font-family: sans-serif; padding: 24px;" data-indexblue-browser-error="1"><h1>Unable to open page</h1><p>${
        error instanceof Error ? error.message : 'Unknown network error.'
      }</p><script>window.parent&&window.parent.postMessage({type:'indexblue-browser-state',tabId:${JSON.stringify(
        tabId,
      )},url:${JSON.stringify(
        parsed.toString(),
      )},title:'Unable to open page',blockedReason:${JSON.stringify(
        error instanceof Error ? error.message : 'Unknown network error.',
      )}}, window.location.origin)</script></body></html>`,
      {
        status: 502,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
      },
    );
  }

  const headers = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }
  headers.set('x-indexblue-browser-proxy', '1');

  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    const html = await upstream.text();
    return new Response(injectHtmlShell(html, upstream.url, tabId), {
      status: upstream.status,
      headers,
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
