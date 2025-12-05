import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface User {
  _id: string;
  username: string;
  email: string;
  role: 'SuperAdmin' | 'LabAdmin' | 'Technician' | 'Receptionist' | 'Admin' | 'Doctor' | 'Patient' | 'Pathology' | 'Pharmacy';
  permissions: string[];
  allowedRoutes?: string[];
  firstName: string;
  lastName: string;
  phone: string;
  isActive: boolean;
  profilePicture?: string;
  labId?: string;
  lab?: {
    _id: string;
    labCode: string;
	    labName: string;
	    email?: string;
	    phone?: string;
	    subscriptionPlan?: 'trial' | 'basic' | 'premium';
	    subscriptionStatus?: 'pending' | 'active' | 'expired' | 'cancelled';
	    approvalStatus?: 'pending' | 'approved' | 'rejected';
	    trialEndsAt?: string;
	    subscriptionEndsAt?: string;
  };
  labSettings?: {
    labName?: string;
    shortName?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    altPhone?: string;
    email?: string;
    website?: string;
    logoDataUrl?: string;
    signatureDataUrl?: string;
    headerNote?: string;
    footerNote?: string;
    reportDisclaimer?: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root'
})
export class Auth {
  private apiUrl = `${environment.apiUrl}/auth`;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (token && userStr) {
      // Dev safety: reject mock tokens so dev helpers don't auto-login users in production-like flows
      if (String(token).startsWith('mock_')) {
        console.warn('🔒 Auth: Detected mock token, clearing to prevent auto-login');
        this.logout();
        return;
      }
      try {
        const user = JSON.parse(userStr);
        this.currentUserSubject.next(user);
        console.log('✅ User restored from localStorage:', user);
      } catch (error) {
        console.error('❌ Error parsing stored user:', error);
        this.logout();
      }
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap(response => {
          localStorage.setItem('token', response.token);
          localStorage.setItem('user', JSON.stringify(response.user));
          this.currentUserSubject.next(response.user);
          console.log('✅ User logged in:', response.user);
        })
      );
  }

  // Legacy register (kept for compatibility) - keeps logging in with the created user
  register(userData: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, userData)
      .pipe(
        tap(response => {
          localStorage.setItem('token', response.token);
          this.currentUserSubject.next(response.user);
        })
      );
  }

  // SuperAdmin creates a user WITHOUT changing current session
  adminCreateUser(userData: RegisterRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, userData);
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
    console.log('✅ User logged out');
  }

  loadUserProfile(): void {
    const token = this.getToken();
    if (!token) {
      this.logout();
      return;
    }

    this.http.get<User>(`${this.apiUrl}/profile`).subscribe({
      next: (user) => {
        console.log('✅ User profile loaded:', user);
        localStorage.setItem('user', JSON.stringify(user));
        this.currentUserSubject.next(user);
      },
      error: (error) => {
        console.error('❌ Failed to load user profile:', error);
        this.logout();
      }
    });
  }

  updateProfile(update: Partial<User> & { password?: string }): Observable<{ message: string; user: User }> {
    return this.http.put<{ message: string; user: User }>(`${this.apiUrl}/profile`, update).pipe(
      tap((res) => {
        // Persist updated user
        localStorage.setItem('user', JSON.stringify(res.user));
        this.currentUserSubject.next(res.user);
      })
    );
  }

  uploadProfilePicture(file: File) {
    const formData = new FormData();
    formData.append('image', file);
    return this.http.post<{ message: string; user: User }>(`${this.apiUrl}/profile/picture`, formData).pipe(
      tap(res => {
        localStorage.setItem('user', JSON.stringify(res.user));
        this.currentUserSubject.next(res.user);
      })
    );
  }

  // ===== SMTP SETTINGS (SuperAdmin) =====
  getMySmtp() {
    return this.http.get<{ smtp: any }>(`${environment.apiUrl}/settings/me/smtp`);
  }

  saveMySmtp(payload: { host?: string; port?: number; secure?: boolean; user: string; pass: string; from?: string; }) {
    return this.http.post<{ message: string; smtp: any }>(`${environment.apiUrl}/settings/me/smtp`, payload);
  }

  sendTestEmail(to?: string) {
    return this.http.post<{ success: boolean; message: string }>(`${this.apiUrl}/test-email`, to ? { to } : {});
  }

  // ===== Password helpers =====
  changePassword(currentPassword: string, newPassword: string) {
    return this.http.put<{ message: string }>(`${this.apiUrl}/change-password`, { currentPassword, newPassword });
  }

  forgotPassword(email: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/reset-password`, { token, newPassword });
  }

	  createPassword(token: string, newPassword: string) {
	    return this.http.post<{ message: string }>(`${this.apiUrl}/create-password`, { token, newPassword });
	  }

  // Request SuperAdmin approval via email
  requestPasswordResetApproval(email: string) {
    return this.http.post<{ message: string }>(`${this.apiUrl}/request-reset-approval`, { email });
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  isLoggedIn(): boolean {
    const token = this.getToken();
    const user = this.getCurrentUser();
    return !!(token && user);
  }

  // Clear all auth data and force logout
  clearAuthData(): void {
    console.log('🧹 Clearing all authentication data');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.currentUserSubject.next(null);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  hasAnyPermission(permissions: string[]): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // SuperAdmin/Admin have ALL permissions - no restrictions
    if (user.role === 'Admin' || user.role === 'SuperAdmin') return true;

    // Check if user has 'all' permission
    if (user.permissions?.includes('all')) return true;

    if (!user.permissions) return false;

    return permissions.some(permission => user.permissions.includes(permission));
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user ? user.role === role : false;
  }

  // Role-based helper methods
  isAdmin(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'Admin';
  }

  isDoctor(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'Doctor';
  }

  isPatient(): boolean {
    const user = this.getCurrentUser();
    return user?.role === 'Patient';
  }

  hasPermission(permission: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Admin/SuperAdmin have ALL permissions
    if (user.role === 'Admin' || user.role === 'SuperAdmin') return true;

    // Check for 'all' permission
    if (user.permissions?.includes('all')) return true;

    return user.permissions?.includes(permission) || false;
  }



  canAccessResource(resourceOwnerId: string): boolean {
    const user = this.getCurrentUser();
    if (!user) return false;

    // SuperAdmin/Admin can access everything
    if (user.role === 'Admin' || user.role === 'SuperAdmin') return true;

    // Patients can only access their own resources
    if (user.role === 'Patient') {
      return user._id === resourceOwnerId;
    }

    // Doctors can access based on their permissions
    return true;
  }

  getUserRole(): string | null {
    const user = this.getCurrentUser();
    return user?.role || null;
  }

  getUserPermissions(): string[] {
    const user = this.getCurrentUser();
    return user?.permissions || [];
  }

  // Mock login for development/testing when server is not available
  mockAdminLogin(): void {
    const mockUser: User = {
      _id: 'admin123',
      username: 'admin',
      email: 'admin@hospital.com',
      role: 'Admin',
      permissions: ['all', 'manage_system', 'manage_doctors', 'manage_appointments'],
      firstName: 'System',
      lastName: 'Administrator',
      phone: '9999999999',
      isActive: true
    };

    const mockToken = 'mock_admin_token_' + Date.now();
    localStorage.setItem('token', mockToken);
    this.currentUserSubject.next(mockUser);
    console.log('✅ Mock admin login successful');
  }
}
