import { rewrite } from '@vercel/edge';

export const config = {
  matcher: ['/:path*'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const headers = request.headers;

  if (pathname.endsWith('/middleware.js') || pathname === '/middleware.js') {
    return new Response("Not Found", { status: 404 });
  }

  const allowedRootFiles = ['/service-worker.js'];
  const isRootFile = /^\/[^/]+\.[^/]+$/.test(pathname);
  if (isRootFile && !allowedRootFiles.includes(pathname)) {
    return new Response("Not Found", { status: 404 });
  }

  if (pathname.startsWith('/api')) {
    return new Response("Not Found", { status: 404 });
  }
  
  return rewrite(request.url);
}
