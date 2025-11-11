import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class CacheInterceptor implements HttpInterceptor {
  private cache = new Map<string, { response: HttpResponse<any>, timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<any> {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next.handle(req);
    }

    // Skip caching for certain endpoints (and all reporting APIs to respect filters)
    const skipCachePath = [
      '/settings/me/smtp', // never cache SMTP settings; user expects immediate reflection after Save
      '/settings/me/lab', // do not cache lab branding/settings; Save & Preview should reflect immediately
      '/auth/users', // avoid caching user list (roles screen needs fresh data)
      '/auth/',
      '/login',
      '/logout',
      '/reports/',
      '/pathology-reports', // Always fetch fresh for Pathology All Reports list
      '/pathology-invoice/receipt', // Do not cache invoice-by-receipt lookups
      '/appointments/' // OPD needs fresh data immediately after booking
    ].some(path => req.url.includes(path));

    // Respect explicit no-cache intent via headers or query params
    const cacheControl = req.headers.get('Cache-Control') || '';
    const pragma = req.headers.get('Pragma') || '';
    const hasNoCacheHeader = /no-cache|no-store|must-revalidate/i.test(cacheControl) || /no-cache/i.test(pragma);
    const hasCacheBustingParam = req.params.has('_') || req.params.has('t') || req.params.has('nocache');

    if (skipCachePath || hasNoCacheHeader || hasCacheBustingParam) {
      return next.handle(req);
    }

    // Use full URL with query params as cache key to avoid collisions across different parameters
    const cacheKey = req.urlWithParams || req.url;
    const cachedResponse = this.cache.get(cacheKey);

    // Return cached response if valid
    if (cachedResponse && this.isCacheValid(cachedResponse.timestamp)) {
      console.log('🚀 CACHE HIT:', cacheKey);
      return of(cachedResponse.response);
    }

    // Make request and cache response
    return next.handle(req).pipe(
      tap(event => {
        if (event instanceof HttpResponse) {
          console.log('💾 CACHING:', cacheKey);
          this.cache.set(cacheKey, {
            response: event,
            timestamp: Date.now()
          });
        }
      })
    );
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  // Method to clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Method to clear specific cache entry
  clearCacheEntry(url: string): void {
    this.cache.delete(url);
  }
}
