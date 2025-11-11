import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, ChangeDetectionStrategy, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription, Subject } from 'rxjs';
import { filter, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RoomService, Room, RoomResponse } from '../services/room.service';
import { DepartmentService, Department } from '../../departments/services/department.service';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';
import { DeleteBlockedModalComponent } from '../../../shared/components/delete-blocked-modal/delete-blocked-modal.component';
import { DoctorRoomDirectoryService } from '../../doctor-room-directory/services/doctor-room-directory.service';

@Component({
  selector: 'app-room-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent, DeleteBlockedModalComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './room-list.component.html',
  styleUrls: ['./room-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush // PERFORMANCE FIX: OnPush change detection
})
export class RoomListComponent implements OnInit, OnDestroy, AfterViewInit {
  rooms: Room[] = [];
  allRooms: Room[] = []; // Store all rooms for filtering
  departments: Department[] = [];
  roomNumbers: string[] = []; // For room number dropdown
  private subscription = new Subscription();
  Math = Math; // Make Math available in template

  // PERFORMANCE FIX: Debounced search
  private searchSubject = new Subject<string>();
  private departmentFilterSubject = new Subject<string>();

  // Search and filter properties
  searchTerm = '';
  departmentFilter = '';
  roomNumberFilter = '';

  // Pagination
  currentPage = 1;
  pageSize = 10; // Set to 10 per page as requested
  totalPages = 0;
  totalRooms = 0;

  // Error state
  error = '';

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  roomToDelete: Room | null = null;
  private isCheckingDelete = false; // Prevent double-click before modal shows

  // Delete blocked modal state
  showDeleteBlocked = false;
  deleteBlockedMessage = '';
  deleteBlockedDetails: string[] = [];
  blockedDoctors: Array<{ _id: string; name?: string; firstName?: string; lastName?: string }> = [];

  constructor(
    private roomService: RoomService,
    private departmentService: DepartmentService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private doctorRoomDirectoryService: DoctorRoomDirectoryService
  ) {}

  ngOnInit(): void {
    // Show empty arrays immediately so UI renders
    this.rooms = [];
    this.departments = [];

    // Load data
    this.loadDepartments();

    // If coming back from edit in registration page, refresh immediately
    const updatedTimestamp = localStorage.getItem('roomUpdated');
    if (updatedTimestamp) {
      const diff = Date.now() - parseInt(updatedTimestamp);
      if (!isNaN(diff) && diff < 10000) {
        localStorage.removeItem('roomUpdated');
        this.loadAllRoomsInitially();
        return;
      } else {
        localStorage.removeItem('roomUpdated');
      }
    }

    this.loadAllRoomsInitially();
  }

  ngAfterViewInit(): void {
    // No need to reload data here - already loaded in ngOnInit
    console.log('🔄 View initialized - data already loaded');
  }


  loadAllRoomsInitially(): void {
    console.log('📊 Loading all rooms initially...');
    this.error = '';

    // Load all rooms without pagination for filtering
    this.subscription.add(
      this.roomService.getRooms(1, 1000, '', '', true).subscribe({
        next: (response: RoomResponse) => {
          console.log('✅ Rooms loaded successfully:', response.rooms.length);
          this.allRooms = response.rooms;
          this.updateRoomNumbers();
          this.applyFilters();
          this.totalRooms = response.total;

          // Ensure UI updates immediately on OnPush strategy
          this.cdr.detectChanges();
          console.log('✅ ROOMS: Data loaded successfully!');
        },
        error: (error) => {
          console.error('❌ Error loading rooms:', error);
          this.error = 'Failed to load rooms';
          this.cdr.detectChanges();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadDepartments(): void {
    this.subscription.add(
      this.departmentService.getDepartmentsList().subscribe({
        next: (departments: Department[]) => {
          this.departments = departments;

          // Force Angular change detection
          this.cdr.detectChanges();
          console.log('✅ DEPARTMENTS: Change detection triggered!');
        },
        error: (error) => {
          console.error('Error loading departments:', error);
        }
      })
    );
  }

  loadRooms(): void {
    this.error = '';
    console.log('🔄 Loading rooms...');

    // Load all rooms for frontend filtering (don't send search term to backend)
    this.subscription.add(
      this.roomService.getRooms(
        this.currentPage,
        this.pageSize,
        '', // Empty search term - do frontend filtering instead
        this.departmentFilter,
        true
      ).subscribe({
        next: (response: RoomResponse) => {
          console.log(`✅ Loaded ${response.rooms?.length || 0} rooms from API`);
          this.allRooms = response.rooms;
          this.updateRoomNumbers();

          // Apply frontend filtering if there's a search term
          this.applyFilters();

          this.totalPages = response.totalPages;
          this.totalRooms = response.total;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading rooms:', error);
          this.error = 'Failed to load rooms';
          this.cdr.detectChanges();
        }
      })
    );
  }

  updateRoomNumbers(): void {
    // Get unique room numbers for dropdown
    const uniqueRoomNumbers = [...new Set(this.allRooms.map(room => room.roomNumber))];
    this.roomNumbers = ['All', ...uniqueRoomNumbers.sort()];
    console.log('🏠 Available room numbers:', this.roomNumbers);
  }

  applyFilters(): void {
    let filteredRooms = [...this.allRooms];
    const term = (this.searchTerm || '').trim().toLowerCase();

    console.log(`🔍 Room search for term: "${term}" in ${this.allRooms.length} rooms`);

    if (term) {
      filteredRooms = filteredRooms.filter(room => {
        // Get department name for search
        const departmentName = typeof room.department === 'string'
          ? room.department
          : (room.department?.name || '');

        // Create comprehensive searchable text - includes room number, department name, description, etc.
        const searchableText = [
          room.roomNumber || '',
          room._id || '',
          departmentName,
          room['description'] || '',
          room['capacity']?.toString() || '',
          room['roomType'] || ''
        ].join(' ').toLowerCase();

        // Enhanced substring search - matches any part of any field
        return searchableText.includes(term);
      });
    }

    if (this.roomNumberFilter && this.roomNumberFilter !== 'All') {
      filteredRooms = filteredRooms.filter(room =>
        room.roomNumber === this.roomNumberFilter
      );
    }

    if (this.departmentFilter) {
      filteredRooms = filteredRooms.filter(room => {
        const roomDepartmentId = typeof room.department === 'string'
          ? room.department
          : room.department?._id;
        return roomDepartmentId === this.departmentFilter;
      });
    }

    this.rooms = filteredRooms;
    this.totalRooms = filteredRooms.length;

    // Force immediate render so user doesn't need to click a filter
    this.cdr.detectChanges();
    console.log(`✅ Found ${this.rooms.length} matching rooms`);
    if (term && this.rooms.length > 0) {
      console.log(`📋 Matches:`, this.rooms.map(r => `${r.roomNumber} - ${typeof r.department === 'string' ? r.department : r.department?.name}`));
    }
  }

  onSearch(): void {
    console.log('🔍 Search triggered:', this.searchTerm);
    this.applyFilters();
  }

  onRoomNumberFilterChange(): void {
    console.log('🏠 Room number filter changed:', this.roomNumberFilter);

    // Auto-select department when room is selected (but not when "All" is selected)
    if (this.roomNumberFilter && this.roomNumberFilter !== 'All') {
      const selectedRoom = this.allRooms.find(room => room.roomNumber === this.roomNumberFilter);
      if (selectedRoom) {
        const departmentId = typeof selectedRoom.department === 'string'
          ? selectedRoom.department
          : selectedRoom.department?._id;

        if (departmentId) {
          this.departmentFilter = departmentId;
          console.log('🏥 Auto-selected department:', departmentId);
        }
      }
    }

    this.applyFilters();
  }




  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadRooms();
  }

  editsRoom(room: Room): void {
    // Navigate to room registration with edit mode
    this.router.navigate(['/setup/rooms/room-registration'], {
      queryParams: { id: room._id, mode: 'edit' }
    });
  }

  deleteRoom(room: Room): void {
    if (this.isCheckingDelete || this.showDeleteConfirmation || this.showDeleteBlocked) return;
    this.isCheckingDelete = true;

    this.roomToDelete = room;

    // Check doctor-room-directory references for this room
    const roomId = room._id!;
    this.subscription.add(
      this.doctorRoomDirectoryService.getDirectoriesByRoom(roomId).subscribe({
        next: (resp) => {
          const directories = Array.isArray(resp) ? resp : (resp?.data || []);
          if (directories && directories.length > 0) {
            const dirCount = directories.length;
            this.deleteBlockedMessage = `This room cannot be deleted because it is used in ${dirCount} doctor-room-directory record${dirCount>1?'s':''}.`;
            // collect doctors info
            this.blockedDoctors = directories
              .map((d: any) => ({ _id: (typeof d.doctor === 'string' ? d.doctor : d.doctor?._id) || '', name: (typeof d.doctor === 'string' ? d.doctorName : d.doctor?.name), firstName: d.doctor?.firstName, lastName: d.doctor?.lastName }))
              .filter((doc: any) => !!doc._id || !!doc.name);
            this.deleteBlockedDetails = this.blockedDoctors.slice(0, 3).map(d => `Doctor: ${(d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim()).trim()}`);
            this.showDeleteBlocked = true;
            this.cdr.detectChanges();
            setTimeout(() => this.closeDeleteBlocked(), 2000);
          } else {
            // Safe to delete
            this.deleteMessage = `You are about to remove room "${room.roomNumber}" forever. Once deleted, this cannot be restored.`;
            this.showDeleteConfirmation = true;
            this.cdr.detectChanges(); // ensure modal renders on first click (OnPush + async)
          }
          this.isCheckingDelete = false;
        },
        error: () => {
          this.deleteBlockedMessage = 'Unable to verify dependencies. Please try again later.';
          this.deleteBlockedDetails = [];
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 2000);
          this.isCheckingDelete = false;
        }
      })
    );
  }

  // Delete Confirmation Methods
  cancelDelete(): void {
    this.showDeleteConfirmation = false;
    this.roomToDelete = null;
    this.deleteMessage = '';
    this.cdr.detectChanges();
  }

  confirmDelete(): void {
    if (this.roomToDelete) {
      this.subscription.add(
        this.roomService.deleteRoom(this.roomToDelete._id!).subscribe({
          next: () => {
            // Remove from local array (like doctor-list)
            this.rooms = this.rooms.filter(r => r._id !== this.roomToDelete!._id);
            this.applyFilters(); // Refresh filtered list
            this.showDeleteSuccess = true;
            this.loadAllRoomsInitially();
            this.cancelDelete();
          },
          error: (error) => {
            console.error('Error deleting room:', error);
            alert('Failed to delete room');
            this.cancelDelete();
          }
        })
      );
    }
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    // Refresh data after success modal closes (like doctor-list)
    this.loadAllRoomsInitially();
    this.cdr.detectChanges();
  }
navigateToDocRoomSearch(): void {
    this.router.navigate(['/setup/rooms/room-list']);
  }
   navigateToDepartmentRegistration(): void {
    this.router.navigate(['/setup/departments/new']);
  }
  navigateToRoomRegistration(): void {
    this.router.navigate(['/setup/rooms/room-registration']);
  }
    navigateToDocRoomDirectory(): void {
    this.router.navigate(['/setup/doctor-room-directory']);
  }

  getDepartmentName(department: string | { _id: string; name: string; code?: string }): string {
    if (typeof department === 'string') {
      return department;
    }
    return department?.name || 'N/A';
  }

  formatDate(date: Date | string): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  // REMOVED: getStatusText method as isActive field was removed

  // Pagination helpers
  getPaginationPages(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;

    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }
  // Delete Blocked modal close handler
  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
    this.deleteBlockedMessage = '';
    this.deleteBlockedDetails = [];
    this.blockedDoctors = [];
  }


  // PERFORMANCE FIX: TrackBy function for better ngFor performance
  trackByRoomId(index: number, room: Room): string {
    return room._id || index.toString();
  }

  // PERFORMANCE FIX: Debounced search methods
  onSearchTermChange(value: string): void {
    const trimmedValue = (value || '').trim();
    console.log(`🔍 Room search input changed: "${trimmedValue}"`);

    this.searchTerm = trimmedValue;

    // If search is empty, reload all rooms
    if (!trimmedValue) {
      console.log('🔄 Empty search - reloading all rooms');
      this.loadRooms();
      return;
    }

    // For non-empty search, use frontend filtering on already loaded data
    // This allows us to search department names which backend might not support
    console.log(`📊 Current rooms array length: ${this.allRooms.length}`);

    // If we don't have rooms loaded yet, load them first
    if (this.allRooms.length === 0) {
      console.log('🔄 No rooms loaded - loading all rooms first');
      this.loadRooms();
      return;
    }

    // Apply frontend filtering
    this.applyFilters();
  }

  onDepartmentFilterChange(value: string): void {
    this.departmentFilter = value;
    this.applyFilters();
  }
}
