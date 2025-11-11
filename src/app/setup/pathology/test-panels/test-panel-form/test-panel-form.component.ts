import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { PathologyService, TestCategory, TestDefinition } from '../../services/pathology.service';
import { ServiceHeadService } from '../../../../services/service-head.service';
import { SuccessAlertComponent } from '../../../../shared/components/success-alert/success-alert.component';
import { DeleteConfirmationModalComponent } from '../../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../../shared/components/delete-success-modal/delete-success-modal.component';
import { DeleteBlockedModalComponent } from '../../../../shared/components/delete-blocked-modal/delete-blocked-modal.component';
import { RecordExistsModalComponent } from '../../../../shared/components/record-exists-modal/record-exists-modal.component';
import { AlertService } from '../../../../shared/services/alert.service';

@Component({
  selector: 'app-test-panel-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule, SuccessAlertComponent, DeleteSuccessModalComponent, DeleteConfirmationModalComponent, DeleteBlockedModalComponent, RecordExistsModalComponent],
  templateUrl: './test-panel-form.component.html',
  styleUrls: ['./test-panel-form.component.css']
})
export class TestPanelFormComponent implements OnInit {
  form: FormGroup;

  categories: TestCategory[] = [];
  availableTests: TestDefinition[] = [];
  // store selected TestDefinition IDs
  selectedTests: string[] = [];

  // Edit state
  editId: string | null = null;
  existingShortNameId: string | null = null;

  // Short name dropdown state (same pattern as test-entry.component)
  showShortNameDropdown = false;
  filteredServiceHeads: any[] = [];
  allServiceHeads: any[] = [];
  shortNameSearchTerm = '';
  selectedShortNameObj: any = null;

  // Category selection helper
  selectedCategoryObj: TestCategory | null = null;
  // View mode flag used by template to disable controls where needed
  isViewMode = false;

  // Sample types for panel (loaded from Units collection kind: 'SAMPLE')
  showSampleTypeDropdown = false;
  filteredSampleTypeOptions: Array<{ _id: string; name: string }> = [];
  sampleTypeSearchTerm = '';
  // Record exists modal state
  showRecordExistsModal = false;
  duplicateRecordMessage = '';

  // Delete modals state (mirror test-entry)
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  showDeleteBlocked = false;
  deleteTitle = 'Delete Sample Type';
  deleteMessage = 'Are you sure you want to delete this sample type?';
  deleteSuccessTitle = 'Sample Type Deleted';
  deleteBlockedTitle = 'Cannot Delete Sample Type';
  deleteBlockedMessage = 'This sample type is in use and cannot be deleted.';
  private pendingDeleteSampleTypeId: string | null = null;

  sampleTypeOptions: Array<{ _id: string; name: string }> = [];
  // Selected sample types (multi-select with checkboxes like test-entry)
  selectedSampleTypeObjs: Array<{ _id: string; name: string }> = [];
  // Interaction guards (parity with test-entry)
  interactingWithSampleType = false;
  mouseInSampleDropdown = false;
  showSampleTypeModal = false;
  newSampleTypeName = '';
  // For outside click detection on dropdown
  @ViewChild('sampleTypeContainer', { static: false }) sampleTypeContainer?: ElementRef;

  // Success alert state
  showSuccessAlert = false;
  alertTitle = 'Test Panel Saved!';
  alertMessage = 'The test panel has been saved successfully.';
  alertBadgeText = 'Saved Successfully';
  // Prevent double-submit and delayed alert glitches
  isSubmitting = false;

  onAlertClose = () => {
    this.showSuccessAlert = false;
    // After edit, go back to the panel view page; otherwise go to listing
    if (this.editId) {
      this.router.navigate(['/setup/pathology/test-panels', this.editId, 'view']);
    } else {
      this.router.navigate(['/setup/pathology/test-panels']);
    }
  };

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private pathologyService: PathologyService,
    private serviceHeadService: ServiceHeadService,
    private cdr: ChangeDetectorRef,
    private alertService: AlertService
  ) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      shortName: ['', [Validators.required, Validators.minLength(1)]],
      category: ['', Validators.required], // stores category name for UI; we map to _id on save
      sampleType: [''],
      tests: [[]]     // array of selected TestDefinition IDs
    });
  }

  ngOnInit(): void {
    this.loadCategories();
    this.loadTestDefinitions();
    this.loadShortNames();
    this.loadSampleTypesFromBackend();

    // If route has :id, load and prefill for edit mode
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId = id;
      this.loadAndPrefill(id);
    }
  }

  private loadCategories(): void {
    this.pathologyService.getTestCategories().subscribe(cats => {
      this.categories = (cats || [])
        .filter(c => (c as any).isActive !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    });
  }

  private loadTestDefinitions(): void {
    this.pathologyService.getTestDefinitions().subscribe(defs => {
      this.availableTests = (defs || [])
        .filter(d => (d as any).isActive !== false)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    });
  }

  // Load available short names from ServiceHeads (PATHOLOGY)
  private loadShortNames(): void {
    this.serviceHeadService.getServiceHeadsByCategory('PATHOLOGY').subscribe({
      next: (serviceHeads) => {
        // Load existing test definitions to filter out already saved ones (same as test-entry)
        this.pathologyService.getTestDefinitions().subscribe({
          next: (response: any) => {
            const testDefinitions = Array.isArray(response) ? response : response.testDefinitions || [];
            const savedShortNames = testDefinitions
              .map((test: any) => {
                if (typeof test.shortName === 'string') return test.shortName;
                if (typeof test.shortName === 'object' && test.shortName.testName) return test.shortName.testName;
                return null;
              })
              .filter((name: any) => name !== null);

            const availableServiceHeads = serviceHeads.filter(sh => !savedShortNames.includes(sh.testName));
            this.allServiceHeads = availableServiceHeads;
            this.filteredServiceHeads = [...this.allServiceHeads];
            this.cdr.detectChanges();
          },
          error: () => {
            // Fallback: show all
            this.allServiceHeads = serviceHeads;
            this.filteredServiceHeads = [...this.allServiceHeads];
            this.cdr.detectChanges();
          }
        });
      },
      error: () => {
        this.allServiceHeads = [];
        this.filteredServiceHeads = [];
      }
    });
  }

  // Load sample types from Units collection (kind: 'SAMPLE')
  private loadSampleTypesFromBackend(): void {
    this.pathologyService.getSampleTypes().subscribe({
      next: (options) => {
        this.sampleTypeOptions = (options || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
        this.cdr.detectChanges();
      },
      error: () => {
        this.sampleTypeOptions = [];
        this.filteredSampleTypeOptions = [];
        this.cdr.detectChanges();
      }
    });
  }


  // Tests selection stores IDs
  onTestSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value; // TestDefinition _id
    if (value && !this.selectedTests.includes(value)) {
      this.selectedTests = [...this.selectedTests, value];
      this.form.patchValue({ tests: this.selectedTests });
    }
    select.selectedIndex = -1;
  }

  removeTest(id: string): void {
    this.selectedTests = this.selectedTests.filter(t => t !== id);
    this.form.patchValue({ tests: this.selectedTests });
  }

  get f() { return this.form.controls; }

  // Helpers for short name dropdown (same as test-entry)
  onShortNameSearch(event: any): void {
    const searchTerm = (event.target.value || '').toLowerCase();
    this.shortNameSearchTerm = searchTerm;
    if (searchTerm.trim() === '') {
      this.filteredServiceHeads = [...this.allServiceHeads];
    } else {
      this.filteredServiceHeads = this.allServiceHeads.filter(sh => sh.testName.toLowerCase().includes(searchTerm));
    }
    this.showShortNameDropdown = this.filteredServiceHeads.length > 0;
    this.cdr.detectChanges();
  }

  onShortNameBlur(): void {
    setTimeout(() => {
      this.showShortNameDropdown = false;
      this.cdr.detectChanges();
    }, 200);
  }

  // Sample type dropdown methods (object-based, same as test-entry)
  onSampleTypeSearch(event: any): void {
    const searchTerm = (event?.target?.value || '').toLowerCase();
    this.sampleTypeSearchTerm = searchTerm;
    const source = this.sampleTypeOptions || [];
    if (!searchTerm.trim()) {
      this.filteredSampleTypeOptions = [...source];
    } else {
      this.filteredSampleTypeOptions = source.filter(x => (x.name || '').toLowerCase().includes(searchTerm));
    }
    this.showSampleTypeDropdown = this.filteredSampleTypeOptions.length > 0;
    this.cdr.detectChanges();
  }

  isSampleTypeSelected(id: string): boolean {
    return this.selectedSampleTypeObjs.some(s => s._id === id);
  }

  onSampleTypeCheckboxChange(st: { _id: string; name: string }, event: any): void {
    const checked = !!event?.target?.checked;
    if (checked) {
      if (!this.isSampleTypeSelected(st._id)) {
        this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, st];
      }
    } else {
      this.selectedSampleTypeObjs = this.selectedSampleTypeObjs.filter(s => s._id !== st._id);
    }
    // Update display string in form control
    this.form.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
    this.cdr.detectChanges();
  }

  onSampleTypeBlur(): void {
    // Keep dropdown open while user is interacting with checkbox list (same as test-entry)
    setTimeout(() => {
      if (!(this.interactingWithSampleType || this.mouseInSampleDropdown)) {
        this.showSampleTypeDropdown = false;
      }
      this.interactingWithSampleType = false;
      this.cdr.detectChanges();
    }, 120);
  }

  // Close Sample Type dropdown when clicking outside the container (parity with test-entry)
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.sampleTypeContainer) return;
    const target = event.target as HTMLElement;
    if (this.sampleTypeContainer && !this.sampleTypeContainer.nativeElement.contains(target)) {
      if (this.showSampleTypeDropdown) {
        this.showSampleTypeDropdown = false;
        this.cdr.detectChanges();
      }
    }
  }

  // Deprecated single select kept for compatibility; now using checkbox multi-select
  selectSampleType(st: { _id: string; name: string } | string): void {
    if (!st) return;
    const obj = typeof st === 'string' ? (this.sampleTypeOptions.find(x => x.name === st) || { _id: '', name: st }) : st;
    // toggle selection
    const exists = this.selectedSampleTypeObjs.some(s => s._id === obj._id);
    if (exists) {
      this.selectedSampleTypeObjs = this.selectedSampleTypeObjs.filter(s => s._id !== obj._id);
    } else {
      this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, obj];
    }
    this.form.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
    this.sampleTypeSearchTerm = '';
    this.cdr.detectChanges();
  }

  onSampleTypeFocus(): void {
    this.showSampleTypeDropdown = this.filteredSampleTypeOptions.length > 0;
    this.cdr.detectChanges();
  }

  openSampleTypeModal(): void {
    // Close any open dropdown so clicks don't hit underlying controls
    this.showSampleTypeDropdown = false;
    this.showSampleTypeModal = true;
    this.newSampleTypeName = '';
    this.cdr.detectChanges();
    setTimeout(() => {
      const input = document.getElementById('newSampleType') as HTMLInputElement;
      if (input) input.focus();
    }, 50);
  }

  closeSampleTypeModal(): void {
    this.showSampleTypeModal = false;
    this.newSampleTypeName = '';
    this.cdr.detectChanges();
  }

  // Delete flow (mirror test-entry)
  promptDeleteSampleType(st: any): void {
    if (!st || !st._id) return; // allow delete only when id exists
    this.pendingDeleteSampleTypeId = st._id;
    // call usage check first
    this.pathologyService.checkSampleTypeUsage(st._id).subscribe({
      next: (res) => {
        const blocked = !!res?.blocked;
        if (blocked) {
          this.deleteBlockedMessage = res?.message || 'This sample type is in use and cannot be deleted.';
          this.showDeleteBlocked = true;
        } else {
          this.showDeleteConfirmation = true;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        // fallback to confirmation if check fails
        this.showDeleteConfirmation = true;
        this.cdr.detectChanges();
      }
    });
  }

  confirmDeleteSampleType(): void {
    const id = this.pendingDeleteSampleTypeId;
    this.showDeleteConfirmation = false;
    if (!id) return;
    this.pathologyService.deleteSampleType(id).subscribe({
      next: () => {
        this.sampleTypeOptions = this.sampleTypeOptions.filter(s => s._id !== id);
        this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
        // If deleted item was selected, remove from selection
        if (this.selectedSampleTypeObjs.some(s => s._id === id)) {
          this.selectedSampleTypeObjs = this.selectedSampleTypeObjs.filter(s => s._id !== id);
          this.form.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
        }
        this.pendingDeleteSampleTypeId = null;
        this.showDeleteSuccess = true;
        this.cdr.detectChanges();
      },
      error: () => {
        alert('Failed to delete sample type');
      }
    });
  }

  cancelDeleteSampleType(): void {
    this.showDeleteConfirmation = false;
    this.pendingDeleteSampleTypeId = null;
  }

  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
  }

  onDeleteSampleTypeSuccessClosed(): void {
    this.showDeleteSuccess = false;
  }

  saveNewSampleType(): void {
    const raw = (this.newSampleTypeName || '').trim();
    if (!raw) return;

    this.pathologyService.createSampleTypesBulk([raw]).subscribe({
      next: (res) => {
        const returned: Array<{ _id: string; name: string }> = (res?.sampleTypes || []).map((s: any) => ({ _id: s._id, name: s.name }));

        if (returned.length > 0) {
          // Merge returned into options (dedupe by name, case-insensitive)
          const namesLower = new Set(returned.map(s => (s.name || '').toLowerCase()));
          this.sampleTypeOptions = this.sampleTypeOptions.filter(s => !namesLower.has((s.name || '').toLowerCase()));
          this.sampleTypeOptions = [...this.sampleTypeOptions, ...returned].sort((a, b) => a.name.localeCompare(b.name));
          this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
          // Auto-select newly added ones
          this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, ...returned];
          this.form.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
          this.sampleTypeSearchTerm = '';
        } else {
          // Fallback: add local temp if API didn't return created items
          if (!this.sampleTypeOptions.some(s => (s.name || '').toLowerCase() === raw.toLowerCase())) {
            const temp = { _id: '', name: raw } as any;
            this.sampleTypeOptions.push(temp);
            this.sampleTypeOptions.sort((a, b) => a.name.localeCompare(b.name));
            this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
            this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, temp];
            this.form.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
            this.sampleTypeSearchTerm = '';
          }
        }

        // Keep modal open for quick multiple additions, show alert and refocus input
        this.alertService.showSuccess('Sample Type added', `"${raw}" saved successfully.`, { autoHideDelay: 800 });
        this.newSampleTypeName = '';
        this.cdr.detectChanges();
        setTimeout(() => {
          const input = document.getElementById('newSampleType') as HTMLInputElement;
          if (input) input.focus();
        }, 50);
      },
      error: () => {
        this.alertService.showError('Error', 'Failed to save sample type. Please try again.');
      }
    });
  }


  selectShortName(testName: string): void {
    this.form.patchValue({ shortName: testName });
    this.selectedShortNameObj = this.allServiceHeads.find(sh => sh.testName === testName);
    this.showShortNameDropdown = false;
    this.shortNameSearchTerm = testName;
    this.cdr.detectChanges();

  }

  highlightMatch(text: string, searchTerm: string): string {
    if (!searchTerm || searchTerm.trim() === '') return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  onCategoryChange(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    this.selectedCategoryObj = this.categories.find(c => c.name === name) || null;
  }

  getTestNameById(id: string): string {
    const t = this.availableTests.find(tt => tt._id === id);
    return t ? t.name : id;
  }

  submit(): void {
    if (this.isSubmitting) return; // guard double clicks and stray re-triggers

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.selectedShortNameObj && !this.existingShortNameId) {
      alert('Please select a valid short name from dropdown');
      return;
    }



    this.isSubmitting = true;

    // Resolve category id
    let categoryId = this.selectedCategoryObj?._id;
    if (!categoryId && this.form.value.category) {
      const found = this.categories.find(c => c.name === this.form.value.category);
      categoryId = found?._id as any;
    }

    // If editing, use existing shortName object id if available
    const shortNameId = (this.selectedShortNameObj && this.selectedShortNameObj._id) ? this.selectedShortNameObj._id : (typeof this.form.value.shortName === 'string' ? this.existingShortNameId : null);

    const payload: any = {
      name: this.form.value.name,
      shortName: shortNameId || this.selectedShortNameObj?._id,
      category: categoryId || this.form.value.category,
      testType: 'panel',
      sampleType: (this.selectedSampleTypeObjs || []).map(s => s._id),
      tests: this.selectedTests,
      isActive: true
    };

    const id = this.route.snapshot.paramMap.get('id');

    // Check duplicates (name and shortName) before create/update
    this.pathologyService.getTestDefinitions(true).subscribe({
      next: (response: any) => {
        const tests = Array.isArray(response) ? response : response.testDefinitions || [];
        const nameUpper = String(payload.name || '').trim().toUpperCase();
        const dupByName = tests.some((t: any) => String(t.name || '').toUpperCase() === nameUpper && String(t._id) !== String(id || ''));
        const dupByShort = tests.some((t: any) => (
          (typeof t.shortName === 'object' ? t.shortName?._id : t.shortName) === (payload.shortName || '')
        ) && String(t._id) !== String(id || ''));

        if (dupByName || dupByShort) {
          // Use Record Exists modal rather than alert()
          this.duplicateRecordMessage = dupByName
            ? `A test or panel with the name "${payload.name}" already exists.`
            : `A test or panel with the selected short name already exists.`;
          this.showRecordExistsModal = true;
          this.isSubmitting = false;
          this.cdr.detectChanges();
          return;
        }

        const afterSuccess = (updated: boolean) => {
          this.alertTitle = updated ? 'Test Panel Updated!' : 'Test Panel Saved!';
          this.alertMessage = updated ? 'Your test panel has been updated successfully.' : 'Your test panel has been saved successfully.';
          this.alertBadgeText = updated ? 'Updated Successfully' : 'Saved Successfully';
          this.showSuccessAlert = true; // single, immediate show
          this.isSubmitting = false;
          this.cdr.detectChanges();
        };

        if (id) {
          this.pathologyService.updateTestDefinition(id, payload).subscribe({
            next: () => afterSuccess(true),
            error: () => { this.isSubmitting = false; alert('Failed to update panel'); }
          });
        } else {
          this.pathologyService.createTestDefinition(payload).subscribe({
            next: () => afterSuccess(false),
            error: () => { this.isSubmitting = false; alert('Failed to save panel'); }
          });
        }
      },
      error: () => {
        // If pre-check fails, stop submit to avoid inconsistent state
        this.isSubmitting = false;
        alert('Failed to validate duplicates. Please try again.');
      }
    });
  }
  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.duplicateRecordMessage = '';
  }


  private loadAndPrefill(id: string): void {
    this.pathologyService.getTestDefinitionById(id, true).subscribe({
      next: (def: TestDefinition) => {
        // Prefill form
        const shortNameStr = typeof def.shortName === 'string' ? def.shortName : (def.shortName as any)?.testName;
        this.existingShortNameId = typeof def.shortName === 'object' ? (def.shortName as any)?._id : null;

        // Resolve category and sample type display
        const categoryDisplay = typeof def.category === 'object' ? (def.category as any).name : (def.category as any);

        // Build selected sample types array from various formats
        const stField: any = (def as any).sampleType;
        let selectedArray: Array<{ _id: string; name: string }> = [];
        if (Array.isArray(stField)) {
          selectedArray = stField.map((it: any) => {
            if (it && typeof it === 'object') return { _id: it._id, name: it.name };
            const byId = this.sampleTypeOptions.find(s => s._id === it);
            if (byId) return byId;
            const byName = this.sampleTypeOptions.find(s => s.name === it);
            if (byName) return byName;
            return null as any;
          }).filter((x: any) => !!x);
        } else if (stField && typeof stField === 'object') {
          selectedArray = [{ _id: stField._id, name: stField.name }];
        } else if (typeof stField === 'string') {
          const byName = this.sampleTypeOptions.find(s => s.name === stField);
          if (byName) selectedArray = [byName];
        }
        this.selectedSampleTypeObjs = selectedArray;

        this.form.patchValue({
          name: def.name,
          shortName: shortNameStr || '',
          category: categoryDisplay,
          sampleType: (this.selectedSampleTypeObjs || []).map(s => s.name).join(', ')
        });

        // Set selected short name object if available in service heads list
        if (shortNameStr) {
          this.selectedShortNameObj = this.allServiceHeads.find(sh => sh.testName === shortNameStr) || null;
        }

        // Selected tests from definition
        const ids = Array.isArray((def as any).tests)
          ? ((def as any).tests as any[]).map(t => (typeof t === 'object' ? (t as any)._id : String(t)))
          : [];
        this.selectedTests = ids;
        this.form.patchValue({ tests: this.selectedTests });

        // Set selected category object for mapping on update
        const catName = typeof def.category === 'object' ? (def.category as any).name : (def.category as any);
        this.selectedCategoryObj = this.categories.find(c => c.name === catName) || null;

        // Update alert content to 'Updated'
        this.alertTitle = 'Test Panel Updated!';
        this.alertMessage = 'Your test panel has been updated successfully.';
        this.alertBadgeText = 'Updated Successfully';

        this.cdr.detectChanges();
      },
      error: () => {
        // If fetch fails, continue in create mode
      }
    });
  }

  cancel(): void {
    this.router.navigate(['/setup/pathology/test-panels']);
  }
}
