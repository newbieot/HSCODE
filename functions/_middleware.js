const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdn.sheetjs.com 'sha256-a59+eN0JPa7CD2dZ5CbqWSGeRhIRlN+FvPdtxDwjjFk='; style-src 'self'; img-src 'self' data:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"
};

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === 'hscode.pages.dev') {
    url.hostname = 'hs.posnew.com';
    return Response.redirect(url.toString(), 301);
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  Object.entries(SECURITY_HEADERS).forEach(([name, value]) => headers.set(name, value));
  if (url.pathname.startsWith('/api/')) headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
