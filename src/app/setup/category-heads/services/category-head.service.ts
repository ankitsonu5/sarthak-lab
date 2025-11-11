import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of, forkJoin } from 'rxjs';
import { tap, catchError, map, switchMap } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';

export interface CategoryHead {
  _id?: string;
  categoryId?: string;
  categoryName: string;
  category: 'PATHOLOGY' | 'RADIOLOGY' | 'CARDIOLOGY' | 'NEUROLOGY' | 'ORTHOPEDIC' | 'GENERAL';
  description?: string;
  icon?: string; // Font Awesome class, e.g., 'fa-solid fa-flask-vial'
  color?: string; // Hex color for UI accent
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryHeadService {
  private apiUrl = `${environment.apiUrl}/category-heads`;
  private categoryHeadsSubject = new BehaviorSubject<CategoryHead[]>([]);
  public categoryHeads$ = this.categoryHeadsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadCategoryHeads();
  }

  // Get all category heads
  getCategoryHeads(limit: number = 100, nocache: boolean = false): Observable<CategoryHead[]> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    // Build URL with optional cache-busting param
    const ts = nocache ? `&_=${Date.now()}` : '';

    // Request a larger limit to ensure we get all categories
    return this.http.get<any>(`${this.apiUrl}/list?limit=${limit}${ts}`, { headers }).pipe(
      tap(response => {
        console.log('API Response:', response);
        const categoryHeads = Array.isArray(response) ? response : (response.categoryHeads || []);
        console.log('Category heads loaded from API:', categoryHeads);
        console.log('Total categories loaded:', categoryHeads.length);

        // Log each category for debugging
        categoryHeads.forEach((cat: CategoryHead, index: number) => {
          console.log(`Category ${index + 1}:`, cat.categoryName, cat.categoryId);
        });

        this.categoryHeadsSubject.next(categoryHeads);
      }),
      catchError(error => {
        console.error('Error loading category heads from API:', error);
        console.log('Backend server might not be running. Starting with empty list.');
        this.categoryHeadsSubject.next([]);
        return of([]);
      }),
      map((response: any) => Array.isArray(response) ? response : (response.categoryHeads || []))
    );
  }

  // Get category head by ID
  getCategoryHeadById(id: string): Observable<CategoryHead> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.get<CategoryHead>(`${this.apiUrl}/${id}`, { headers }).pipe(
      catchError(error => {
        console.error('Error fetching category head:', error);
        throw error;
      })
    );
  }

  // Create new category head
  createCategoryHead(categoryHeadData: any): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(this.apiUrl, categoryHeadData, { headers }).pipe(
      tap(response => {
        console.log('Category head created:', response);
        // Refresh the list with cache-busting so UI updates instantly
        this.getCategoryHeads(100, true).subscribe();
      }),
      catchError(error => {
        console.error('Error creating category head:', error);
        throw error;
      })
    );
  }

  // Update category head
  updateCategoryHead(id: string, categoryHeadData: any): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.put<any>(`${this.apiUrl}/${id}`, categoryHeadData, { headers }).pipe(
      tap(response => {
        console.log('Category head updated:', response);
        // Refresh the list with cache-busting
        this.getCategoryHeads(100, true).subscribe();
      }),
      catchError(error => {
        console.error('Error updating category head:', error);
        throw error;
      })
    );
  }

  // Delete category head
  deleteCategoryHead(id: string): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.delete<any>(`${this.apiUrl}/${id}`, { headers }).pipe(
      tap(response => {
        console.log('Category head deleted:', response);
        // Refresh the list with cache-busting
        this.getCategoryHeads(100, true).subscribe();
      }),
      catchError(error => {
        console.error('Error deleting category head:', error);
        throw error;
      })
    );
  }

  // Get category heads by category type
  getCategoryHeadsByType(categoryType: string): Observable<CategoryHead[]> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.get<CategoryHead[]>(`${this.apiUrl}/category/${categoryType}`, { headers }).pipe(
      catchError(error => {
        console.error('Error fetching category heads by type:', error);
        return of([]);
      })
    );
  }

  // Toggle category head status
  toggleCategoryHeadStatus(id: string): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    return this.http.patch<any>(`${this.apiUrl}/${id}/toggle-status`, {}, { headers }).pipe(
      tap(response => {
        console.log('Category head status toggled:', response);
        // Refresh the list with cache-busting
        this.getCategoryHeads(100, true).subscribe();
      }),
      catchError(error => {
        console.error('Error toggling category head status:', error);
        throw error;
      })
    );
  }

  // Private method to load category heads
  private loadCategoryHeads(): void {
    this.getCategoryHeads(100, true).subscribe();
  }

  // Get current category heads from subject
  getCurrentCategoryHeads(): CategoryHead[] {
    return this.categoryHeadsSubject.value;
  }

  /**
   * Ensure default Category Heads exist (adds missing only)
   */
  ensureDefaultCategoryHeads(): Observable<{ created: number; skipped: number }> {
    const defaults: Array<{ categoryName: string; category: CategoryHead['category']; isActive: boolean; icon?: string }> = [
      { categoryName: 'PATHOLOGY', category: 'PATHOLOGY', isActive: true, icon: 'fa-solid fa-flask-vial' },
      { categoryName: 'X-RAY', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-x-ray' },
      { categoryName: 'DIGITAL X-RAY', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-x-ray' },
      { categoryName: 'USG', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-wave-square' },
      { categoryName: 'CT SCAN', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-brain' },
      { categoryName: 'MRI', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-magnet' },
      { categoryName: 'OPG', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-tooth' },
      { categoryName: 'MAMMOGRAPHY', category: 'RADIOLOGY', isActive: true, icon: 'fa-solid fa-user-nurse' },
      { categoryName: 'ECG', category: 'CARDIOLOGY', isActive: true, icon: 'fa-solid fa-heart-pulse' },
      { categoryName: 'EPS', category: 'CARDIOLOGY', isActive: true, icon: 'fa-solid fa-bolt' },
      { categoryName: 'EEG', category: 'NEUROLOGY', isActive: true, icon: 'fa-solid fa-brain' },
      { categoryName: 'CARDIOLOGY', category: 'CARDIOLOGY', isActive: true, icon: 'fa-solid fa-stethoscope' },
      { categoryName: 'OUTSOURCE LAB', category: 'GENERAL', isActive: true, icon: 'fa-solid fa-arrow-right-arrow-left' }
    ];

    return this.getCategoryHeads(200, true).pipe(
      map((existing: CategoryHead[]) => existing || []),
      // Determine which defaults are missing (compare by categoryName, case-insensitive)
      map((existing: CategoryHead[]) => {
        const existingNames = new Set(
          existing.map(c => (c.categoryName || '').trim().toUpperCase())
        );
        const toCreate = defaults.filter(d => !existingNames.has(d.categoryName.trim().toUpperCase()));
        return { existing, toCreate };
      }),
      // Create missing categories
      // Use forkJoin so we can wait for all creations
      // Each create triggers a refresh internally
      // If none to create, return immediately
      // Note: server should de-dup by name; we also guard client-side
      //
      switchMap(({ existing, toCreate }) => {
        if (!toCreate.length) {
          return of({ created: 0, skipped: existing.length });
        }
        const createCalls = toCreate.map(d => this.createCategoryHead(d).pipe(catchError(() => of(null))));
        return forkJoin(createCalls).pipe(
          map(results => ({ created: results.filter(r => !!r).length, skipped: existing.length })),
          tap(() => {
            // Ensure we refresh the cache once more
            this.getCategoryHeads(200, true).subscribe();
          })
        );
      }),
      catchError(err => {
        console.error('Error ensuring default category heads:', err);
        return of({ created: 0, skipped: 0 });
      })
    );
  }
}

