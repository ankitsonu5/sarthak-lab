
import { Component, OnInit, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { DoctorService, Doctor, DoctorResponse } from '../services/doctor.service';
import { DoctorProfileComponent } from '../doctor-profile/doctor-profile.component';
import { DepartmentService, Department } from '../../departments/services/department.service';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialog } from '@angular/material/dialog';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';
import { DeleteBlockedModalComponent } from '../../../shared/components/delete-blocked-modal/delete-blocked-modal.component';
import { DoctorRoomDirectoryService } from '../../doctor-room-directory/services/doctor-room-directory.service';
import { Subscription, Subject } from 'rxjs'; // Restored
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'; // Restored

@Component({
  selector: 'app-doctor-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSnackBarModule,
    MatSelectModule,
    MatFormFieldModule,
    DeleteConfirmationModalComponent,
    DeleteSuccessModalComponent,
    DeleteBlockedModalComponent
  ],
  templateUrl: './doctor-list.component.html',
  styleUrls: ['./doctor-list.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class DoctorListComponent implements OnInit {

  doctors: Doctor[] = [];
  filteredDoctors: Doctor[] = [];
  private subscription: Subscription = new Subscription();
  private searchSubject = new Subject<string>(); // Debounced search input

  // DEBOUNCE: Prevent multiple simultaneous refresh calls
  private isRefreshing = false;
  private refreshTimeout: any;
  private isDeleting = false; // Flag to prevent refresh during delete
  private lastRefreshTime = 0; // Track last refresh time
  private isCheckingDelete = false; // Prevent double-click before modal shows

  // Total doctors count
  totalDoctors = 0;

  // Search criteria
  searchCriteria = {
    doctorId: '',
    name: '',
    specialization: '',
    department: '',
    gender: '',
    status: ''
  };

  specializations = [

  ];

  departments: string[] = [];

  statusOptions = [
    { value: '', label: 'All' },
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Inactive' }
  ];

  displayedColumns: string[] = ['image', 'doctorId', 'name', 'specialization', 'department', 'experience', 'fee', 'status', 'actions'];

  // Delete modal properties
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  deleteMessage = '';
  doctorToDelete: Doctor | null = null;

  // Delete blocked modal properties
  showDeleteBlocked = false;
  deleteBlockedMessage = '';
  deleteBlockedDetails: string[] = [];
  blockedRooms: Array<{ _id: string; roomNumber: string }> = [];

  constructor(
    private router: Router,
    private doctorService: DoctorService,
    private dialog: MatDialog,
    private departmentService: DepartmentService,
    private cdr: ChangeDetectorRef,
    private doctorRoomDirectoryService: DoctorRoomDirectoryService
  ) { }

  ngOnInit(): void {
    console.log('� DOCTOR LIST COMPONENT: Initializing with Smart Refresh System...');

    // Initialize arrays
    this.doctors = [];
    this.filteredDoctors = [];
    this.departments = [];

    // DISABLED: Navigation listener to prevent infinite loops
    // this.subscription.add(
    //   this.router.events.pipe(
    //     filter(event => event instanceof NavigationEnd)
    //   ).subscribe((event: NavigationEnd) => {
    //     if (event.url === '/setup/doctors/list' || event.url.includes('/setup/doctors/list')) {
    //       // Don't refresh during delete operation
    //       if (this.isDeleting) {
    //         console.log('🚫 NAVIGATION REFRESH BLOCKED: Delete operation in progress...');
    //         return;
    //       }
    //       console.log('🔄 NAVIGATION DETECTED: Smart refresh from:', event.url);
    //       this.smartRefresh();
    //     }
    //   })
    // );

    // DISABLED: Window focus listener to prevent infinite loops
    // window.addEventListener('focus', () => {
    //   console.log('🔄 Window focus detected - checking for refresh...');
    //   this.smartRefresh();
    // });

    // REMOVED: Interval refresh to prevent infinite loops
    // setInterval(() => {
    //   this.smartRefresh();
    // }, 3000);

    // Debounced search subscription
    this.subscription.add(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(term => {
        this.searchCriteria.name = term;
        // Load fresh data from server with search term
        this.loadDoctors();
      })
    );

    // INITIAL DATA LOAD
    console.log('🔄 INITIAL LOAD: Starting smart refresh...');
    this.smartRefresh();
    this.cdr.detectChanges();
  }

  ngAfterViewInit(): void {
    // No need to reload data here - already loaded in ngOnInit
    console.log('🔄 View initialized - data already loaded');
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  // SMART REFRESH METHOD - Intelligent data refresh system
  smartRefresh(): void {
    // Don't refresh during delete operation
    if (this.isDeleting) {
      console.log('🚫 SMART REFRESH BLOCKED: Delete operation in progress...');
      return;
    }

    console.log('🧠 SMART REFRESH: Checking for data updates...');

    // Check localStorage flags for specific actions
    const doctorCreated = localStorage.getItem('doctorCreated');
    const doctorUpdated = localStorage.getItem('doctorUpdated');
    const doctorDeleted = localStorage.getItem('doctorDeleted');
    const lastActionTime = localStorage.getItem('lastDoctorActionTime');

    // If there are recent changes (within last 30 seconds), do full refresh
    if (doctorCreated || doctorUpdated || doctorDeleted) {
      const actionTime = lastActionTime ? parseInt(lastActionTime) : 0;
      const timeDiff = Date.now() - actionTime;

      if (timeDiff < 30000) { // 30 seconds
        console.log('🔄 SMART REFRESH: Recent changes detected, performing full refresh...');
        this.performComprehensiveRefresh();
        return;
      } else {
        // Clear old flags
        localStorage.removeItem('doctorCreated');
        localStorage.removeItem('doctorUpdated');
        localStorage.removeItem('doctorDeleted');
        localStorage.removeItem('lastDoctorActionTime');
      }
    }

    // If no recent flags, load doctors normally
    this.loadDoctors();
  }

  // QUIET LOAD METHOD - Load doctors without UI disruption
  loadDoctorsQuietly(): void {
    // Prevent too frequent quiet refreshes (minimum 5 seconds between calls)
    const now = Date.now();
    if (now - this.lastRefreshTime < 5000) {
      console.log('🚫 QUIET REFRESH SKIPPED: Too soon since last refresh');
      return;
    }

    this.lastRefreshTime = now;

    this.doctorService.getDoctors(true).subscribe({
      next: (response: any) => {
        const doctors = Array.isArray(response) ? response : (response?.doctors || []);
        const newDoctorCount = doctors.length;
        const currentDoctorCount = this.doctors.length;

        if (newDoctorCount !== currentDoctorCount) {
          console.log(`🔄 QUIET REFRESH: Doctor count changed(${currentDoctorCount} → ${newDoctorCount})`);
          this.doctors = doctors;
          this.applyFilters();
          // Remove manual change detection to prevent loops
        }
      },
      error: (error) => {
        console.error('❌ QUIET REFRESH ERROR:', error);
      }
    });
  }

  // COMPREHENSIVE REFRESH METHOD - With debounce to prevent multiple calls
  performComprehensiveRefresh(): void {
    // DEBOUNCE: Prevent multiple simultaneous refresh calls
    if (this.isRefreshing) {
      console.log('� REFRESH BLOCKED: Already refreshing...');
      return;
    }

    // Don't refresh during delete operation
    if (this.isDeleting) {
      console.log('🚫 COMPREHENSIVE REFRESH BLOCKED: Delete operation in progress...');
      return;
    }

    // Clear any pending refresh
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
    }

    // Set debounce timeout
    this.refreshTimeout = setTimeout(() => {
      this.isRefreshing = true;
      console.log('�🔄 COMPREHENSIVE REFRESH: Starting fresh doctor data load...');

      // Clear localStorage flags
      localStorage.removeItem('doctorCreated');
      localStorage.removeItem('doctorUpdated');

      // Reset all filters
      this.searchCriteria = {
        doctorId: '',
        name: '',
        specialization: '',
        department: '',
        gender: '',
        status: ''
      };

      // Load fresh data from server
      this.loadDoctors();
      this.loadDepartments();

      // Reset refresh flag immediately to prevent loops
      this.isRefreshing = false;
    }, 300); // 300ms debounce
  }

  checkForRefresh(): void {
    // Don't refresh during delete operation
    if (this.isDeleting) {
      console.log('🚫 REFRESH BLOCKED: Delete operation in progress...');
      return;
    }

    // Check localStorage flags for refresh with timestamp
    const createdTimestamp = localStorage.getItem('doctorCreated');
    const updatedTimestamp = localStorage.getItem('doctorUpdated');

    if (createdTimestamp) {
      const timeDiff = Date.now() - parseInt(createdTimestamp);
      if (timeDiff < 10000) { // Within 10 seconds
        console.log('🔄 Doctor created flag found - refreshing...');
        localStorage.removeItem('doctorCreated');
        this.loadDoctors();
        this.loadDepartments();
      }
    }

    if (updatedTimestamp) {
      const timeDiff = Date.now() - parseInt(updatedTimestamp);
      if (timeDiff < 10000) { // Within 10 seconds
        console.log('🔄 Doctor updated flag found - refreshing...');
        localStorage.removeItem('doctorUpdated');
        this.loadDoctors();
        this.loadDepartments();
      }
    }
  }

  // Load all doctors without pagination
  loadDoctors(): void {
    console.log('🔄 Loading all doctors...');
    console.log(`📊 Search term: "${this.searchCriteria.name}"`);

    this.subscription.add(
      this.doctorService.getDoctors(true).subscribe({
        next: (doctors) => {
          console.log('✅ All doctors loaded:', doctors.length);
          this.doctors = doctors;
          this.filteredDoctors = [...this.doctors];
          this.totalDoctors = doctors.length;

          console.log('📋 Loaded doctors:', this.doctors.map(d => ({
            name: d.name,
            doctorId: d.doctorId,
            department: typeof d.department === 'string' ? d.department : d.department?.name
          })));

          // Apply frontend filtering if there's a search term
          if (this.searchCriteria.name) {
            this.applyFilters();
          }

          // Update department filter based on available doctors
          this.updateDepartmentFilter();

          // Force immediate render so table shows without extra click
          this.cdr.detectChanges();
          console.log('✅ DOCTORS: Data updated successfully!');
        },
        error: (error) => {
          console.error('❌ Error loading doctors:', error);
          this.cdr.detectChanges();
        }
      })
    );
  }

  loadDepartments(): void {
    // Load departments based on available doctors
    this.updateDepartmentFilter();
  }

  updateDepartmentFilter(): void {
    // Get unique departments from current doctors
    const availableDepartments = new Set<string>();

    this.doctors.forEach(doctor => {
      const departmentName = typeof doctor.department === 'string'
        ? doctor.department
        : doctor.department?.name;

      if (departmentName) {
        availableDepartments.add(departmentName);
      }
    });

    // Convert to array and add 'All' option
    this.departments = ['All', ...Array.from(availableDepartments).sort()];
    console.log('🏥 Available departments with doctors:', this.departments);
  }

  applyFilters(): void {
    const term = (this.searchCriteria.name || '').trim().toLowerCase();

    console.log(`🔍 Frontend search for term: "${term}" in ${this.doctors.length} doctors`);

    this.filteredDoctors = this.doctors.filter(doctor => {
      // Flexible, multi-field search (name, id, phone, specialization, department)
      const departmentName = typeof doctor.department === 'string' ? doctor.department : (doctor.department?.name || '');
      const fullName = (doctor.name || `${doctor.firstName || ''} ${doctor.lastName || ''} `).trim();

      // Create comprehensive searchable text - includes all possible fields INCLUDING department name
      const haystack = [
        doctor.doctorId || '',
        doctor._id || '',
        fullName,
        doctor.firstName || '',
        doctor.lastName || '',
        doctor.phone || '',
        doctor.email || '',
        doctor.specialization || '',
        departmentName,  // This is the key - department name is included in search
        doctor.gender || '',
        doctor.address || ''
      ].join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

      // Enhanced substring search - matches any part of any field
      const textMatches = !term || haystack.includes(term);

      // Apply dropdown filters only if they are specifically selected (not empty or 'All')
      const matchesSpecialization = !this.searchCriteria.specialization ||
        this.searchCriteria.specialization === '' ||
        this.searchCriteria.specialization === 'All' ||
        doctor.specialization === this.searchCriteria.specialization;

      const matchesDepartment = !this.searchCriteria.department ||
        this.searchCriteria.department === '' ||
        this.searchCriteria.department === 'All' ||
        departmentName === this.searchCriteria.department;

      const matchesGender = !this.searchCriteria.gender ||
        this.searchCriteria.gender === '' ||
        this.searchCriteria.gender === 'All' ||
        doctor.gender === this.searchCriteria.gender;

      const matchesStatus = !this.searchCriteria.status ||
        this.searchCriteria.status === '' ||
        (doctor.isActive !== undefined && doctor.isActive.toString() === this.searchCriteria.status);

      return textMatches && matchesSpecialization && matchesDepartment && matchesGender && matchesStatus;
    });

    console.log(`✅ Found ${this.filteredDoctors.length} matching doctors`);
    if (term && this.filteredDoctors.length > 0) {
      console.log(`📋 Matches: `, this.filteredDoctors.map(d => `${d.name} (${d.doctorId}) - ${typeof d.department === 'string' ? d.department : d.department?.name} `));
    }
  }

  clearFilters(): void {
    this.searchCriteria = {
      doctorId: '',
      name: '',
      specialization: '',
      department: '',
      gender: '',
      status: ''
    };
    this.loadDoctors(); // Reload all doctors
  }

  // Debounced search input handler
  onSearchTermChange(value: string): void {
    const trimmedValue = (value || '').trim();
    console.log(`🔍 Search input changed: "${trimmedValue}"`);

    this.searchCriteria.name = trimmedValue;

    // If search is empty, reload all doctors
    if (!trimmedValue) {
      console.log('� Empty search - reloading all doctors');
      this.loadDoctors();
      return;
    }

    // For non-empty search, use frontend filtering on already loaded data
    // This allows us to search department names which backend doesn't support
    console.log(`📊 Current doctors array length: ${this.doctors.length} `);

    // If we don't have doctors loaded yet, load them first without search term
    if (this.doctors.length === 0) {
      console.log('🔄 No doctors loaded - loading all doctors first');
      this.loadAllDoctorsForSearch();
      return;
    }

    // Apply frontend filtering
    this.applyFilters();
    this.cdr.detectChanges();
  }

  // Load all doctors for frontend search (without pagination)
  loadAllDoctorsForSearch(): void {
    console.log('🔄 Loading all doctors for frontend search...');

    this.subscription.add(
      this.doctorService.getDoctors(true).subscribe({
        next: (doctors) => {
          console.log('✅ All doctors loaded for search:', doctors.length);
          this.doctors = doctors;
          this.filteredDoctors = [...this.doctors];

          // Now apply the search filter
          this.applyFilters();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('❌ Error loading all doctors for search:', error);
          this.cdr.detectChanges();
        }
      })
    );
  }

  // Search method
  onSearch(): void {
    this.loadDoctors();
  }



  editDoctor(doctor: Doctor): void {
    if (doctor) {
      console.log('Navigating to edit doctor with ID:', doctor._id);
      this.router.navigate(['/setup/doctors/doctor-registration'], {
        queryParams: { id: doctor._id, mode: 'edit' }
      }).then(success => {
        console.log('Navigation success:', success);
      }).catch(error => {
        console.error('Navigation error:', error);
      });
    }
  }

  viewDoctor(doctor: Doctor): void {
    // Open doctor profile in dialog for editing
    const dialogRef = this.dialog.open(DoctorProfileComponent, {
      width: '1250px',
      maxWidth: '1250px',
      height: '670px',
      data: { doctor: doctor, mode: 'edit' },
      panelClass: 'doctor-profile-dialog'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Refresh the doctor list if changes were made
        this.loadDoctors();
      }
    });
  }

  deleteDoctor(doctor: Doctor): void {
    if (this.isCheckingDelete || this.showDeleteConfirmation || this.showDeleteBlocked) return;
    this.isCheckingDelete = true;

    this.doctorToDelete = doctor;

    // Before showing confirmation, check if doctor is referenced in directories
    const doctorId = doctor._id!;
    this.subscription.add(
      this.doctorRoomDirectoryService.getDirectoriesByDoctor(doctorId).subscribe({
        next: (resp) => {
          // API may ignore doctor filter and return all directories; filter on client to be safe
          const allDirectories = Array.isArray(resp) ? resp : (resp?.data || []);
          const directories = allDirectories.filter((d: any) => {
            const dId = typeof d.doctor === 'string' ? d.doctor : d.doctor?._id;
            return dId === doctorId;
          });

          if (directories && directories.length > 0) {
            // Block deletion only when THIS doctor is referenced
            const dirCount = directories.length;
            this.deleteBlockedMessage = `This doctor cannot be deleted because it is used in ${dirCount} doctor - room - directory record${dirCount > 1 ? 's' : ''}.`;
            // Collect rooms for quick info
            this.blockedRooms = directories
              .map((d: any) => ({ _id: (typeof d.room === 'string' ? d.room : d.room?._id) || '', roomNumber: (typeof d.room === 'string' ? d.roomNumber : d.room?.roomNumber) || '' }))
              .filter((r: any) => !!r._id || !!r.roomNumber);
            this.deleteBlockedDetails = this.blockedRooms.slice(0, 3).map(r => `Room: ${r.roomNumber} `);
            this.showDeleteBlocked = true;
            this.cdr.detectChanges();
            // Auto-hide like department-list
            setTimeout(() => this.closeDeleteBlocked(), 2000);
          } else {
            // Safe to delete – show confirmation modal
            this.deleteMessage = `You are about to remove Dr.${doctor.firstName} ${doctor.lastName} forever.Once deleted, this cannot be restored.`;
            this.showDeleteConfirmation = true;
            this.cdr.detectChanges(); // ensure modal appears on first click (OnPush + async)
          }
          this.isCheckingDelete = false;
        },
        error: () => {
          // On error, be safe and block with generic message
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
    this.doctorToDelete = null;
    this.deleteMessage = '';
    this.cdr.detectChanges();
  }

  confirmDelete(): void {
    if (this.doctorToDelete) {
      const doctorIdToDelete = this.doctorToDelete._id!;
      const doctorNameToDelete = this.doctorToDelete.firstName + ' ' + this.doctorToDelete.lastName;

      console.log('🗑️ DELETING DOCTOR:', doctorNameToDelete, 'ID:', doctorIdToDelete);

      // Set delete flag to prevent refresh during delete
      this.isDeleting = true;

      this.doctorService.deleteDoctor(doctorIdToDelete).subscribe({
        next: (response) => {
          console.log('✅ DELETE API RESPONSE:', response);

          // Set localStorage flags for smart refresh
          localStorage.setItem('doctorDeleted', Date.now().toString());
          localStorage.setItem('lastDoctorAction', 'DELETE');
          localStorage.setItem('lastDoctorActionTime', Date.now().toString());
          localStorage.setItem('deletedDoctorId', doctorIdToDelete);

          // Remove from local array (IMMEDIATE UPDATE)
          this.doctors = this.doctors.filter(d => d._id !== doctorIdToDelete);
          this.filteredDoctors = this.filteredDoctors.filter(d => d._id !== doctorIdToDelete);

          console.log('✅ REMOVED FROM LOCAL ARRAYS - Remaining doctors:', this.doctors.length);

          this.applyFilters(); // Refresh filtered list
          this.showDeleteSuccess = true;
          this.cancelDelete();
          this.cdr.detectChanges(); // Force UI update

          // Delete flag will be reset in onDeleteSuccessClosed()
        },
        error: (error) => {
          console.error('❌ Error deleting doctor:', error);
          alert('Failed to delete doctor. Please try again.');
          this.isDeleting = false; // Reset flag on error
          this.cancelDelete();
        }
      });
    }
  }

  // Delete Success Methods
  onDeleteSuccessClosed(): void {
    this.showDeleteSuccess = false;
    console.log('🔄 DELETE SUCCESS: Modal closed - checking final state');

    // Clear localStorage flags after successful delete
    localStorage.removeItem('doctorDeleted');
    localStorage.removeItem('deletedDoctorId');

    // Force final UI update to ensure deleted doctor is not visible
    this.cdr.detectChanges();

    // Reset delete flag immediately to prevent loops
    this.isDeleting = false;
    console.log('🔄 DELETE OPERATION COMPLETED: Normal operations resumed');
  }

  toggleDoctorStatus(doctor: Doctor): void {
    if (doctor._id) {
      this.doctorService.toggleDoctorStatus(doctor._id).subscribe({
        next: () => {
          console.log('Doctor status updated successfully');
        },
        error: (error) => {
          console.error('Error updating doctor status:', error);
        }
      });
    }
  }

  // Delete Blocked modal close handler
  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
    this.deleteBlockedMessage = '';
    this.deleteBlockedDetails = [];
    this.blockedRooms = [];
  }

  getDefaultImage(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFNUU3RUIiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB4PSI4IiB5PSI4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjOUNBM0FGIi8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDEzLjk5IDcuMDEgMTUuNjIgNiAxOEMxMC4wMSAyMCAxMy45OSAyMCAxOCAxOEMxNi45OSAxNS42MiAxNC42NyAxMy45OSAxMiAxNFoiIGZpbGw9IiM5Q0EzQUYiLz4KPC9zdmc+Cjwvc3ZnPgo=';
  }

  navigateToDocRegistration(): void {
    this.router.navigate(['/setup/doctors/doctor-registration']);
  }

  navigateToDepartment(): void {
    this.router.navigate(['/setup/departments/new']);
  }
  navigateToDocSearchRegistration(): void {
    this.router.navigate(['/setup/doctors/doctor-list']);
  }

  navigateToDocRoomDirectory(): void {
    this.router.navigate(['/setup/doctor-room-directory']);
  }


  getDoctorName(doctor: Doctor): string {
    // Try different name fields in order of preference
    if (doctor.name && doctor.name.trim()) {
      return doctor.name.trim();

    } else if ((doctor as any).fullName && (doctor as any).fullName !== 'undefined undefined' && (doctor as any).fullName !== 'Unknown') {
      return (doctor as any).fullName;
    } else if (doctor.firstName && doctor.lastName) {
      return `${doctor.firstName} ${doctor.lastName} `;
    } else if (doctor.firstName) {
      return doctor.firstName;
    } else if (doctor.lastName) {
      return doctor.lastName;
    } else {
      // If no name available, show doctor ID or fallback
      return doctor.doctorId || doctor._id || 'Unknown Doctor';
    }
  }

  getDepartmentName(department: string | { _id: string; name: string; code?: string }): string {
    if (typeof department === 'string') {
      return department;
    }
    return department?.name || 'N/A';
  }

  getFormattedAge(doctor: Doctor): string {
    if (doctor.age) {
      return doctor.age.toString();
    }

    // Calculate age from date of birth if age is not available
    if (doctor.dateOfBirth) {
      const birthDate = new Date(doctor.dateOfBirth);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return age.toString();
    }

    return 'N/A';
  }

  getFormattedGender(doctor: Doctor): string {
    return doctor.gender || 'N/A';
  }
}
