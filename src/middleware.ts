import { NextResponse, type NextRequest } from 'next/server'

/**
 * Single-tenant MVP: no auth gates. Legacy auth URLs redirect home.
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (
    path === '/login' ||
    path === '/signup' ||
    path === '/forgot-password' ||
    path.startsWith('/join/')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (path === '/dashboard') {
    const url = request.nextUrl.clone()
    url.pathname = '/home'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
