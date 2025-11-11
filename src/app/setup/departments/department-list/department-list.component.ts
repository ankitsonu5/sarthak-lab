import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, Subject, forkJoin } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { DepartmentService, Department, DepartmentResponse } from '../services/department.service';
import { DoctorService } from '../../doctors/services/doctor.service';
import { RoomService } from '../../rooms/services/room.service';
import { DeleteConfirmationModalComponent, DeleteSuccessModalComponent, DeleteBlockedModalComponent } from '../../../shared/components';
import { DoctorRoomDirectoryService } from '../../doctor-room-directory/services/doctor-room-directory.service';


@Component({
  selector: 'app-department-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DeleteConfirmationModalComponent, DeleteSuccessModalComponent, DeleteBlockedModalComponent],
  templateUrl: './department-list.component.html',
  styleUrls: ['./department-list.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA]
})
export class DepartmentListComponent implements OnInit, OnDestroy, AfterViewInit {
  departments: Department[] = [];

  // Client-side paginated view (like category-head-registration)
  filteredDepartments: Department[] = [];

  error = '';

  // PERFORMANCE FIX: Loading states to prevent multiple clicks
  isLoading = false;
  isSearching = false;
  isDeleting = false;


  // Pagination
  currentPage = 1;
  totalPages = 1;
  totalDepartments = 0;
  pageSize = 10;

  // Search and filters
  searchTerm = '';
  departmentFilter = '';
  uniqueDepartments: string[] = [];

  // Selection
  selectedDepartments: string[] = [];

  // Delete Modal Properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  deleteSuccessMessage = '';
  departmentToDelete: Department | null = null;

  // For Delete button state in modal
  isConfirmingDelete = false;

  // Delete Blocked Modal properties
  showDeleteBlocked = false;
  deleteBlockedMessage = '';
  deleteBlockedDetails: string[] = [];
  blockedRooms: Array<{ _id: string; roomNumber: string }> = [];
  blockedDoctors: Array<{ _id: string; name?: string; firstName?: string; lastName?: string }> = [];

  private subscription: Subscription = new Subscription();
  private searchSubject = new Subject<string>(); // PERFORMANCE FIX: Debounced search

  // Math object for template
  Math = Math;

  constructor(
    private departmentService: DepartmentService,
    private doctorService: DoctorService,
    private roomService: RoomService,
    private doctorRoomDirectoryService: DoctorRoomDirectoryService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  // Apply search+pagination like category-head-registration
  applySearchAndPagination(): void {
    let filtered = [...this.departments]; // Create a copy

    // Apply text search and department filter
    const term = (this.searchTerm || '').trim().toLowerCase();
    const deptFilter = (this.departmentFilter || '').trim().toLowerCase();

    console.log(`🔍 Department search for term: "${term}" in ${this.departments.length} departments`);

    if (term) {
      filtered = filtered.filter(d => {
        // Create comprehensive searchable text - search ANYWHERE in any field
        const searchableText = [
          d.name || '',
          d.code || '',
          d.description || '',
          d._id || '',
          d.createdAt || '',
          d.updatedAt || ''
        ].join(' ').toLowerCase().replace(/\s+/g, ' ');

        // Enhanced flexible search - matches ANY character sequence ANYWHERE
        const matches = searchableText.includes(term);

        if (matches) {
          console.log(`✅ Match found: "${term}" in department: ${d.name} (${d.code})`);
        }

        return matches;
      });
    }

    if (deptFilter && deptFilter !== 'all') {
      filtered = filtered.filter(d => (d.name || '').toLowerCase() === deptFilter);
    }

    console.log(`✅ Found ${filtered.length} matching departments out of ${this.departments.length} total`);

    // Update totals
    this.totalDepartments = filtered.length;
    this.totalPages = Math.max(1, Math.ceil(this.totalDepartments / this.pageSize));

    // Clamp currentPage within range
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    if (this.currentPage < 1) this.currentPage = 1;

    // Slice for current page
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    this.filteredDepartments = filtered.slice(startIndex, endIndex);
  }

  ngOnInit(): void {
    console.log('🏥 Department List Component Initializing...');

    // Show empty arrays immediately so UI renders
    this.departments = [];
    this.filteredDepartments = [];

    // Debounced search like category-head-registration
    this.subscription.add(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(searchTerm => {
        this.searchTerm = searchTerm;
        this.currentPage = 1;
        this.applySearchAndPagination();
      })
    );

    // Initial load (force fresh fetch)
    this.performComprehensiveRefresh();
    this.cdr.detectChanges();
  }

  ngAfterViewInit(): void {
    // Keep lightweight
  }

  // FORCE REFRESH METHOD – align with category-head-registration
  performComprehensiveRefresh(): void {
    // Clear flags
    localStorage.removeItem('departmentCreated');
    localStorage.removeItem('departmentUpdated');

    // Reset filters
    this.currentPage = 1;
    this.searchTerm = '';
    this.departmentFilter = '';

    // Load all departments (fetch once, paginate client-side)
    this.loadDepartments();
    this.loadAllDepartmentsForFilter();
  }

  checkForRefresh(): void {
    // Check localStorage flags for refresh with timestamp
    const createdTimestamp = localStorage.getItem('departmentCreated');
    const updatedTimestamp = localStorage.getItem('departmentUpdated');

    if (createdTimestamp) {
      const timeDiff = Date.now() - parseInt(createdTimestamp);
      if (timeDiff < 10000) { // Within 10 seconds
        console.log('🔄 Department created flag found - refreshing...');
        localStorage.removeItem('departmentCreated');
        this.loadDepartments();
        this.loadAllDepartmentsForFilter();
      }
    }

    if (updatedTimestamp) {
      const timeDiff = Date.now() - parseInt(updatedTimestamp);
      if (timeDiff < 10000) { // Within 10 seconds
        console.log('🔄 Department updated flag found - refreshing...');
        localStorage.removeItem('departmentUpdated');
        this.loadDepartments();
        this.loadAllDepartmentsForFilter();
      }
    }
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  loadDepartments(): void {
    if (this.isLoading) return;

    this.error = '';
    this.isLoading = true;

    // Always pull fresh list from API; then paginate locally
    this.subscription.add(
      this.departmentService.getDepartments(1, 1000, '', true).subscribe({
        next: (response: DepartmentResponse) => {
          this.departments = [...response.departments];
          this.totalDepartments = this.departments.length;

          // After fetching, apply search + pagination client-side
          this.applySearchAndPagination();

          this.isLoading = false;
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading departments:', error);
          this.error = 'Failed to load departments';
          this.departments = [];
          this.filteredDepartments = [];
          this.totalDepartments = 0;
          this.totalPages = 1;
          this.isLoading = false;
        }
      })
    );
  }


  // PERFORMANCE FIX: Use debounced search instead of immediate API call
  onSearch(): void {
    this.searchSubject.next(this.searchTerm);
  }

  // CLEAR SEARCH: Clear all search filters and refresh
  clearSearch(): void {
    if (this.isLoading) return;

    console.log('🧹 Clearing search filters...');
    this.searchTerm = '';
    this.departmentFilter = '';
    this.currentPage = 1;

    // Apply search and pagination to show all data
    this.applySearchAndPagination();

    // Force change detection to update UI immediately
    this.cdr.detectChanges();

    console.log('✅ Search cleared - showing all departments');
  }

  // PERFORMANCE FIX: Add loading state to prevent multiple clicks
  onFilterChange(): void {
    if (this.isLoading) return;
    this.currentPage = 1;
    this.applySearchAndPagination();
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.applySearchAndPagination();
    }
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.applySearchAndPagination();
  }

navigateToSearchRoom(): void {
    this.router.navigate(['/setup/rooms/room-list']);
  }

  DepartmentRegistration(): void {
    this.router.navigate(['/setup/departments/new']);
  }
  SearchDepartment(): void {
    console.log('🔄 SEARCH DEPARTMENTS BUTTON: Performing comprehensive refresh...');
    this.performComprehensiveRefresh();
  }

  editDepartment(department: Department): void {
    this.router.navigate(['/setup/departments/edit', department._id]);
  }



  // Pre-check dependencies (rooms/doctors). If none, show confirmation; otherwise show blocked modal for 2s.
  showDeleteConfirmationDialog(department: Department): void {
    // Save selection
    this.departmentToDelete = department;

    const departmentId = department._id!;

    this.isDeleting = true; // temporarily disable actions

    this.subscription.add(
      forkJoin([
        this.roomService.getRoomsByDepartment(departmentId, true),
        this.doctorService.getDoctorsByDepartment(departmentId, true),
        this.doctorRoomDirectoryService.getDirectoriesByDepartment(departmentId)
      ]).subscribe({
        next: ([rooms, doctors, directoriesResp]) => {
          const hasRooms = Array.isArray(rooms) && rooms.length > 0;
          const hasDoctors = Array.isArray(doctors) && doctors.length > 0;

          // doctor-room-directories API returns { success, data: [] }
          let directories: any[] = [];
          if (Array.isArray(directoriesResp)) {
            directories = directoriesResp;
          } else if (directoriesResp && Array.isArray(directoriesResp.data)) {
            directories = directoriesResp.data;
          } else if (directoriesResp && Array.isArray((directoriesResp as any).directories)) {
            directories = (directoriesResp as any).directories;
          }
          const hasDirectories = directories.length > 0;

          if (!hasRooms && !hasDoctors && !hasDirectories) {
            // Safe to delete – show standard confirmation
            this.isDeleting = false; // ensure table buttons enabled
            this.isConfirmingDelete = false; // button in modal should show "Delete"
            this.deleteMessage = `You are about to remove the department "${department.name}" forever. Once deleted, this cannot be restored.`;
            this.showDeleteConfirmation = true;
            this.cdr.detectChanges();
          } else {
            // Block deletion – show friendly alert for 2 seconds
            this.isDeleting = false; // reset any loading state
            const roomCount = hasRooms ? rooms.length : 0;
            const doctorCount = hasDoctors ? doctors.length : 0;
            const directoryCount = hasDirectories ? directories.length : 0;
            this.deleteBlockedMessage = `This department cannot be deleted because it is used in ${directoryCount} doctor-room-directory , has ${roomCount} room and ${doctorCount} doctor linked.`;

            // Preserve rooms and doctors for quick edit buttons in modal
            this.blockedRooms = (rooms || []).map((r: any) => ({ _id: r._id, roomNumber: r.roomNumber }));
            this.blockedDoctors = (doctors || []).map((d: any) => ({ _id: d._id, name: d.name, firstName: d.firstName, lastName: d.lastName }));

            const roomDetails = this.blockedRooms.slice(0, 3).map((r) => `Room: ${r.roomNumber}`);
            const doctorDetails = this.blockedDoctors.slice(0, 3).map((d) => `Doctor: ${(d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim()).trim()}`);
            const extraRooms = Math.max(0, roomCount - roomDetails.length);
            const extraDoctors = Math.max(0, doctorCount - doctorDetails.length);

            this.deleteBlockedDetails = [
              ...roomDetails,
              ...(extraRooms ? [`+${extraRooms} more room`] : []),
              ...doctorDetails,
              ...(extraDoctors ? [`+${extraDoctors} more doctor`] : [])
            ];

            this.showDeleteBlocked = true;
            this.cdr.detectChanges();
            setTimeout(() => this.closeDeleteBlocked(), 2000);
          }

          this.isDeleting = false;
        },
        error: (err) => {
          console.error('Dependency check failed:', err);
          // Fallback to safe behavior – do not delete automatically
          this.deleteBlockedMessage = 'Unable to verify dependencies. Please try again later.';
          this.deleteBlockedDetails = [];
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 2000);
          this.isDeleting = false;
        }
      })
    );
  }

  // Delete Confirmation Methods
  closeDeleteConfirmation(): void {
    this.showDeleteConfirmation = false;
    this.departmentToDelete = null;
    this.deleteMessage = '';
  }

  confirmDelete(): void {
    if (!this.departmentToDelete || this.isConfirmingDelete) return;

    this.isConfirmingDelete = true;
    this.departmentService.deleteDepartment(this.departmentToDelete._id!).subscribe({
      next: () => {
        // Remove from local array
        this.departments = this.departments.filter(d => d._id !== this.departmentToDelete!._id);

        // Update totals and pagination
        this.totalDepartments = Math.max(0, this.totalDepartments - 1);
        const newTotalPages = Math.max(1, Math.ceil(this.totalDepartments / this.pageSize));
        if (this.currentPage > newTotalPages) {
          this.currentPage = newTotalPages;
        }
        if (this.departments.length === 0 && this.currentPage > 1) {
          this.currentPage = this.currentPage - 1;
        }

        // Show success modal
        this.deleteSuccessMessage = `Department "${this.departmentToDelete!.name}" deleted successfully!`;
        this.showDeleteSuccess = true;

        // Close confirmation and refresh data + filter list
        this.closeDeleteConfirmation();
        this.loadDepartments();
        this.loadAllDepartmentsForFilter();
      },
      error: (error) => {
        console.error('Error deleting department:', error);
        // If backend sends dependency information, show friendly modal
        const msg: string = error?.error?.message || 'Failed to delete department.';
        if (/room|doctor|dependent|assigned|linked/i.test(msg)) {
          // Show simple info-only blocked modal and auto-hide in 2s
          this.deleteBlockedMessage = msg;
          this.deleteBlockedDetails = [];
          this.showDeleteBlocked = true;
          this.cdr.detectChanges();
          setTimeout(() => this.closeDeleteBlocked(), 2000);
        } else {
          alert('Failed to delete department. Please try again.');
        }
        this.closeDeleteConfirmation();
        this.isConfirmingDelete = false;
      },
      complete: () => {
        this.isConfirmingDelete = false;
      }
    });
  }



  // Delete Success Methods (like category-head-registration)
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    this.deleteSuccessMessage = '';
    // Reload list but preserve current search/filter/page
    this.loadDepartments();
    this.loadAllDepartmentsForFilter();
  }

  refreshData(): void {
    console.log('🔄 REFRESH DATA EVENT: Performing comprehensive refresh...');
    // Reset pagination and filters for fresh data
    this.currentPage = 1;
    this.searchTerm = '';
    this.departmentFilter = '';
    // Comprehensive refresh
    this.performComprehensiveRefresh();
  }

  restoreDepartment(department: Department): void {
    this.subscription.add(
      this.departmentService.restoreDepartment(department._id!).subscribe({
        next: () => {
          this.loadDepartments();
        },
        error: (error) => {
          console.error('Error restoring department:', error);
          alert('Failed to restore department');
        }
      })
    );
  }

  toggleDepartmentSelection(departmentId: string): void {
    const index = this.selectedDepartments.indexOf(departmentId);
    if (index > -1) {
      this.selectedDepartments.splice(index, 1);
    } else {
      this.selectedDepartments.push(departmentId);
    }
  }

  selectAllDepartments(): void {
    if (this.selectedDepartments.length === this.departments.length) {
      this.selectedDepartments = [];
    } else {
      this.selectedDepartments = this.departments.map(d => d._id!);
    }
  }

  bulkDelete(): void {
    if (this.selectedDepartments.length === 0) return;

    if (confirm(`Are you sure you want to delete ${this.selectedDepartments.length} departments?`)) {
      // Execute deletes sequentially via subscribe to avoid deprecated toPromise
      const ids = [...this.selectedDepartments];
      const deleteNext = () => {
        const id = ids.shift();
        if (!id) {
          this.selectedDepartments = [];
          this.loadDepartments();
          return;
        }
        this.departmentService.deleteDepartment(id).subscribe({
          next: () => deleteNext(),
          error: () => deleteNext()
        });
      };
      deleteNext();
    }
  }



  // Helper methods
  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'status-active' : 'status-inactive';
  }

  getStatusText(isActive: boolean): string {
    return isActive ? 'Active' : 'Inactive';
  }



  getPaginationPages(): number[] {
    const pages: number[] = [];
    const start = Math.max(1, this.currentPage - 2);
    const end = Math.min(this.totalPages, this.currentPage + 2);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return pages;
  }

  isSelected(departmentId: string): boolean {
    return this.selectedDepartments.includes(departmentId);
  }

  isAllSelected(): boolean {
    return this.departments.length > 0 && this.selectedDepartments.length === this.departments.length;
  }

  isIndeterminate(): boolean {
    return this.selectedDepartments.length > 0 && this.selectedDepartments.length < this.departments.length;
  }

  getEndRange(): number {
    return Math.min(this.currentPage * this.pageSize, this.totalDepartments);
  }

  getDepartmentId(department: any, index: number): string {
    // Use actual departmentId if available, otherwise generate fallback
    if (department.departmentId) {
      return department.departmentId;
    }
    // Fallback for old departments without departmentId
    return 'DEP' + (index + 1).toString().padStart(5, '0');
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

  // Update unique departments for filter dropdown
  updateUniqueDepartments(): void {
    const departmentNames = this.departments.map(dept => dept.name);
    this.uniqueDepartments = [...new Set(departmentNames)].sort();
  }

  // Load all departments for filter dropdown (without pagination)
  loadAllDepartmentsForFilter(): void {
    this.subscription.add(
      this.departmentService.getDepartments(1, 1000, '', true).subscribe({
        next: (response) => {
          const allDepartmentNames = response.departments.map(dept => dept.name);
          this.uniqueDepartments = [...new Set(allDepartmentNames)].sort();
        },
        error: (error) => {
          console.error('Error loading departments for filter:', error);
        }
      })
    );
  }

  // Pagination methods
  goToPage(page: number | string): void {
    if (typeof page === 'string' || page < 1 || page > this.totalPages) {
      return;
    }
    this.currentPage = page;
    this.loadDepartments();
  }

  getPageNumbers(): (number | string)[] {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (this.totalPages <= maxVisiblePages) {
      // Show all pages if total pages is small
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page
      pages.push(1);

      // Calculate start and end of middle pages
      const start = Math.max(2, this.currentPage - 1);
      const end = Math.min(this.totalPages - 1, this.currentPage + 1);

      // Add ellipsis if needed
      if (start > 2) pages.push('...');

      // Add middle pages
      for (let i = start; i <= end; i++) pages.push(i);

      // Add ellipsis if needed
      if (end < this.totalPages - 1) pages.push('...');

      // Show last page
      if (this.totalPages > 1) pages.push(this.totalPages);
    }

    return pages;
  }

    // Delete Blocked modal close handler
    closeDeleteBlocked(): void {
      this.showDeleteBlocked = false;
      this.deleteBlockedMessage = '';
      this.deleteBlockedDetails = [];
      this.blockedRooms = [];
      this.blockedDoctors = [];
    }

    // Navigate to edit room/doctor with suppressNavigate flag so update does not redirect
    onBlockedEditRoom(roomId: string): void {
      this.closeDeleteBlocked();
      this.router.navigate(['/setup/rooms/room-registration'], { queryParams: { id: roomId, mode: 'edit', suppressNavigate: '1' } });
    }

    onBlockedEditDoctor(doctorId: string): void {
      this.closeDeleteBlocked();
      this.router.navigate(['/setup/doctors/doctor-registration'], { queryParams: { id: doctorId, mode: 'edit', suppressNavigate: '1' } });
    }

  // PERFORMANCE FIX: TrackBy function for better ngFor performance
  trackByDepartmentId(index: number, department: any): string {
    return department._id || index.toString();
  }

  // PERFORMANCE FIX: Debounced search method
  onSearchTermChange(value: string): void {
    const trimmedValue = (value || '').trim();
    console.log(`🔍 Department search input changed: "${trimmedValue}"`);

    this.searchTerm = trimmedValue;

    // Apply search immediately for instant feedback
    this.currentPage = 1; // Reset to first page
    this.applySearchAndPagination();

    // Force change detection to update UI immediately
    this.cdr.detectChanges();
  }
}
