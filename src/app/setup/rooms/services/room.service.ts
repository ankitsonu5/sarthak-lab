import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface Room {
  _id?: string;
  roomNumber: string;
  department: string | { _id: string; name: string; code?: string };
  // REMOVED: isActive field as requested
  createdAt?: Date;
  updatedAt?: Date;
  [x: string]: any; // Index signature for additional properties
}

export interface RoomResponse {
  rooms: Room[];
  totalPages: number;
  currentPage: number;
  total: number;
}

@Injectable({
  providedIn: 'root'
})
export class RoomService {
  private apiUrl = `${environment.apiUrl}/rooms`;
  private roomsSubject = new BehaviorSubject<Room[]>([]);
  public rooms$ = this.roomsSubject.asObservable();

  constructor(private http: HttpClient) { }

  // Get all rooms with pagination and search
  getRooms(
    page: number = 1,
    limit: number = 10,
    search: string = '',
    department: string = '',
    nocache: boolean = false
  ): Observable<RoomResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (search) {
      params = params.set('search', search);
    }

    if (department && department !== 'all') {
      params = params.set('department', department);
    }

    // Cache-busting param to avoid stale results after create/update/delete and on navigation
    if (nocache) {
      params = params.set('_', Date.now().toString());
    }

    return this.http.get<RoomResponse>(this.apiUrl, { params }).pipe(
      tap(response => {
        if (response && response.rooms) {
          this.roomsSubject.next(response.rooms);
        }
      })
    );
  }

  // Get room by ID
  getRoomById(id: string): Observable<Room> {
    return this.http.get<Room>(`${this.apiUrl}/${id}`);
  }

  // Create new room
  createRoom(room: Partial<Room>): Observable<Room> {
    return this.http.post<Room>(this.apiUrl, room);
  }

  // Update room
  updateRoom(id: string, room: Partial<Room>): Observable<Room> {
    return this.http.put<Room>(`${this.apiUrl}/${id}`, room);
  }

  // Get rooms by department (public) with optional cache-busting
  getRoomsByDepartment(departmentId: string, nocache: boolean = false): Observable<Room[]> {
    let params = new HttpParams();
    if (nocache) {
      params = params.set('_', Date.now().toString());
    }
    return this.http.get<Room[]>(`${this.apiUrl}/department/${departmentId}`, { params });
  }

  // Delete room (soft delete)
  deleteRoom(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  // Restore room
  restoreRoom(id: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/${id}/restore`, {});
  }

  // Validate room data
  validateRoom(room: Partial<Room>): string[] {
    const errors: string[] = [];

    if (!room.roomNumber || room.roomNumber.trim().length === 0) {
      errors.push('Room number is required');
    }

    if (!room.department) {
      errors.push('Department is required');
    }

    return errors;
  }

  // Format room number with RN- prefix
  formatRoomNumber(roomNumber: string): string {
    if (!roomNumber) return '';

    // Remove any existing RN- prefix and spaces
    const cleanNumber = roomNumber.replace(/^RN-/i, '').trim();

    // Add RN- prefix
    return `RN-${cleanNumber}`;
  }

  // Get current rooms from BehaviorSubject
  getCurrentRooms(): Room[] {
    return this.roomsSubject.value;
  }

  // Update rooms in BehaviorSubject
  updateRooms(rooms: Room[]): void {
    this.roomsSubject.next(rooms);
  }
}
