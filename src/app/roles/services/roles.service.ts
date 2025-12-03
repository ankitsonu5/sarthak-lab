import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

export interface AppUser {
  _id: string;
  username: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
  // Permissions available to the user (optional; returned by backend for SuperAdmin listings)
  permissions?: string[];
  // Fine-grained component access control by route (optional)
  allowedRoutes?: string[];
  createdAt?: string;
  lastLogin?: string;
  profilePicture?: string;
}

@Injectable({ providedIn: 'root' })
export class RolesService {
  private apiUrl = `${environment.apiUrl}/auth`;
  constructor(private http: HttpClient) {}

	  private getCurrentUserRole(): string | null {
	    try {
	      const raw = localStorage.getItem('user');
	      if (!raw) return null;
	      const parsed = JSON.parse(raw);
	      return parsed?.role || null;
	    } catch {
	      return null;
	    }
	  }

  // Fetch users; try secure endpoint first, then fall back to public users-open if needed.
  getUsers(nocache = true): Observable<{ users: AppUser[]; total: number }> {
    const params = nocache ? new HttpParams().set('_', Date.now()) : (undefined as any);

    const normalize = (res: any): { users: AppUser[]; total: number } => {
      if (Array.isArray(res)) return { users: res as AppUser[], total: res.length };
      const users = (res?.users ?? []) as AppUser[];
      const total = Number(res?.total ?? users.length);
      return { users, total };
    };

    return this.http.get<any>(`${this.apiUrl}/users`, { params }).pipe(
      map(normalize),
      catchError(() => this.http.get<any>(`${this.apiUrl}/users-open`, { params }).pipe(map(normalize)))
    );
  }

	  // Update an existing user
	  // - SuperAdmin: full update via PUT /users/:id
	  // - LabAdmin/Admin: only route access (allowedRoutes) via PATCH /users/:id/routes
	  updateUser(id: string, update: Partial<AppUser & { password?: string }>): Observable<{ message: string; user: AppUser }>{
	    const role = this.getCurrentUserRole();
	    const keys = Object.keys(update || {});
	    const onlyAllowedRoutes = keys.length === 1 && keys[0] === 'allowedRoutes';

	    if (role && (role === 'LabAdmin' || role === 'Admin') && onlyAllowedRoutes) {
	      const allowedRoutes = (update as any).allowedRoutes || [];
	      return this.http.patch<{ message: string; user: AppUser }>(
	        `${this.apiUrl}/users/${id}/routes`,
	        { allowedRoutes }
	      );
	    }

	    return this.http.put<{ message: string; user: AppUser }>(`${this.apiUrl}/users/${id}`, update);
	  }

  // Set user active/inactive (SuperAdmin only)
  setUserActive(id: string, isActive: boolean): Observable<{ message: string; user: AppUser }>{
    const url = `${this.apiUrl}/users/${id}/active`;
    if (environment.performance?.enableConsoleLogging) {
      // Debug: log the exact URL and payload
      console.debug('PATCH', url, { isActive });
    }
    return this.http.patch<{ message: string; user: AppUser }>(url, { isActive });
  }

  // Toggle user active flag (SuperAdmin only)
  toggleUserActive(id: string): Observable<{ message: string; user: AppUser }>{
    return this.http.patch<{ message: string; user: AppUser }>(`${this.apiUrl}/users/${id}/toggle-active`, {});
  }


  // Delete a user (SuperAdmin only)
  deleteUser(id: string): Observable<{ message: string }>{
    return this.http.delete<{ message: string }>(`${this.apiUrl}/users/${id}`);
  }

  // Upload/Update a user's profile picture (SuperAdmin only)
  uploadProfilePicture(userId: string, file: File): Observable<{ message: string; user: AppUser }>{
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<{ message: string; user: AppUser }>(`${this.apiUrl}/users/${userId}/profile-picture`, formData);
  }
}
