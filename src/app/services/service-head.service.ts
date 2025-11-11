import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { of } from 'rxjs';

export interface ServiceHead {
  _id: string;
  testName: string;
  price: number;
  category: string;
  formattedPrice: string;
}

export interface ServiceHeadResponse {
  success: boolean;
  category: string;
  count: number;
  data: ServiceHead[];
  searchTerm?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ServiceHeadService {
  private baseUrl = `${environment.apiUrl}/service-heads`;
  
  // Cache for service heads by category
  private serviceHeadsCache = new Map<string, ServiceHead[]>();
  private loadingSubject = new BehaviorSubject<boolean>(false);
  
  public loading$ = this.loadingSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Get service heads by category NAME (string)
   */
  getServiceHeadsByCategory(category: string, search?: string): Observable<ServiceHead[]> {
    this.loadingSubject.next(true);

    let params = new HttpParams();
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }

    const cacheKey = `${category.toUpperCase()}_${search || ''}`;

    return this.http.get<ServiceHeadResponse>(`${this.baseUrl}/${category.toUpperCase()}`, { params })
      .pipe(
        map(response => {
          this.loadingSubject.next(false);

          if (response.success && response.data) {
            // Cache the results
            this.serviceHeadsCache.set(cacheKey, response.data);
            return response.data;
          } else {
            console.warn('No service heads found for category:', category);
            return [];
          }
        }),
        catchError(error => {
          this.loadingSubject.next(false);
          console.error('Error fetching service heads:', error);

          // Return cached data if available
          const cachedData = this.serviceHeadsCache.get(cacheKey);
          if (cachedData) {
            console.log('Returning cached data for:', cacheKey);
            return of(cachedData);
          }

          return of([]);
        })
      );
  }

  /**
   * Get service heads by CategoryHead ObjectId (no uppercasing)
   * Optionally bypass caches with nocache flag
   */
  getServiceHeadsByCategoryId(categoryId: string, search?: string, nocache: boolean = false): Observable<ServiceHead[]> {
    this.loadingSubject.next(true);

    let params = new HttpParams();
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }
    if (nocache) {
      params = params.set('_', Date.now().toString());
    }

    return this.http.get<ServiceHeadResponse>(`${this.baseUrl}/${categoryId}`, { params })
      .pipe(
        map(response => {
          this.loadingSubject.next(false);
          if (response && response.data) {
            return response.data;
          }
          return [];
        }),
        catchError(error => {
          this.loadingSubject.next(false);
          console.error('Error fetching service heads by categoryId:', error);
          return of([]);
        })
      );
  }

  /**
   * Get all service heads
   */
  getAllServiceHeads(category?: string, search?: string): Observable<ServiceHead[]> {
    this.loadingSubject.next(true);
    
    let params = new HttpParams();
    if (category) {
      params = params.set('category', category.toUpperCase());
    }
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.get<ServiceHeadResponse>(this.baseUrl, { params })
      .pipe(
        map(response => {
          this.loadingSubject.next(false);
          
          if (response.success && response.data) {
            return response.data;
          } else {
            return [];
          }
        }),
        catchError(error => {
          this.loadingSubject.next(false);
          console.error('Error fetching all service heads:', error);
          return of([]);
        })
      );
  }

  /**
   * Seed default service heads data
   */
  seedServiceHeads(): Observable<any> {
    return this.http.post(`${this.baseUrl}/seed`, {})
      .pipe(
        map(response => {
          console.log('Seeding response:', response);
          // Clear cache after seeding
          this.clearCache();
          return response;
        }),
        catchError(error => {
          console.error('Error seeding service heads:', error);
          return of({ success: false, message: 'Error seeding data' });
        })
      );
  }

  /**
   * Search service heads within a category
   */
  searchServiceHeads(category: string, searchTerm: string): Observable<ServiceHead[]> {
    if (!searchTerm || !searchTerm.trim()) {
      return this.getServiceHeadsByCategory(category);
    }
    
    return this.getServiceHeadsByCategory(category, searchTerm);
  }

  /**
   * Get cached service heads for a category
   */
  getCachedServiceHeads(category: string, search?: string): ServiceHead[] {
    const cacheKey = `${category.toUpperCase()}_${search || ''}`;
    return this.serviceHeadsCache.get(cacheKey) || [];
  }

  /**
   * Check if data is cached for a category
   */
  isCached(category: string, search?: string): boolean {
    const cacheKey = `${category.toUpperCase()}_${search || ''}`;
    return this.serviceHeadsCache.has(cacheKey);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.serviceHeadsCache.clear();
  }

  /**
   * Get available categories
   */
  getAvailableCategories(): string[] {
    return ['PATHOLOGY', 'X-RAY', 'ECG', 'SHALAKYA', 'SHALYA', 'PANCHKARMA'];
  }

  /**
   * Validate category
   */
  isValidCategory(category: string): boolean {
    return this.getAvailableCategories().includes(category.toUpperCase());
  }

  /**
   * Format price for display
   */
  formatPrice(price: number): string {
    return `₹${price}`;
  }

  /**
   * Get service head by ID from cache
   */
  getServiceHeadById(id: string): ServiceHead | null {
    for (const serviceHeads of this.serviceHeadsCache.values()) {
      const found = serviceHeads.find(sh => sh._id === id);
      if (found) {
        return found;
      }
    }
    return null;
  }
}
