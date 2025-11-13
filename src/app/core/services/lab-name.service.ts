import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Auth, User } from './auth';

@Injectable({
  providedIn: 'root'
})
export class LabNameService {
  private labNameSubject = new BehaviorSubject<string>('Sarthak Diagnostic Network');
  public labName$: Observable<string> = this.labNameSubject.asObservable();

  constructor(private authService: Auth) {
    // Subscribe to current user changes
    this.authService.currentUser$.subscribe((user: User | null) => {
      // Priority: labSettings.labName > lab.labName > default
      if (user?.labSettings?.labName) {
        this.labNameSubject.next(user.labSettings.labName);
      } else if (user?.lab?.labName) {
        this.labNameSubject.next(user.lab.labName);
      } else {
        // Fallback to default
        this.labNameSubject.next('Sarthak Diagnostic Network');
      }
    });

    // Also check localStorage for labSettings
    this.loadLabNameFromStorage();
  }

  private loadLabNameFromStorage(): void {
    try {
      // First check labSettings
      const labSettings = localStorage.getItem('labSettings');
      if (labSettings) {
        const parsed = JSON.parse(labSettings);
        if (parsed?.labName) {
          this.labNameSubject.next(parsed.labName);
          return;
        }
      }

      // Then check user.lab
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.lab?.labName) {
          this.labNameSubject.next(user.lab.labName);
          return;
        }
      }
    } catch (e) {
      console.error('Error loading lab name from storage:', e);
    }
  }

  getLabName(): string {
    return this.labNameSubject.value;
  }

  setLabName(name: string): void {
    this.labNameSubject.next(name);
  }
}

