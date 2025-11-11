import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { PathologyService } from '../services/pathology.service';
import { ServiceHeadService } from '../../../services/service-head.service';
import { SuccessAlertComponent } from '../../../shared/components/success-alert/success-alert.component';
import { DeleteConfirmationModalComponent } from '../../../shared/components/delete-confirmation-modal/delete-confirmation-modal.component';
import { DeleteSuccessModalComponent } from '../../../shared/components/delete-success-modal/delete-success-modal.component';
import { DeleteBlockedModalComponent } from '../../../shared/components/delete-blocked-modal/delete-blocked-modal.component';
import { RecordExistsModalComponent } from '../../../shared/components/record-exists-modal/record-exists-modal.component';
import { AlertService } from '../../../shared/services/alert.service';


@Component({
  selector: 'app-test-entry',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    SuccessAlertComponent,
    DeleteSuccessModalComponent,
    DeleteConfirmationModalComponent,
    DeleteBlockedModalComponent,
    RecordExistsModalComponent
],
  templateUrl: './test-entry.component.html',
  styleUrls: ['./test-entry.component.css']
})
export class TestEntryComponent implements OnInit, OnDestroy {
  testEntryForm: FormGroup;
  testCategories: any[] = [];
  private subscription: Subscription = new Subscription();

  // Store selected category and shortName objects for ID saving
  selectedCategoryObj: any = null;
  selectedShortNameObj: any = null;

  // Test types
  testTypes = [
    { value: 'single', label: 'Single Parameter' },
    { value: 'multiple', label: 'Multiple Parameters' },
    { value: 'nested', label: 'Nested Parameters' },
    { value: 'document', label: 'Document' }
  ];

  // Form states
  selectedTestType: 'single' | 'multiple' | 'nested' | 'document' | null = null;
  isEditMode = false;
  isViewMode = false;

  // Preselection/lock for category via navigation
  preselectedCategoryName: string | null = null;
  categoryLocked = false;

  // Delete unit modal state
  showDeleteConfirmation = false;
  showDeleteSuccess = false;
  showDeleteBlocked = false;
  // Delete modal titles - dynamic for unit/sampleType
  deleteTitle = 'Delete Unit';
  deleteSuccessTitle = 'Unit Deleted';
  deleteBlockedTitle = 'Cannot Delete Unit';

  deleteMessage = 'Are you sure you want to delete this unit?';
  deleteBlockedMessage = 'This unit is used by one or more test definitions and cannot be deleted.';
  unitPendingDelete: { _id?: string; name: string } | null = null;
  pendingDeleteKind: 'UNIT' | 'SAMPLE' = 'UNIT';

  editingTestId: string | null = null;

  // Alert properties
  showAlert = false;
  alertMessage = '';
  alertType: 'success' | 'error' = 'success';

  // Record exists modal properties
  showRecordExistsModal = false;
  duplicateRecordMessage = '';
  existingTestName = '';

  // Default Result Types
  resultTypes = [
    { value: 'manual', label: 'Manual Entry (Technician will enter)' },
    { value: 'dropdown', label: 'Dropdown Selection' },
    { value: 'fixed', label: 'Fixed Value (Editable)' },
    { value: 'formula', label: 'Formula based result' }

  ];

  // Store original test data for updates
  originalTestData: any = null;

  // Modal properties
  showTestTypeModal = false;

  // Short name dropdown properties
  showShortNameDropdown = false;
  filteredTestNames: string[] = [];
  filteredServiceHeads: any[] = [];
  allTestNames: string[] = [];
  allServiceHeads: any[] = []; // Store full service head objects
  shortNameSearchTerm = '';

  // Category dropdown properties
  showCategoryDropdown = false;
  filteredCategories: any[] = [];
  allCategories: any[] = [];
  categorySearchTerm = '';

  // Sample type dropdown properties (now loaded from backend Units collection with kind: 'SAMPLE')
  showSampleTypeDropdown = false;
  filteredSampleTypeOptions: Array<{ _id: string; name: string }> = [];
  sampleTypeSearchTerm = '';
  sampleTypeOptions: Array<{ _id: string; name: string }> = [];
  selectedSampleTypeObjs: Array<{ _id: string; name: string }> = [];
  showSampleTypeModal = false;
  newSampleTypeName = '';
  // For outside-click detection on Sample Type dropdown
  @ViewChild('sampleTypeContainer', { static: false }) sampleTypeContainer?: ElementRef;

  // Parameter sample type dropdown properties (removed - no longer needed)

  // Unit management properties
  showUnitModal = false;
  newUnitName = '';
  showUnitDropdown: { [key: number]: boolean } = {};
  showParameterUnitDropdown: string | null = null;
  // Units list with ids from backend
  availableUnits: Array<{ _id?: string; name: string; temp?: boolean }> = [];

  // Unit dropdown properties
  filteredUnits: Array<{ _id?: string; name: string; temp?: boolean }> = [];
  unitSearchTerm = '';
  unitDropdownOpen = false;
  activeUnitDropdown = -1;

  // Single parameter dropdowns
  showSingleUnitDropdown = false;
  singleUnitDropdownOpen = false;
  singleUnitSearchTerm = '';
  filteredSingleUnits: any[] = [];

  inputTypeDropdownOpen = false;
  inputTypeSearchTerm = '';
  filteredInputTypes: string[] = [];
  // Guard to prevent accidental unit delete when another UI element (like Add Options) is clicked
  private suppressUnitDeleteClick = false;
  // Default Result custom dropdown (for dropdown resultType)
  showDefaultResultDropdown: { [index: number]: boolean } = {};
  // Single parameter default result dropdown
  showSingleDefaultResultDropdown = false;
  // Interaction guard for Sample Type dropdown to allow multi-select without closing
  interactingWithSampleType = false;
  mouseInSampleDropdown = false;


  // Context flag to reuse Add Options modal for Single parameter root
  private isSingleOptionContext = false;



  constructor(
    private fb: FormBuilder,
    private pathologyService: PathologyService,
    private serviceHeadService: ServiceHeadService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private alertService: AlertService
  ) {
    this.testEntryForm = this.createForm();
  }

  ngOnInit(): void {
    this.loadTestCategories();
    this.loadPathologyTestNames();
    this.loadSampleTypesFromBackend();
    this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
    this.loadUnitsFromBackend();
    this.checkRouteParams();
    this.focusOnTestName();

    // Listen for test deletions to refresh dropdown
    this.subscription.add(
      this.pathologyService.testDeleted$.subscribe(() => {
        console.log('🔄 Test deleted - refreshing available service heads...');
        this.refreshAvailableServiceHeads();
      })
    );

    // Initialize single parameter dropdowns
    this.filteredSingleUnits = [...this.getAvailableUnits()];
    this.filteredInputTypes = [...this.getInputTypeOptions()];

    // Listen for test save/update to persist any temporary units
    this.subscription.add(
      this.pathologyService.testDefinitionChanged$.subscribe(() => {
        this.persistTemporaryUnits();
      })
    );

    // Add default 2 parameters for multiple test type
    this.addParameter();
    this.addParameter();

    // Watch for test type changes
    this.testEntryForm.get('testType')?.valueChanges.subscribe(testType => {
      this.selectedTestType = testType;
      if (testType === 'multiple') {
        const parametersArray = this.testEntryForm.get('parameters') as FormArray;
        // If no parameters exist, add 2 default ones
        if (parametersArray.length === 0) {
          this.addParameter();
          this.addParameter();
        }
      }
    });
  }

  // Method to refresh available service heads (call this after delete operations)
  refreshAvailableServiceHeads(): void {
    this.loadPathologyTestNames();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  createForm(): FormGroup {
    return this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      shortName: ['', [Validators.required, Validators.minLength(1)]],
      category: ['', Validators.required],
      sampleType: [''], // optional; actual selections kept in selectedSampleTypeObjs
      testType: ['', Validators.required],
      unit: [''],
      inputType: ['Numeric'], // Only required for single test type
      // Single-parameter default result system (mirrors parameter behavior)
      resultType: ['manual'], // manual | dropdown | fixed (used only for single)
      dropdownOptions: [''], // comma-separated for backend storage (single)
      formula: [''],

      dropdownOptionsArrayRoot: this.fb.array([this.fb.control('')]), // UI editing array for single
      defaultResult: [''],
      parameters: this.fb.array([]),
      template: ['default'],
      method: [''],
      instrument: [''],
      isOptional: [false]
    });
  }

  get parametersFormArray(): FormArray {
    return this.testEntryForm.get('parameters') as FormArray;
  }

  createParameterFormGroup(): FormGroup {
    const currentOrder = this.parametersFormArray.length + 1;
    const paramGroup = this.fb.group({
      order: [currentOrder],
      name: ['', Validators.required],
      unit: [''],
      formula: [''],

      inputType: ['Numeric', Validators.required],
      defaultResult: [''],
      resultType: ['manual'], // manual | dropdown | fixed
      dropdownOptions: [''], // comma-separated options for backend storage
      dropdownOptionsArray: this.fb.array([this.fb.control('')]), // UI editing array
      isOptional: [false],
      removed: [false],
      groupBy: [''] // For nested parameters only
    });

    return paramGroup;
  }

  addParameter(): void {
    this.parametersFormArray.push(this.createParameterFormGroup());
    this.cdr.detectChanges();

    // Focus on the new parameter name field
    setTimeout(() => {
      const newIndex = this.parametersFormArray.length - 1;
      const nameInput = document.getElementById(`parameterName_${newIndex}`) as HTMLInputElement;
      if (nameInput) {
        nameInput.focus();
      }
    }, 100);
  }

  removeParameter(index: number): void {
    this.parametersFormArray.removeAt(index);
    this.updateParameterOrders();
    this.cdr.detectChanges();
  }



  // Handle result type change
  onResultTypeChange(parameterIndex: number, event: any): void {
    const resultType = event.target.value;


    const parameter = this.parametersFormArray.at(parameterIndex) as FormGroup;

    if (resultType === 'manual') {
      // Clear values when manual
      parameter.get('defaultResult')?.setValue('');
      parameter.get('dropdownOptions')?.setValue('');
      const arr = parameter.get('dropdownOptionsArray') as FormArray;
      if (arr) {
        while (arr.length > 1) arr.removeAt(arr.length - 1);
        arr.at(0).setValue('');
      }
      parameter.get('formula')?.setValue('');

    } else if (resultType === 'dropdown') {
      // Ensure at least one option control exists
      const arr = parameter.get('dropdownOptionsArray') as FormArray;
      if (arr && arr.length === 0) {


        arr.push(this.fb.control(''));
      }
      // Do NOT auto-open modal here; user will click "Add Options"
    } else if (resultType === 'formula') {
      // For formula-based result: clear dropdown options, keep defaultResult as the formula string
      parameter.get('dropdownOptions')?.setValue('');
      const arr = parameter.get('dropdownOptionsArray') as FormArray;
      if (arr) {
        while (arr.length > 1) arr.removeAt(arr.length - 1);
        arr.at(0).setValue('');
      }
      // Clear defaultResult to avoid mixing when using formula
      parameter.get('defaultResult')?.setValue('');

      // Optional: open editor immediately
      // this.openFormulaModal(parameterIndex);
    }

    this.cdr.detectChanges();
  }

  // Handle click on select element
  onSelectClick(parameterIndex: number, event: any): void {
    if (!this.isViewMode) {
      const parameter = this.parametersFormArray.at(parameterIndex) as FormGroup;
      const currentValue = parameter.get('resultType')?.value;

      // If dropdown is already selected and user clicks on select, open modal
      if (currentValue === 'dropdown') {
        event.preventDefault();
        setTimeout(() => {
          this.openOptionModal(parameterIndex);
        }, 100);
      }
    }
  }

  // Get dropdown options array (string list for select)
  getDropdownOptions(parameter: any): string[] {
    const arr = parameter?.get?.('dropdownOptionsArray') as FormArray | null;
    if (arr && arr.length > 0) {
      return arr.controls
        .map(c => (c.value || '').trim())
        .filter(v => !!v);
    }
    const optionsString = parameter?.get?.('dropdownOptions')?.value || '';
    return optionsString.split(',').map((option: string) => option.trim()).filter((option: string) => option);
  }

  // For template: return the FormArray for options of a parameter index
  getDropdownOptionsArray(parameterIndex: number): FormArray {
    const ctrl = this.parametersFormArray.at(parameterIndex) as FormGroup | undefined;
    if (!ctrl) return this.fb.array([]);
    const arr = ctrl.get('dropdownOptionsArray') as FormArray | null;
    return arr || this.fb.array([]);
  }

  addDropdownOption(parameterIndex: number): void {
    const arr = this.getDropdownOptionsArray(parameterIndex);
    arr.push(this.fb.control(''));
  }

  removeDropdownOption(parameterIndex: number, optionIndex: number): void {
    const arr = this.getDropdownOptionsArray(parameterIndex);
    if (arr.length > 1) {
      arr.removeAt(optionIndex);
    }
  }

  onAddOptionsClick(paramIndex: number, event?: Event): void {
    console.log('%c[onAddOptionsClick] clicked', 'color:#059669', { paramIndex, event });
    this.suppressUnitDeleteClick = true;
    if (event) { event.preventDefault(); event.stopPropagation(); }
    this.isSingleOptionContext = false;
    this.openOptionModal(paramIndex);
    setTimeout(() => (this.suppressUnitDeleteClick = false), 300);
  }

  // Modal for adding a single dropdown option (like Unit modal)
  showOptionModal = false;
  newOptionName = '';
  activeOptionParamIndex: number | null = null;

  openOptionModal(paramIndex: number): void {
    // Close any open Unit dropdowns so clicks don't hit underlying remove buttons
    this.showUnitDropdown = {};
    this.unitDropdownOpen = false;
    this.activeUnitDropdown = -1;
    this.showSingleUnitDropdown = false;

    // Default to parameter context unless flagged for single
    this.isSingleOptionContext = !!this.isSingleOptionContext;
    this.activeOptionParamIndex = this.isSingleOptionContext ? null : paramIndex;
    this.newOptionName = '';
    this.showOptionModal = true;
    this.cdr.detectChanges();
    // Autofocus input when modal opens
    setTimeout(() => {
      const input = document.getElementById('newOption') as HTMLInputElement;
      if (input) input.focus();
    }, 50);
  }

  // Formula Editor modal
  showFormulaModal = false;
  editingFormula: string = '';
  editingParamIndex: number | null = null;
  private isSingleFormulaContext = false;

  openFormulaModal(paramIndex: number): void {
    this.isSingleFormulaContext = false;
    this.editingParamIndex = paramIndex;
    const ctrl = this.parametersFormArray.at(paramIndex) as FormGroup;
    this.editingFormula = (ctrl.get('formula')?.value || '').toString();
    this.showFormulaModal = true;
    this.cdr.detectChanges();
  }

  openSingleFormulaModal(): void {
    this.isSingleFormulaContext = true;
    this.editingParamIndex = null;
    this.editingFormula = (this.testEntryForm.get('formula')?.value || '').toString();
    this.showFormulaModal = true;
    this.cdr.detectChanges();
  }

  saveFormula(): void {
    const value = (this.editingFormula || '').trim();
    if (this.isSingleFormulaContext || this.editingParamIndex === null) {
      this.testEntryForm.get('formula')?.setValue(value);
    } else {
      const ctrl = this.parametersFormArray.at(this.editingParamIndex) as FormGroup;
      ctrl.get('formula')?.setValue(value);
    }
    this.closeFormulaModal();
  }

  closeFormulaModal(): void {
    this.showFormulaModal = false;
    this.editingFormula = '';
    this.editingParamIndex = null;
    this.isSingleFormulaContext = false;
    this.cdr.detectChanges();
  }

  closeOptionModal(): void {
    this.showOptionModal = false;
    this.newOptionName = '';
    this.activeOptionParamIndex = null;
    this.isSingleOptionContext = false;
    this.cdr.detectChanges();
  }

  saveNewOption(): void {
    const value = (this.newOptionName || '').trim();
    if (!value) return;

    if (this.isSingleOptionContext) {
      // Add to root options (single parameter)
      const arrRoot = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
      const existing = arrRoot.controls.map(c => (c.value || '').trim().toLowerCase());
      if (!existing.includes(value.toLowerCase())) arrRoot.push(this.fb.control(value));

      const currentDefault = (this.testEntryForm.get('defaultResult')?.value || '').trim();
      if (!currentDefault) this.testEntryForm.get('defaultResult')?.setValue(value);
    } else {
      // Add to parameter options
      if (this.activeOptionParamIndex === null) return;
      const arr = this.getDropdownOptionsArray(this.activeOptionParamIndex);
      const existing = arr.controls.map(c => (c.value || '').trim().toLowerCase());
      if (!existing.includes(value.toLowerCase())) arr.push(this.fb.control(value));

      const paramGroup = this.parametersFormArray.at(this.activeOptionParamIndex) as FormGroup;
      const currentDefault = (paramGroup.get('defaultResult')?.value || '').trim();
      if (!currentDefault) paramGroup.get('defaultResult')?.setValue(value);
    }

    this.alertService.showSuccess('Option added', `"${value}" saved.`, { autoHideDelay: 1000 });

    // Reset and re-focus input for rapid entry
    this.newOptionName = '';
    this.cdr.detectChanges();
    setTimeout(() => {
      const input = document.getElementById('newOption') as HTMLInputElement;
      if (input) input.focus();
    }, 50);
  }

  // Default Result dropdown handlers for dropdown-type parameters
  openDefaultResultDropdown(paramIndex: number): void {
    this.showDefaultResultDropdown[paramIndex] = true;
    this.cdr.detectChanges();
  }

  onDefaultResultBlur(paramIndex: number): void {
    setTimeout(() => {
      this.showDefaultResultDropdown[paramIndex] = false;
      this.cdr.detectChanges();
    }, 200);
  }

  selectDefaultOption(paramIndex: number, option: string): void {
    const paramGroup = this.parametersFormArray.at(paramIndex) as FormGroup;
    paramGroup.get('defaultResult')?.setValue(option);
    this.showDefaultResultDropdown[paramIndex] = false;
    this.cdr.detectChanges();
  }

  deleteDefaultOption(paramIndex: number, option: string): void {
    const arr = this.getDropdownOptionsArray(paramIndex);
    // Remove all matching instances (case-sensitive as displayed)
    for (let i = arr.length - 1; i >= 0; i--) {
      if ((arr.at(i).value || '') === option) {
        arr.removeAt(i);
      }
    }
    // If current default equals the removed option, adjust to first available or empty
    const paramGroup = this.parametersFormArray.at(paramIndex) as FormGroup;
    const currentDefault = paramGroup.get('defaultResult')?.value || '';
    const optionsLeft: string[] = arr.controls.map(c => (c.value || '').trim()).filter(v => !!v);
    if (currentDefault === option) {
      paramGroup.get('defaultResult')?.setValue(optionsLeft[0] || '');
    }

    // Success alert (2 seconds) — no confirmation or blocked modals
    this.alertService.showSuccess('Option deleted', `"${option}" removed successfully.`, { autoHideDelay: 1000 });

    // Keep dropdown open for continued edits
    this.showDefaultResultDropdown[paramIndex] = true;
  }

  // Handlers for single parameter result type and default result
  // Handlers for single parameter result type and default result
  onSingleResultTypeChange(event: any): void {
    const resultType = event.target.value;
    if (resultType === 'manual') {
      this.testEntryForm.patchValue({ defaultResult: '', dropdownOptions: '', formula: '' });
      const arr = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
      if (arr) {
        while (arr.length > 1) arr.removeAt(arr.length - 1);
        arr.at(0).setValue('');
      }
    } else if (resultType === 'dropdown') {
      const arr = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
      if (arr && arr.length === 0) arr.push(this.fb.control(''));
      this.testEntryForm.patchValue({ formula: '' });
      // Do NOT auto-open modal; user will click Add Options
    } else if (resultType === 'formula') {
      // For formula-based single: clear dropdown options at root; keep defaultResult as formula string
      this.testEntryForm.patchValue({ dropdownOptions: '', defaultResult: '' });
      const arr = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
      if (arr) {
        while (arr.length > 1) arr.removeAt(arr.length - 1);
        arr.at(0).setValue('');
      }
      // Optional: open editor immediately
      // this.openSingleFormulaModal();
    }
    this.cdr.detectChanges();
  }

  onSingleAddOptionsClick(event?: Event): void {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    // Open modal in single parameter root context
    this.isSingleOptionContext = true;
    this.openOptionModal(0);
  }

  openSingleDefaultResultDropdown(): void {
    this.showSingleDefaultResultDropdown = true;
    this.cdr.detectChanges();
  }

  onSingleDefaultResultBlur(): void {
    setTimeout(() => {
      this.showSingleDefaultResultDropdown = false;
      this.cdr.detectChanges();
    }, 200);
  }

  getRootDropdownOptions(): string[] {
    const arr = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
    if (arr && arr.length > 0) {
      return arr.controls.map(c => (c.value || '').trim()).filter(v => !!v);
    }
    const optionsString = this.testEntryForm.get('dropdownOptions')?.value || '';
    return optionsString.split(',').map((o: string) => o.trim()).filter((o: string) => o);
  }

  selectSingleDefaultOption(option: string): void {
    this.testEntryForm.get('defaultResult')?.setValue(option);
    this.showSingleDefaultResultDropdown = false;
    this.cdr.detectChanges();
  }

  deleteSingleDefaultOption(option: string): void {
    const arr = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
    for (let i = arr.length - 1; i >= 0; i--) {
      if ((arr.at(i).value || '') === option) arr.removeAt(i);
    }
    const current = this.testEntryForm.get('defaultResult')?.value || '';
    const optionsLeft = arr.controls.map(c => (c.value || '').trim()).filter(v => !!v);
    if (current === option) this.testEntryForm.get('defaultResult')?.setValue(optionsLeft[0] || '');
    this.alertService.showSuccess('Option deleted', `"${option}" removed successfully.`, { autoHideDelay: 1000 });
    this.showSingleDefaultResultDropdown = true;
    this.cdr.detectChanges();
  }



  updateParameterOrders(): void {
    this.parametersFormArray.controls.forEach((control, index) => {
      control.get('order')?.setValue(index + 1);
    });
  }

  // Drag and Drop functionality
  onDragStart(event: DragEvent, index: number): void {
    event.dataTransfer?.setData('text/plain', index.toString());
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onDrop(event: DragEvent, dropIndex: number): void {
    event.preventDefault();
    const dragIndex = parseInt(event.dataTransfer?.getData('text/plain') || '0');

    if (dragIndex !== dropIndex) {
      this.moveParameter(dragIndex, dropIndex);
    }
  }

  moveParameter(fromIndex: number, toIndex: number): void {
    const parametersArray = this.parametersFormArray;
    const item = parametersArray.at(fromIndex);

    // Remove from old position
    parametersArray.removeAt(fromIndex);

    // Insert at new position
    parametersArray.insert(toIndex, item);

    // Update order numbers
    this.updateParameterOrders();
    this.cdr.detectChanges();
  }

  onTestTypeChange(type: 'single' | 'multiple' | 'nested' | 'document'): void {
    this.selectedTestType = type;

    // Update form control
    this.testEntryForm.patchValue({ testType: type });

    // Clear existing parameters
    while (this.parametersFormArray.length !== 0) {
      this.parametersFormArray.removeAt(0);
    }

    // Add default parameters based on type
    if (type === 'single') {
      // Single parameter doesn't need parameters array - data is in main form
      console.log('Single parameter selected - no parameters array needed');
    } else if (type === 'multiple' || type === 'nested') {
      this.addParameter();
      this.addParameter();
    }

    this.cdr.detectChanges();

    // UX: After test type form appears, focus Short name
    this.focusOnTestName();
  }

  loadTestCategories(): void {
    this.subscription.add(
      this.pathologyService.getTestCategories().subscribe({
        next: (categories) => {
          this.testCategories = categories;
          this.allCategories = [...categories]; // Store all categories
          this.filteredCategories = [...categories]; // Initialize filtered categories
          console.log('Loaded test categories:', this.testCategories);
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error loading test categories:', error);
          this.showAlertMessage('Error loading test categories', 'error');
        }
      })
    );
  }

  loadPathologyTestNames(): void {
    this.subscription.add(
      this.serviceHeadService.getServiceHeadsByCategory('PATHOLOGY').subscribe({
        next: (serviceHeads) => {
          // Load existing test definitions to filter out already saved ones
          this.pathologyService.getTestDefinitions().subscribe({
            next: (response: any) => {
              const testDefinitions = Array.isArray(response) ? response : response.testDefinitions || [];
              const savedShortNames = testDefinitions.map((test: any) => {
                if (typeof test.shortName === 'string') {
                  return test.shortName;
                } else if (typeof test.shortName === 'object' && test.shortName.testName) {
                  return test.shortName.testName;
                }
                return null;
              }).filter((name: any) => name !== null);

              console.log('Saved short names to filter out:', savedShortNames);

              // Filter out already saved service heads
              const availableServiceHeads = serviceHeads.filter(sh =>
                !savedShortNames.includes(sh.testName)
              );

              this.allServiceHeads = availableServiceHeads; // Store filtered objects
              this.allTestNames = availableServiceHeads.map(sh => sh.testName);
              this.filteredTestNames = [...this.allTestNames];
              this.filteredServiceHeads = [...this.allServiceHeads];
              console.log('Available pathology test names (filtered):', this.allTestNames);
              console.log('Available service heads (filtered):', this.allServiceHeads);
              this.cdr.detectChanges();
            },
            error: (error) => {
              console.error('Error loading test definitions for filtering:', error);
              // Fallback to showing all service heads if filtering fails
              this.allServiceHeads = serviceHeads;
              this.allTestNames = serviceHeads.map(sh => sh.testName);
              this.filteredTestNames = [...this.allTestNames];
              this.filteredServiceHeads = [...this.allServiceHeads];
              this.cdr.detectChanges();
            }
          });
        },
        error: (error) => {
          console.error('Error loading pathology test names:', error);
          this.allServiceHeads = [];
          this.allTestNames = [];
          this.filteredTestNames = [];
          this.filteredServiceHeads = [];
        }
      })
    );
  }

  checkRouteParams(): void {
    this.route.queryParams.subscribe(params => {
      // Handle edit/view modes
      if (params['id']) {
        this.editingTestId = params['id'];
        this.isEditMode = params['mode'] === 'edit';
        this.isViewMode = params['mode'] === 'view';

        if (this.isEditMode || this.isViewMode) {
          // force fresh fetch when entering the screen in edit/view mode
          this.loadTestForEdit(params['id'], true);
        }
      }

      // Handle preselecting category when coming from test-database
      const pre = params['preselectCategory'];
      if (pre && !this.isEditMode && !this.isViewMode) {
        this.preselectedCategoryName = pre;
        this.categoryLocked = true;

        // If categories already loaded, apply immediately; else apply once loaded
        const applyPreselection = () => {
          const found = this.allCategories.find(cat => cat.name === pre) || this.testCategories.find(cat => cat.name === pre);
          if (found) {
            this.selectedCategoryObj = found;
            this.testEntryForm.patchValue({ category: found.name });
            this.categorySearchTerm = found.name;
            this.cdr.detectChanges();
          }
        };

        if (this.allCategories.length || this.testCategories.length) {
          applyPreselection();
        } else {
          const sub = this.pathologyService.getTestCategories().subscribe({
            next: (cats) => {
              this.testCategories = cats;
              this.allCategories = [...cats];
              this.filteredCategories = [...cats];
              applyPreselection();
              sub.unsubscribe();
            },
            error: () => {
              // ignore
            }
          });
        }
      }
    });
  }

  loadTestForEdit(testId: string, nocache: boolean = false): void {
    // Ensure all dropdown data is loaded before populating form
    this.ensureDataLoaded().then(() => {
      this.pathologyService.getTestDefinitionById(testId, nocache).subscribe({
        next: (testDefinition) => {
          console.log('🔄 Loading test for edit:', testDefinition);

          // Store original test data to preserve normalValues during update
          this.originalTestData = testDefinition;

          // Derive single-parameter fields from root OR fallback to parameters[0]
          const isSingle = testDefinition.testType === 'single';
          const p0: any = Array.isArray((testDefinition as any).parameters) && (testDefinition as any).parameters.length > 0
            ? (testDefinition as any).parameters[0]
            : null;

          let unitVal: any = (testDefinition as any).unit;
          let inputTypeVal: any = (testDefinition as any).inputType;
          let resultTypeVal: string = (testDefinition as any).resultType || '';
          let dropdownOptionsStr: string = (testDefinition as any).dropdownOptions || '';
          let defaultResultVal: string = (testDefinition as any).defaultResult || '';
	          let formulaVal: string = (testDefinition as any).formula || '';


          if (isSingle && p0) {
            if (!unitVal && p0.unit) unitVal = p0.unit;
            if (!inputTypeVal && p0.inputType) inputTypeVal = p0.inputType;


            if (!resultTypeVal && p0.resultType) resultTypeVal = p0.resultType;
            if (!dropdownOptionsStr && p0.dropdownOptions) dropdownOptionsStr = p0.dropdownOptions;
            if (!defaultResultVal && p0.defaultResult) defaultResultVal = p0.defaultResult;
          }
	            if (!formulaVal && p0 && (p0 as any).formula) formulaVal = (p0 as any).formula;


          // Populate basic form fields
          const formData = {
            name: testDefinition.name,
            shortName: typeof testDefinition.shortName === 'string' ? testDefinition.shortName : testDefinition.shortName.testName,
            category: typeof testDefinition.category === 'string' ? testDefinition.category : testDefinition.category.name,
            sampleType: typeof (testDefinition as any).sampleType === 'object' ? (testDefinition as any).sampleType.name : ((testDefinition as any).sampleType || ''),
            resultType: resultTypeVal || 'manual',
            dropdownOptions: dropdownOptionsStr || '',
            defaultResult: defaultResultVal || '',
            isOptional: (testDefinition as any).isOptional || false,
            testType: testDefinition.testType,
            // Single parameter fields
            unit: unitVal && typeof unitVal === 'object' ? unitVal.name : (unitVal || ''),
            inputType: inputTypeVal || 'Numeric',
            method: testDefinition.method || '',
            instrument: testDefinition.instrument || ''
          };

          console.log('📝 Form data to populate:', formData);
          this.testEntryForm.patchValue(formData);

          // Set selected objects for dropdowns
          if (typeof testDefinition.category === 'object') {
            this.selectedCategoryObj = testDefinition.category;
          } else if (typeof testDefinition.category === 'string') {
            // Try to find category object by name
            this.selectedCategoryObj = this.testCategories.find(cat => cat.name === testDefinition.category) || null;
          }

          // Expand root dropdownOptions into dropdownOptionsArrayRoot for UI (with p0 fallback)
          const rootArr = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
          const optsStr = dropdownOptionsStr || '';
          const opts = optsStr.split(',').map((o: string) => o.trim()).filter((o: string) => o);
          if (opts.length > 0) {
            while (rootArr.length > 0) rootArr.removeAt(0);
            opts.forEach((o: string) => rootArr.push(this.fb.control(o)));
          }

          // Set selected sample types (supports array or single)
          const stField: any = (testDefinition as any).sampleType;
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
          // Update form control display string
          this.testEntryForm.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });

          if (typeof testDefinition.shortName === 'object') {
            this.selectedShortNameObj = testDefinition.shortName;
          } else if (typeof testDefinition.shortName === 'string') {
            // Try to find shortName object by testName
            this.selectedShortNameObj = this.allServiceHeads.find(sh => sh.testName === testDefinition.shortName) || null;
          }

          this.selectedTestType = testDefinition.testType as any;

          console.log('✅ Selected objects set:');
          console.log('📂 Category:', this.selectedCategoryObj);
          console.log('🏷️ Short Name:', this.selectedShortNameObj);
          console.log('🧪 Test Type:', this.selectedTestType);

          // Trigger change detection and focus on first field
          setTimeout(() => {
            this.cdr.detectChanges();
            this.focusOnTestName();
            console.log('🎯 Form populated and focused');


          }, 100);

          // Clear existing parameters
          while (this.parametersFormArray.length !== 0) {
            this.parametersFormArray.removeAt(0);
          }

          // Load parameters based on test type
          if (testDefinition.parameters && testDefinition.parameters.length > 0) {
            testDefinition.parameters.forEach(param => {
              const paramGroup = this.createParameterFormGroup();
              // Patch basic fields
              paramGroup.patchValue({
                order: param.order,
                name: param.name,
                unit: (param && typeof (param as any).unit === 'object') ? ((param as any).unit?.name || '') : ((param as any).unit || ''),
                inputType: param.inputType,
                defaultResult: param.defaultResult || '',
                formula: (param as any).formula || '',

                resultType: param.resultType || 'manual',
                dropdownOptions: param.dropdownOptions || '',
                isOptional: param.isOptional || false,
                removed: param.removed || false,
                groupBy: param.groupBy || '',
                normalValues: param.normalValues || []
              });

              // If dropdownOptions string exists, expand into array for UI
              const arr = paramGroup.get('dropdownOptionsArray') as FormArray;
              const optionsString = param.dropdownOptions || '';
              const options = optionsString.split(',').map((o: string) => o.trim()).filter((o: string) => o);
              if (options.length > 0) {
                // Clear default one and load actual options
                while (arr.length > 0) arr.removeAt(0);
                options.forEach((opt: string) => arr.push(this.fb.control(opt)));
              }

              this.parametersFormArray.push(paramGroup);
            });
          }

          // Set form state
          if (this.isViewMode) {
            this.testEntryForm.disable();
          }

          // Trigger change detection and focus
          this.cdr.detectChanges();
          this.focusOnTestName();
        },
        error: (error) => {
          console.error('Error loading test for edit:', error);
          this.showAlert = true;
          this.alertType = 'error';
          this.alertMessage = 'Failed to load test data for editing';
        }
      });
    });
  }

  private async ensureDataLoaded(): Promise<void> {
    const promises: Promise<any>[] = [];

    // Wait for categories to load if not already loaded
    if (this.testCategories.length === 0) {
      promises.push(new Promise<void>((resolve) => {
        this.pathologyService.getTestCategories().subscribe({
          next: (categories) => {
            this.testCategories = categories;
            resolve();
          },
          error: () => resolve() // Continue even if failed
        });
      }));
    }

    // Wait for service heads to load if not already loaded
    if (this.allServiceHeads.length === 0) {
      promises.push(new Promise<void>((resolve) => {
        this.serviceHeadService.getServiceHeadsByCategory('PATHOLOGY').subscribe({
          next: (serviceHeads) => {
            this.allServiceHeads = serviceHeads;
            this.allTestNames = serviceHeads.map(sh => sh.testName);
            this.filteredTestNames = [...this.allTestNames];
            this.filteredServiceHeads = [...this.allServiceHeads];
            resolve();
          },
          error: () => resolve() // Continue even if failed
        });
      }));
    }

    // Wait for all promises to complete
    await Promise.all(promises);
    console.log('✅ All dropdown data loaded for edit mode');
  }

  focusOnTestName(): void {
    setTimeout(() => {
      // Prefer focusing Short Name as requested
      const shortNameInput = document.getElementById('shortName') as HTMLInputElement;
      if (shortNameInput && !this.isViewMode) {
        shortNameInput.focus();
        return;
      }
      // Fallback to Test Name if Short Name not found
      const testNameInput = document.getElementById('testName') as HTMLInputElement;
      if (testNameInput && !this.isViewMode) {
        testNameInput.focus();
      }
    }, 100);
  }

  onSubmit(): void {
    console.log('🔥 Form submitted!');
    console.log('📝 Operation:', this.isEditMode ? 'UPDATE' : 'SAVE');
    console.log('✅ Form valid:', this.testEntryForm.valid);
    console.log('❌ Form errors:', this.getFormValidationErrors());
    console.log('📋 Form value:', this.testEntryForm.value);
    console.log('👁️ isViewMode:', this.isViewMode);
    console.log('🧪 selectedTestType:', this.selectedTestType);
    console.log('🏷️ selectedShortNameObj:', this.selectedShortNameObj);
    console.log('🆔 editingTestId:', this.editingTestId);

    if (!this.isViewMode) {
      // Check form validity based on test type
      const isFormValid = this.validateFormByTestType();

      if (isFormValid) {
        const formData = this.testEntryForm.value;

        // Auto-uppercase test name
        if (formData.name) {
          formData.name = formData.name.toUpperCase();
        }
        if (formData.shortName) {
          formData.shortName = formData.shortName.toUpperCase();
        }

        if (this.isEditMode && this.editingTestId) {
          // On update, check duplicates (name and shortName) excluding current ID
          this.checkDuplicatesBeforeUpdate(formData);
        } else {
          // On create, check duplicates (name and shortName)
          this.checkDuplicatesBeforeCreate(formData);
        }
      } else {
        console.log('❌ Form validation failed');
        this.markFormGroupTouched();
        this.showAlertMessage('Please fill all required fields correctly.', 'error');
      }
    } else {
      console.log('❌ In view mode - cannot save');
      this.showAlertMessage('Cannot save in view mode.', 'error');
    }
  }

  // Duplicate checks
  private checkDuplicatesBeforeCreate(formData: any): void {
    const shortNameId = this.selectedShortNameObj?._id;
    const nameUpper = String(formData.name || '').trim().toUpperCase();

    this.subscription.add(
      this.pathologyService.getTestDefinitions().subscribe({
        next: (response: any) => {
          const tests = Array.isArray(response) ? response : response.testDefinitions || [];
          const dupByName = tests.some((t: any) => String(t.name || '').toUpperCase() === nameUpper);
          const dupByShort = shortNameId && tests.some((t: any) => (
            t.shortName === shortNameId || (typeof t.shortName === 'object' && t.shortName?._id === shortNameId)
          ));

          if (dupByName) {
            this.duplicateRecordMessage = `A test with the name "${formData.name}" already exists in the system.`;
            this.showRecordExistsModal = true;
          } else if (dupByShort) {
            const shortNameDisplay = this.selectedShortNameObj?.serviceName || 'Unknown';
            this.existingTestName = shortNameDisplay;
            this.duplicateRecordMessage = `A test with the short name "${shortNameDisplay}" already exists in the system.`;
            this.showRecordExistsModal = true;
          } else {
            this.createTest(formData);
          }
        },
        error: () => this.createTest(formData)
      })
    );
  }

  private checkDuplicatesBeforeUpdate(formData: any): void {
    if (!this.editingTestId) { this.updateTest(formData); return; }

    const shortNameId = this.selectedShortNameObj?._id;
    const nameUpper = String(formData.name || '').trim().toUpperCase();

    this.subscription.add(
      this.pathologyService.getTestDefinitions(true).subscribe({
        next: (response: any) => {
          const tests = Array.isArray(response) ? response : response.testDefinitions || [];
          const others = tests.filter((t: any) => String(t._id) !== String(this.editingTestId));
          const dupByName = others.some((t: any) => String(t.name || '').toUpperCase() === nameUpper);
          const dupByShort = shortNameId && others.some((t: any) => (
            t.shortName === shortNameId || (typeof t.shortName === 'object' && t.shortName?._id === shortNameId)
          ));

          if (dupByName) {
            this.duplicateRecordMessage = `A test with the name "${formData.name}" already exists in the system.`;
            this.showRecordExistsModal = true;
          } else if (dupByShort) {
            const shortNameDisplay = this.selectedShortNameObj?.serviceName || 'Unknown';
            this.existingTestName = shortNameDisplay;
            this.duplicateRecordMessage = `A test with the short name "${shortNameDisplay}" already exists in the system.`;
            this.showRecordExistsModal = true;
          } else {
            this.updateTest(formData);
          }
        },
        error: () => this.updateTest(formData)
      })
    );
  }

  onRecordExistsModalClosed(): void {
    this.showRecordExistsModal = false;
    this.duplicateRecordMessage = '';
    this.existingTestName = '';
  }

  createTest(testData: any): void {
    console.log('Creating test:', testData);

    // Validate required fields
    if (!this.selectedShortNameObj) {
      this.showAlertMessage('Please select a valid short name from the dropdown.', 'error');
      return;
    }

    if (!this.selectedCategoryObj) {
      this.showAlertMessage('Please select a valid category from the dropdown.', 'error');
      return;
    }

    // Create test definition object based on test type
    const testDefinition: any = {
      name: testData.name,
      shortName: this.selectedShortNameObj._id,
      category: this.selectedCategoryObj._id,
      sampleType: (this.selectedSampleTypeObjs || []).map(s => s._id),
      testType: testData.testType,
      method: testData.method,
      instrument: testData.instrument,
      isActive: true
    };

    // Add fields based on test type
    if (testData.testType === 'single') {
      // Single parameter: include unit, inputType, and default-result system at root level
      testDefinition.unit = testData.unit; // ObjectId
      testDefinition.inputType = testData.inputType;
      testDefinition.resultType = testData.resultType || 'manual';
      // Collapse dropdownOptionsArrayRoot to CSV for backend if present
      const arrRoot = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
      const dropdownOptions = Array.isArray(arrRoot?.controls)
        ? arrRoot.controls.map(c => (c.value || '').trim()).filter(v => !!v).join(', ')
        : (testData.dropdownOptions || '');
      testDefinition.dropdownOptions = dropdownOptions;
      testDefinition.defaultResult = testData.defaultResult || '';
      testDefinition.isOptional = !!testData.isOptional;
      // Dedicated formula field at root; clear defaultResult when using formula
      (testDefinition as any).formula = testData.formula || '';
      if (((testDefinition.resultType || '') + '').toLowerCase() === 'formula') {
        testDefinition.defaultResult = '';
      }

      // Move normalValues from parameters[0] to root if present
      if (testData.parameters && testData.parameters.length > 0 && testData.parameters[0].normalValues) {
        testDefinition.normalValues = testData.parameters[0].normalValues;
      }
      // Don't include parameters array for single parameter tests
      delete testDefinition.parameters;
    } else if (testData.testType === 'multiple' || testData.testType === 'nested') {
      // Multiple/Nested parameters: include parameters array, no unit/inputType in main
      // Collapse dropdownOptionsArray into dropdownOptions string and remove empty/invalid fields
      const canonicalizeInputType = (val: any): 'Numeric' | 'Single Line' | 'Paragraph' => {
        const s = String(val || '').toLowerCase().trim();
        if (s === 'single line' || s === 'single-line' || s === 'singleline') return 'Single Line';
        if (s === 'paragraph') return 'Paragraph';
        return 'Numeric';
      };

      const processedParams = (testData.parameters || []).map((p: any, idx: number) => {
        const optionsArr = p.dropdownOptionsArray || [];
        const dropdownOptions = Array.isArray(optionsArr)
          ? optionsArr.map((o: any) => (o || '').trim()).filter((o: string) => o).join(', ')
          : (p.dropdownOptions || '');

        const cleaned: any = { ...p, dropdownOptions, dropdownOptionsArray: undefined };
        // Ensure enum-correct inputType
        cleaned.inputType = canonicalizeInputType(cleaned.inputType);
        // Ensure numeric order
        cleaned.order = Number(cleaned.order) || idx + 1;
        // Remove unit if blank so backend can cast schema properly
        if (!cleaned.unit) { delete cleaned.unit; }
        return cleaned;
      });
      testDefinition.parameters = processedParams;
    }
    // Document type: only basic fields (no additional fields needed)

    console.log('Test definition to save:', testDefinition);
    console.log('Selected shortName object:', this.selectedShortNameObj);
    console.log('Selected category object:', this.selectedCategoryObj);

    // Use pathology service to create test definition
    this.subscription.add(
      this.pathologyService.createTestDefinition(testDefinition).subscribe({
        next: (response: any) => {
          console.log('Test created successfully:', response);
          this.showAlertMessage('Test created successfully!', 'success');

          // Notify other components about the test creation
          this.pathologyService.notifyTestDefinitionChanged();

          // Navigate to test-detail after alert is shown
          const testId = response.testDefinition?._id || response._id;
          if (testId) {
            setTimeout(() => {
              this.router.navigate(['/setup/pathology/test-detail', testId]);
            }, 2000);
          } else {
            console.error('No test ID found in response:', response);
            setTimeout(() => {
              this.router.navigate(['/setup/pathology/test-database']);
            }, 2000);
          }
        },
        error: (error) => {
          console.error('❌ Error creating test:', error);
          console.error('❌ Error status:', error.status);
          console.error('❌ Error message:', error.error?.message);
          console.error('❌ Full error object:', JSON.stringify(error, null, 2));

          let errorMessage = 'Error creating test. Please try again.';

          if (error.status === 400) {
            if (error.error?.error === 'Duplicate test definition' ||
                error.error?.message?.includes('already exists')) {
              errorMessage = 'A test with this name already exists. Please use a different name.';
            } else {
              errorMessage = error.error?.message || errorMessage;
            }
          }

          this.showAlertMessage(errorMessage, 'error');
        }
      })
    );
  }

  updateTest(testData: any): void {
    console.log('Updating test:', testData);

    if (!this.editingTestId) {
      this.showAlertMessage('Error: No test ID found for update', 'error');
      return;
    }

    // Create test definition object
    let categoryId = this.selectedCategoryObj ? this.selectedCategoryObj._id : null;

    // If no selectedCategoryObj, try to find category by name
    if (!categoryId && testData.category) {
      const foundCategory = this.testCategories.find(cat => cat.name === testData.category);
      categoryId = foundCategory ? foundCategory._id : testData.category;
    }

    let shortNameId = this.selectedShortNameObj ? this.selectedShortNameObj._id : null;

    // If no selectedShortNameObj, try to find by testName
    if (!shortNameId && testData.shortName) {
      const foundShortName = this.allServiceHeads.find(sh => sh.testName === testData.shortName);
      shortNameId = foundShortName ? foundShortName._id : testData.shortName;
    }

    // Create test definition object based on test type
    const testDefinition: any = {
      name: testData.name,
      shortName: shortNameId,
      category: categoryId,
      sampleType: (this.selectedSampleTypeObjs || []).map(s => s._id),
      testType: testData.testType,
      method: testData.method,
      instrument: testData.instrument,
      // Only include parameters for non-single types (avoid empty array on single)
      ...(testData.testType === 'single' ? {} : { parameters: [] }),
      isActive: true
    };

    // Handle different test types
    if (testData.testType === 'single') {
      // Single parameter: include unit (ObjectId) and inputType at root level, plus default-result system at root
	      // Dedicated formula field at root; clear defaultResult when using formula
	      (testDefinition as any).formula = testData.formula || '';
	      if (((testDefinition.resultType || '') + '').toLowerCase() === 'formula') {
	        testDefinition.defaultResult = '';
	      }

      testDefinition.unit = testData.unit; // ObjectId
      testDefinition.inputType = testData.inputType;
      testDefinition.resultType = testData.resultType || 'manual';
      const arrRootUpd = this.testEntryForm.get('dropdownOptionsArrayRoot') as FormArray;
      const dropdownOptionsUpd = Array.isArray(arrRootUpd?.controls)
        ? arrRootUpd.controls.map(c => (c.value || '').trim()).filter(v => !!v).join(', ')
        : (testData.dropdownOptions || '');
      testDefinition.dropdownOptions = dropdownOptionsUpd;
      testDefinition.defaultResult = testData.defaultResult || '';
      testDefinition.isOptional = !!testData.isOptional;

      // For single parameter, preserve normalValues at root level
      if (this.originalTestData) {
        // Check if normalValues exist at root level (new structure)
        if (this.originalTestData.normalValues) {
          testDefinition.normalValues = this.originalTestData.normalValues;
        }
        // Check if normalValues exist in parameters array (old structure) - migrate to root
        else if (this.originalTestData.parameters &&
                 this.originalTestData.parameters.length > 0 &&
                 this.originalTestData.parameters[0].normalValues) {
          testDefinition.normalValues = this.originalTestData.parameters[0].normalValues;
        }
      }

      // Also check if form has normalValues in parameters (from normal-value-editor)
      if (testData.parameters && testData.parameters.length > 0 && testData.parameters[0].normalValues) {
        testDefinition.normalValues = testData.parameters[0].normalValues;
      }

      // Don't include parameters array for single parameter tests - explicitly delete it
      delete testDefinition.parameters;
    } else if (testData.testType === 'multiple' || testData.testType === 'nested') {
      // Multiple/Nested parameters: ensure clean payload and preserve groupBy/normalValues
      const processedParams = (testData.parameters || []).map((param: any, index: number) => {
        const originalParam = (this.originalTestData && this.originalTestData.parameters)
          ? this.originalTestData.parameters[index]
          : undefined;

        // Collapse dropdown options array to CSV string
        const optionsArr = param.dropdownOptionsArray || [];
        const dropdownOptions = Array.isArray(optionsArr)
          ? optionsArr.map((o: any) => (o || '').trim()).filter((o: string) => o).join(', ')
          : (param.dropdownOptions || '');

        const cleaned: any = {
          ...param,
          dropdownOptions,
          dropdownOptionsArray: undefined,
          // Ensure numeric order
          order: Number(param.order) || index + 1,
          // Preserve groupBy for nested tests
          groupBy: (param.groupBy || originalParam?.groupBy || ''),
          // Preserve existing normalValues if not present in form
          normalValues: (param.normalValues && param.normalValues.length > 0)
            ? param.normalValues
            : (originalParam?.normalValues || [])
        };

        // Remove unit if blank to avoid ObjectId cast error on backend
        if (!cleaned.unit) { delete cleaned.unit; }

        return cleaned;
      });

      testDefinition.parameters = processedParams;
    }
    // Document type: only basic fields (no additional fields needed)

    console.log('🔍 Original test data:', this.originalTestData);
    console.log('📝 Form test data:', testData);
    console.log('📤 Test definition to update:', testDefinition);

    // Use pathology service to update test definition
    this.subscription.add(
      this.pathologyService.updateTestDefinition(this.editingTestId, testDefinition).subscribe({
        next: (response) => {
          console.log('Test updated successfully:', response);
          this.showAlertMessage('Test updated successfully!', 'success');

          // Notify other components about the test update
          this.pathologyService.notifyTestDefinitionChanged();

          // Navigate to test-detail after alert is shown
          setTimeout(() => {
            // Add nocache marker to ensure fresh detail load
            this.router.navigate(['/setup/pathology/test-detail', this.editingTestId], { queryParams: { _t: Date.now() } });
          }, 2000);
        },
        error: (error) => {
          console.error('❌ Error updating test:', error);
          console.error('❌ Error status:', error.status);
          console.error('❌ Error message:', error.error?.message);
          console.error('❌ Full error object:', JSON.stringify(error, null, 2));
          console.error('❌ Test ID being updated:', this.editingTestId);
          console.error('❌ Test definition sent:', testDefinition);

          let errorMessage = 'Error updating test. Please try again.';

          if (error.status === 400) {
            if (error.error?.message) {
              errorMessage = error.error.message;
            }
          } else if (error.status === 404) {
            errorMessage = 'Test not found. It may have been deleted.';
          } else if (error.status === 500) {
            errorMessage = 'Server error. Please check the console for details.';
          }

          this.showAlertMessage(errorMessage, 'error');
        }
      })
    );
  }

  onCancel(): void {
    this.router.navigate(['/setup/pathology/test-database']);
  }

  markFormGroupTouched(): void {
    Object.keys(this.testEntryForm.controls).forEach(key => {
      this.testEntryForm.get(key)?.markAsTouched();
    });

    this.parametersFormArray.controls.forEach(control => {
      Object.keys((control as FormGroup).controls).forEach(key => {
        control.get(key)?.markAsTouched();
      });
    });
  }

  getFormValidationErrors(): any {
    const formErrors: any = {};
    Object.keys(this.testEntryForm.controls).forEach(key => {
      const controlErrors = this.testEntryForm.get(key)?.errors;
      if (controlErrors) {
        formErrors[key] = controlErrors;
      }
    });
    return formErrors;
  }

  validateFormByTestType(): boolean {
    const formValue = this.testEntryForm.value;

    // Basic required fields for all test types: name, shortName, category, testType (sampleType is optional)
    if (!formValue.name || !formValue.shortName || !formValue.category || !formValue.testType) {
      console.log('❌ Basic required fields missing');
      console.log('Missing fields:', {
        name: !formValue.name,
        shortName: !formValue.shortName,
        category: !formValue.category,
        testType: !formValue.testType
      });
      return false;
    }

    const testType = formValue.testType;
    console.log('Validating for testType:', testType);

    // Single parameter: requires inputType only (unit is optional)
    if (testType === 'single') {
      if (!formValue.inputType) {
        console.log('❌ Input type is required for single parameter test');
        return false;
      }
      console.log('✅ Single parameter validation passed');
      return true;
    }

    // Multiple/Nested parameters: requires parameters array (no unit/inputType in main form)
    if (testType === 'multiple' || testType === 'nested') {
      const parameters = this.parametersFormArray.value;
      if (!parameters || parameters.length === 0) {
        console.log('❌ No parameters added for multiple/nested test');
        return false;
      }

      // Check each parameter has required fields
      for (let i = 0; i < parameters.length; i++) {
        const param = parameters[i];
        if (!param.name || !param.inputType) {
          console.log(`❌ Parameter ${i + 1} name or inputType is missing`);
          return false;
        }
        // For nested type, groupBy is required
        if (testType === 'nested' && !param.groupBy) {
          console.log(`❌ Parameter ${i + 1} groupBy is required for nested test`);
          return false;
        }
      }
      console.log('✅ Multiple/Nested parameter validation passed');
      return true;
    }

    // Document type: only basic fields required (no unit, inputType, or parameters)
    if (testType === 'document') {
      console.log('✅ Document type validation passed');
      return true;
    }

    return true;
  }

  showAlertMessage(message: string, type: 'success' | 'error'): void {
    this.alertMessage = message;
    this.alertType = type;
    this.showAlert = true;
    this.cdr.detectChanges();

    // Auto-hide after 2 seconds for success alerts
    if (type === 'success') {
      setTimeout(() => {
        this.showAlert = false;
        this.cdr.detectChanges();
      }, 2000);
    } else {
      // Keep error alerts visible longer
      setTimeout(() => {
        this.showAlert = false;
        this.cdr.detectChanges();
      }, 4000);
    }
  }

  getInputTypeOptions(): string[] {
    return ['Numeric', 'Single Line', 'Paragraph'];
  }



  getTestTypeDisplay(type: string): string {
    switch (type) {
      case 'single': return 'Single parameter';
      case 'multiple': return 'Multiple parameters';
      case 'nested': return 'Multiple nested parameters';
      case 'document': return 'Document';
      default: return type;
    }
  }

  closeTestTypeModal(): void {
    this.showTestTypeModal = false;
  }

  selectTestType(type: 'single' | 'multiple' | 'nested' | 'document'): void {
    this.onTestTypeChange(type);
    this.closeTestTypeModal();
  }

  // Short name dropdown methods
  onShortNameSearch(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    this.shortNameSearchTerm = searchTerm;

    if (searchTerm.trim() === '') {
      this.filteredTestNames = [...this.allTestNames];
      this.filteredServiceHeads = [...this.allServiceHeads];
    } else {
      this.filteredTestNames = this.allTestNames.filter(testName =>
        testName.toLowerCase().includes(searchTerm)
      );
      this.filteredServiceHeads = this.allServiceHeads.filter(sh =>
        sh.testName.toLowerCase().includes(searchTerm)
      );
    }

    this.showShortNameDropdown = this.filteredServiceHeads.length > 0;
    this.cdr.detectChanges();
  }

  onShortNameBlur(): void {
    // Delay hiding dropdown to allow click events
    setTimeout(() => {
      this.showShortNameDropdown = false;
      this.cdr.detectChanges();
    }, 200);
  }

  selectShortName(testName: string): void {
    this.testEntryForm.patchValue({ shortName: testName });
    this.selectedShortNameObj = this.allServiceHeads.find(sh => sh.testName === testName);
    this.showShortNameDropdown = false;
    this.shortNameSearchTerm = testName;
    console.log('Selected shortName object:', this.selectedShortNameObj);
    this.cdr.detectChanges();
  }

  highlightMatch(text: string, searchTerm: string): string {
    if (!searchTerm || searchTerm.trim() === '') {
      return text;
    }

    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
  }

  // Unit management methods
  openUnitModal(): void {
    this.showUnitModal = true;
    this.newUnitName = '';
    this.cdr.detectChanges();
    // Focus the input immediately on open
    setTimeout(() => {
      const input = document.getElementById('newUnit') as HTMLInputElement;
      if (input) input.focus();
    }, 50);
  }

  closeUnitModal(): void {
    this.showUnitModal = false;
    this.newUnitName = '';
    this.cdr.detectChanges();
  }

  saveNewUnit(): void {
    const raw = (this.newUnitName || '').trim();
    if (!raw) return;

    const unitName = raw; // preserve case as typed

    // Save directly to backend (idempotent bulk with single value)
    this.subscription.add(
      this.pathologyService.createUnitsBulk([unitName]).subscribe({
        next: (res) => {
          // Merge backend units (with ids)
          const returned: Array<{ _id: string; name: string }> = (res?.units || []).map((u: any) => ({ _id: u._id, name: u.name }));
          if (returned.length > 0) {
            const namesLower = new Set(returned.map(u => u.name.toLowerCase()));
            this.availableUnits = this.availableUnits.filter(u => !namesLower.has((u.name || '').toLowerCase()));
            this.availableUnits = [...this.availableUnits, ...returned].sort((a, b) => a.name.localeCompare(b.name));
          } else {
            if (!this.availableUnits.some(u => (u.name || '').toLowerCase() === unitName.toLowerCase())) {
              this.availableUnits.push({ name: unitName });
              this.availableUnits.sort((a, b) => a.name.localeCompare(b.name));
            }
          }
          this.filteredUnits = [...this.availableUnits];
          this.filteredSingleUnits = [...this.availableUnits];

          this.alertService.showSuccess('Unit added', `Unit "${unitName}" saved successfully.`, { autoHideDelay: 1000 });

          this.newUnitName = '';
          this.cdr.detectChanges();
          setTimeout(() => {
            const input = document.getElementById('newUnit') as HTMLInputElement;
            if (input) input.focus();
          }, 50);
        },
        error: () => {
          this.alertService.showError('Error', 'Failed to save unit. Please try again.');
        }
      })
    );
  }

  // Sample Type modal controls
  openSampleTypeModal(): void {
    console.log('[SampleType] openSampleTypeModal click');
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

  saveNewSampleType(): void {
    const raw = (this.newSampleTypeName || '').trim();
    if (!raw) return;

    // Save directly to backend (idempotent bulk with single value)
    this.subscription.add(
      this.pathologyService.createSampleTypesBulk([raw]).subscribe({
        next: (res) => {
          const returned: Array<{ _id: string; name: string }> = (res?.sampleTypes || []).map((s: any) => ({ _id: s._id, name: s.name }));
          if (returned.length > 0) {
            const namesLower = new Set(returned.map(s => s.name.toLowerCase()));
            // merge into options
            this.sampleTypeOptions = this.sampleTypeOptions.filter(s => !namesLower.has((s.name || '').toLowerCase()));
            this.sampleTypeOptions = [...this.sampleTypeOptions, ...returned].sort((a, b) => a.name.localeCompare(b.name));
            this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
            // select all newly returned by default and update display
            this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, ...returned];
            this.testEntryForm.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
            this.sampleTypeSearchTerm = '';
          } else {
            if (!this.sampleTypeOptions.some(s => (s.name || '').toLowerCase() === raw.toLowerCase())) {
              const temp = { _id: '', name: raw };
              this.sampleTypeOptions.push(temp);
              this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
              this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, temp];
              this.testEntryForm.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
              this.sampleTypeSearchTerm = '';
            }
          }
          // Keep modal open for multiple adds; clear and re-focus input
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
      })
    );
  }

  removeUnit(unitName: string): void {
    // Allow removal only if the unit is temporary (not yet saved)
    const idx = this.availableUnits.findIndex(u => ((u as any).name || (u as any)) === unitName && (u as any).temp);
    if (idx > -1) {
      this.availableUnits.splice(idx, 1);
      this.filteredUnits = this.availableUnits.map(u => ({ name: (u as any).name || (u as any), temp: (u as any).temp }));
      this.filteredSingleUnits = [...this.filteredUnits];
      console.log('✅ Removed temp unit:', unitName);
      this.showAlertMessage(`Temporary unit "${unitName}" removed.`, 'success');
    } else {
      // Not removable (already persisted)
      this.showAlertMessage(`Saved unit "${unitName}" cannot be removed here.`, 'error');
    }
  }

  showTestTypeSelection(): void {
    this.selectedTestType = null;
    this.cdr.detectChanges();
  }



  selectParameterUnit(unit: string, parameterIndex: number): void {
    const parametersArray = this.testEntryForm.get('parameters') as FormArray;
    const parameterControl = parametersArray.at(parameterIndex);
    parameterControl.patchValue({ unit: unit });
    this.showParameterUnitDropdown = null;
  }

  hideParameterUnitDropdown(): void {
    setTimeout(() => {
      this.showParameterUnitDropdown = null;
    }, 200);
  }

  getAvailableUnits(): any[] {
    return this.availableUnits;
  }

  // Category dropdown methods
  // Category dropdown methods
  onCategorySearch(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    this.categorySearchTerm = searchTerm;

    if (searchTerm.trim() === '') {
      this.filteredCategories = [...this.allCategories];
    } else {
      this.filteredCategories = this.allCategories.filter(category =>
        category.name.toLowerCase().includes(searchTerm)
      );
    }

    this.showCategoryDropdown = this.filteredCategories.length > 0;
    this.cdr.detectChanges();
  }

  onCategoryBlur(): void {
    // Delay hiding dropdown to allow click events
    setTimeout(() => {
      this.showCategoryDropdown = false;
      this.cdr.detectChanges();
    }, 200);
  }

  selectCategory(categoryName: string): void {
    if (this.categoryLocked) {
      return; // prevent changes when locked
    }
    this.testEntryForm.patchValue({ category: categoryName });
    this.selectedCategoryObj = this.allCategories.find(cat => cat.name === categoryName);
    this.showCategoryDropdown = false;
    this.categorySearchTerm = categoryName;
    console.log('Selected category object:', this.selectedCategoryObj);
    this.cdr.detectChanges();
  }

  // Prevent opening category dropdown when locked
  onCategoryFocus(): void {
    if (this.categoryLocked) {
      this.showCategoryDropdown = false;
      return;
    }
    this.showCategoryDropdown = true;
  }

  filterCategories(event: any): void {
    this.categorySearchTerm = event.target.value;
    if (this.categorySearchTerm.trim() === '') {
      this.filteredCategories = [...this.testCategories];
    } else {
      this.filteredCategories = this.testCategories.filter(category =>
        category.name.toLowerCase().includes(this.categorySearchTerm.toLowerCase())
      );
    }
  }

  hideCategoryDropdown(): void {
    setTimeout(() => {
      this.showCategoryDropdown = false;
    }, 200);
  }

  // Sample type dropdown methods (object-based)
  onSampleTypeSearch(event: any): void {
    const searchTerm = (event?.target?.value || '').toLowerCase();
    this.sampleTypeSearchTerm = searchTerm;

    const source = this.sampleTypeOptions || [];
    if (!searchTerm.trim()) {
      this.filteredSampleTypeOptions = [...source];
    } else {
      this.filteredSampleTypeOptions = source.filter(st => (st.name || '').toLowerCase().includes(searchTerm));
    }

    // Always show dropdown container when field focused; list can be empty
    this.showSampleTypeDropdown = true;
    this.cdr.detectChanges();
  }

  onSampleTypeBlur(): void {
    // Delay hiding dropdown to allow click events; keep open if interacting with checkboxes
    setTimeout(() => {
      if (!(this.interactingWithSampleType || this.mouseInSampleDropdown)) {
        this.showSampleTypeDropdown = false;
      }
      this.interactingWithSampleType = false;
      this.cdr.detectChanges();
    }, 120);
  }

  // Global click: close Sample Type dropdown when clicking outside the container
  @HostListener('document:click', ['$event'])
  onDocClick(event: MouseEvent): void {
    if (!this.sampleTypeContainer) return;
    const target = event.target as HTMLElement;
    if (this.sampleTypeContainer && !this.sampleTypeContainer.nativeElement.contains(target)) {
      this.showSampleTypeDropdown = false;
      this.cdr.detectChanges();
    }
  }


  // Deprecated single-select; replaced by checkbox-based multi-select
  selectSampleType(st: { _id: string; name: string } | string): void {
    if (!st) return;
    const obj = typeof st === 'string' ? (this.sampleTypeOptions.find(x => x.name === st) || { _id: '', name: st }) : st;
    // Toggle selection
    const exists = this.selectedSampleTypeObjs.find(s => s._id === obj._id || s.name === obj.name);
    if (exists) {
      this.selectedSampleTypeObjs = this.selectedSampleTypeObjs.filter(s => s._id !== obj._id && s.name !== obj.name);
    } else {
      this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, obj];
    }
    this.testEntryForm.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
    this.cdr.detectChanges();
  }

  isSampleTypeSelected(id: string): boolean {
    return this.selectedSampleTypeObjs.some(s => s._id === id);
  }

  onSampleTypeCheckboxChange(st: { _id: string; name: string }, event: any): void {
    if (event?.target?.checked) {
      if (!this.isSampleTypeSelected(st._id)) {
        this.selectedSampleTypeObjs = [...this.selectedSampleTypeObjs, st];
      }
    } else {
      this.selectedSampleTypeObjs = this.selectedSampleTypeObjs.filter(s => s._id !== st._id);
    }
    this.testEntryForm.patchValue({ sampleType: this.selectedSampleTypeObjs.map(s => s.name).join(', ') });
  }



  initializeSampleTypes(): void {
    // Deprecated: kept for backward compatibility; replaced by loadSampleTypesFromBackend
    this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
    this.filteredUnits = this.availableUnits.map(u => ({ name: (u as any).name || (u as any), temp: (u as any).temp || false }));
    this.filteredSingleUnits = [...this.filteredUnits];
  }

  // Load sample types from backend Units collection (kind: 'SAMPLE')
  loadSampleTypesFromBackend(): void {
    this.subscription.add(
      this.pathologyService.getSampleTypes().subscribe({
        next: (samples) => {
          this.sampleTypeOptions = (samples || []);
          this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
          this.cdr.detectChanges();
        },
        error: () => {
          // Fallback to a minimal default list if backend fails
          this.sampleTypeOptions = [
            { _id: '', name: 'Blood' },
            { _id: '', name: 'Urine' },
            { _id: '', name: 'Serum' }
          ];
          this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
          this.cdr.detectChanges();
        }
      })
    );
  }


  loadUnitsFromStorage(): void {
    const savedUnits = localStorage.getItem('pathologyUnits');
    if (savedUnits) {
      try {
        const parsedUnits = JSON.parse(savedUnits);
        if (Array.isArray(parsedUnits)) {
          const parsedNames = parsedUnits
            .map((u: any) => (typeof u === 'string' ? u : u.name))
            .filter((v: any) => !!v)
            .map((v: string) => v);
          const baseNames = this.availableUnits.map(u => (u as any).name || (u as any));
          const mergedNames = Array.from(new Set([...baseNames, ...parsedNames])).sort((a,b)=>a.localeCompare(b));
          this.availableUnits = mergedNames.map(n => ({ name: n }));
          this.filteredUnits = mergedNames.map(n => ({ name: n }));
          this.filteredSingleUnits = [...this.filteredUnits];
        }
      } catch (error) {
        console.error('Error loading units from storage:', error);
      }
    }
  }

  private loadUnitsFromBackend(): void {
    this.subscription.add(
      this.pathologyService.getUnits().subscribe({
        next: (units) => {
          const list = (units || []).map((u: any) => ({ _id: u._id, name: u.name }))
            .sort((a, b) => a.name.localeCompare(b.name));
          this.availableUnits = list;
          this.filteredUnits = [...list];
          this.filteredSingleUnits = [...list];
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error loading units from backend:', err);
          // Fallback to local storage
          this.loadUnitsFromStorage();
        }
      })
    );
  }

  filterSampleTypes(event: any): void {
    this.sampleTypeSearchTerm = event.target.value || '';
    const s = this.sampleTypeSearchTerm.trim().toLowerCase();
    if (!s) {
      this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
    } else {
      this.filteredSampleTypeOptions = this.sampleTypeOptions.filter(st => (st.name || '').toLowerCase().includes(s));
    }
  }

  hideSampleTypeDropdown(): void {
    setTimeout(() => {
      this.showSampleTypeDropdown = false;
    }, 200);
  }

  // Parameter sample type methods removed - no longer needed

  // Unit dropdown methods
  onUnitSearch(event: any, paramIndex: number): void {
    const searchTerm = (event.target.value || '').toLowerCase();
    this.unitSearchTerm = searchTerm;

    if (searchTerm.trim() === '') {
      this.filteredUnits = [...this.availableUnits];
    } else {
      this.filteredUnits = this.availableUnits.filter(u => (u.name || '').toLowerCase().includes(searchTerm));
    }

    this.showUnitDropdown[paramIndex] = true;
    this.cdr.detectChanges();
  }

  // Persist temp units to backend
  private persistTemporaryUnits(): void {
    const tempNames = this.availableUnits
      .filter(u => (u as any).temp)
      .map(u => (u as any).name);
    if (tempNames.length === 0) return;

    this.subscription.add(
      this.pathologyService.createUnitsBulk(tempNames).subscribe({
        next: () => {
          // Clear temp flags
          this.availableUnits = this.availableUnits.map(u => ({ name: (u as any).name || (u as any), temp: false }));
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error persisting temporary units:', err)
      })
    );
  }

  onUnitBlur(paramIndex: number): void {
    // Hide dropdown after a short delay to allow for selection
    setTimeout(() => {
      this.showUnitDropdown[paramIndex] = false;
      this.cdr.detectChanges();
    }, 200);
  }

  selectUnit(unit: any, paramIndex: number): void {
    const parameterControl = this.parametersFormArray.at(paramIndex);
    const sel = typeof unit === 'string' ? this.availableUnits.find(u => u.name === unit) : unit;
    if (!sel) return;
    // Show unit name in the input but backend will map name->ObjectId on save
    parameterControl.patchValue({ unit: sel.name });
    this.showUnitDropdown[paramIndex] = false;
    this.unitSearchTerm = sel.name;
    this.unitDropdownOpen = false;
    this.activeUnitDropdown = -1;
    this.cdr.detectChanges();
  }

  filterUnits(event?: any): void {
    if (event) this.unitSearchTerm = event.target.value || '';
    const s = this.unitSearchTerm.trim().toLowerCase();
    if (!s) {
      this.filteredUnits = [...this.availableUnits];
    } else {
      this.filteredUnits = this.availableUnits.filter(u => (u.name || '').toLowerCase().includes(s));
    }
  }

  hideUnitDropdown(): void {
    setTimeout(() => {
      // Reset all unit dropdowns
      this.showUnitDropdown = {};
    }, 200);
  }

  // Handle category selection
  onCategoryChange(event: any): void {
    const categoryName = event.target.value;
    this.selectedCategoryObj = this.testCategories.find(cat => cat.name === categoryName);
    console.log('Selected category object:', this.selectedCategoryObj);
  }



  // Unit dropdown methods
  toggleUnitDropdown(index: number): void {
    if (this.activeUnitDropdown === index && this.unitDropdownOpen) {
      this.unitDropdownOpen = false;
      this.activeUnitDropdown = -1;
    } else {
      this.unitDropdownOpen = true;
      this.activeUnitDropdown = index;
      this.unitSearchTerm = '';
      this.filterUnits();
    }
  }

  getSelectedUnitText(value: string): string {
    return value || '';
  }

  // Single parameter dropdown methods
  toggleSingleUnitDropdown(): void {
    this.singleUnitDropdownOpen = !this.singleUnitDropdownOpen;
    if (this.singleUnitDropdownOpen) {
      this.singleUnitSearchTerm = '';
      this.filterSingleUnits();
    }
  }

  filterSingleUnits(): void {
    if (!this.singleUnitSearchTerm) {
      this.filteredSingleUnits = [...this.availableUnits];
    } else {
      this.filteredSingleUnits = this.availableUnits.filter(u =>
        (u.name || '').toLowerCase().includes(this.singleUnitSearchTerm.toLowerCase())
      );
    }
  }

  selectSingleUnit(unit: any): void {
    const sel = typeof unit === 'string' ? this.availableUnits.find(u => u.name === unit) : unit;
    if (!sel) return;
    // Show unit name in the input; backend maps to ObjectId during save
    this.testEntryForm.get('unit')?.setValue(sel.name);
    this.showSingleUnitDropdown = false;
    this.singleUnitDropdownOpen = false;
    this.singleUnitSearchTerm = sel.name;
    this.cdr.detectChanges();
  }

  // New methods for Sample Type style Unit dropdown
  onSingleUnitSearch(event: any): void {
    const searchTerm = event.target.value.toLowerCase();
    this.singleUnitSearchTerm = searchTerm;

    if (searchTerm.trim() === '') {
      this.filteredSingleUnits = [...this.availableUnits];
    } else {
      this.filteredSingleUnits = this.availableUnits.filter(unit =>
        (unit.name || '').toLowerCase().includes(searchTerm)
      );
    }

    this.showSingleUnitDropdown = this.filteredSingleUnits.length > 0;
    this.cdr.detectChanges();
  }

  onSingleUnitBlur(): void {
    setTimeout(() => {
      this.showSingleUnitDropdown = false;
      this.cdr.detectChanges();
    }, 200);
  }



  toggleInputTypeDropdown(): void {
    this.inputTypeDropdownOpen = !this.inputTypeDropdownOpen;
    if (this.inputTypeDropdownOpen) {
      this.inputTypeSearchTerm = '';
      this.filterInputTypes();
    }
  }

  // Sample Type deletion flow (same rules as Unit)
  promptDeleteSampleType(st: any): void {
    if (!st) return;
    if (st._id) {
      this.pathologyService.checkSampleTypeUsage(st._id).subscribe({
        next: (res) => {
          const blocked = !!res?.blocked;
          if (blocked) {
            this.deleteBlockedTitle = 'Cannot Delete Sample Type';
            this.deleteBlockedMessage = 'This sample type is used by one or more test definitions and cannot be deleted.';
            this.showDeleteBlocked = true;
            this.unitPendingDelete = st;
            this.cdr.detectChanges();
          } else {
            this.deleteTitle = 'Delete Sample Type';
            this.deleteMessage = `Are you sure you want to delete sample type "${st.name}"?`;
            this.deleteSuccessTitle = 'Sample Type Deleted';
            this.unitPendingDelete = st;
            this.pendingDeleteKind = 'SAMPLE';
            this.showDeleteConfirmation = true;
            this.cdr.detectChanges();
          }
        },
        error: () => {
          this.deleteTitle = 'Delete Sample Type';
          this.deleteMessage = `Are you sure you want to delete sample type "${st.name}"?`;
          this.deleteSuccessTitle = 'Sample Type Deleted';
          this.unitPendingDelete = st;
          this.pendingDeleteKind = 'SAMPLE';
          this.showDeleteConfirmation = true;
          this.cdr.detectChanges();
        }
      });
    } else {
      this.deleteTitle = 'Delete Sample Type';
      this.deleteMessage = `Are you sure you want to delete sample type "${st.name}"?`;
      this.deleteSuccessTitle = 'Sample Type Deleted';
      this.unitPendingDelete = st;
      this.pendingDeleteKind = 'SAMPLE';
      this.showDeleteConfirmation = true;
      this.cdr.detectChanges();
    }
  }

  filterInputTypes(): void {
    if (!this.inputTypeSearchTerm) {
      this.filteredInputTypes = [...this.getInputTypeOptions()];
    } else {
      this.filteredInputTypes = this.getInputTypeOptions().filter(type =>
        type.toLowerCase().includes(this.inputTypeSearchTerm.toLowerCase())
      );
    }
  }

  selectInputType(type: string): void {
    this.testEntryForm.get('inputType')?.setValue(type);
    this.inputTypeDropdownOpen = false;
  }

  // Unit deletion flow
  promptDeleteUnit(unit: any, source?: string): void {
    console.log('%c[promptDeleteUnit] called', 'color:#ef4444', { unit, source, showOptionModal: this.showOptionModal, suppress: this.suppressUnitDeleteClick });
    if (this.suppressUnitDeleteClick) {
      console.log('[promptDeleteUnit] SUPPRESSED due to recent Add Options click');
      return;
    }
    // If there is an id, check usage first; if blocked, show blocked modal immediately
    if (unit && unit._id) {
      this.pathologyService.checkUnitUsage(unit._id).subscribe({
        next: (res) => {
          const blocked = !!res?.blocked;
          if (blocked) {
            console.log('[promptDeleteUnit] usage shows BLOCKED, opening blocked modal');
            this.showDeleteBlocked = true;
            this.unitPendingDelete = unit;
            this.cdr.detectChanges();
          } else {
            this.unitPendingDelete = unit;
            this.deleteMessage = `Are you sure you want to delete unit "${unit.name}"?`;
            this.showDeleteConfirmation = true;
            console.log('[promptDeleteUnit] -> showDeleteConfirmation:', this.showDeleteConfirmation);
            this.cdr.detectChanges();
          }
        },
        error: (err) => {
          console.log('[promptDeleteUnit] usage check error (fallback to confirmation)', err);
          this.unitPendingDelete = unit;
          this.deleteMessage = `Are you sure you want to delete unit "${unit.name}"?`;
          this.showDeleteConfirmation = true;
          this.cdr.detectChanges();
        }
      });
    } else {
      // Temporary unit (no id) — show confirmation as usual
      this.unitPendingDelete = unit;
      this.deleteMessage = `Are you sure you want to delete unit "${unit.name}"?`;
      this.showDeleteConfirmation = true;
      console.log('[promptDeleteUnit] -> showDeleteConfirmation:', this.showDeleteConfirmation);
      this.cdr.detectChanges();
    }
  }

  cancelDeleteUnit(): void {
    this.showDeleteConfirmation = false;
    this.unitPendingDelete = null;
    this.cdr.detectChanges();
  }

  confirmDeleteUnit(): void {
    console.log('%c[confirmDeleteUnit] start', 'color:#2563eb', {
      showDeleteConfirmation: this.showDeleteConfirmation,
      unitPendingDelete: this.unitPendingDelete
    });

    if (!this.unitPendingDelete || !this.unitPendingDelete._id) {
      const name = this.unitPendingDelete?.name;
      console.log('[confirmDeleteUnit] deleting TEMP unit by name:', name);
      this.availableUnits = this.availableUnits.filter(u => u.name !== name);
      this.filteredUnits = [...this.availableUnits];
      this.filteredSingleUnits = [...this.availableUnits];
      this.showDeleteConfirmation = false;
      this.showDeleteSuccess = true;
      this.unitPendingDelete = null;
      console.log('[confirmDeleteUnit] after local delete', {
        availableUnits: this.availableUnits,
        filteredUnits: this.filteredUnits,
        filteredSingleUnits: this.filteredSingleUnits,
        showDeleteConfirmation: this.showDeleteConfirmation,
        showDeleteSuccess: this.showDeleteSuccess
      });
      this.cdr.detectChanges();
      return;
    }

    const id = this.unitPendingDelete._id;
    console.log('[confirmDeleteUnit] deleting PERSISTED unit id:', id);
    const delete$ = this.pendingDeleteKind === 'SAMPLE'
      ? this.pathologyService.deleteSampleType(id)
      : this.pathologyService.deleteUnit(id);

    this.subscription.add(
      delete$.subscribe({
        next: () => {
          if (this.pendingDeleteKind === 'SAMPLE') {
            // Remove from sample type lists
            this.sampleTypeOptions = this.sampleTypeOptions.filter(s => s._id !== id);
            this.filteredSampleTypeOptions = [...this.sampleTypeOptions];
          } else {
            // Remove from unit lists
            this.availableUnits = this.availableUnits.filter(u => u._id !== id);
            this.filteredUnits = [...this.availableUnits];
            this.filteredSingleUnits = [...this.availableUnits];
          }
          this.showDeleteConfirmation = false;
          this.showDeleteSuccess = true;
          this.unitPendingDelete = null;
          this.cdr.detectChanges();
        },
        error: (err) => {
          if (err?.status === 409) {
            this.showDeleteConfirmation = false;
            this.deleteBlockedMessage = this.pendingDeleteKind === 'SAMPLE'
              ? 'This sample type is used by one or more test definitions and cannot be deleted.'
              : 'This unit is used by one or more test definitions and cannot be deleted.';
            this.showDeleteBlocked = true;
          } else {
            this.alertService.showError('Error', this.pendingDeleteKind === 'SAMPLE' ? 'Failed to delete sample type.' : 'Failed to delete unit.');
          }
          this.cdr.detectChanges();
        }
      })
    );
  }

  onDeleteUnitSuccessClosed(): void {
    this.showDeleteSuccess = false;
  }

  closeDeleteBlocked(): void {
    this.showDeleteBlocked = false;
  }

  // Handle shortName selection
  onShortNameChange(event: any): void {
    const shortNameValue = event.target.value;
    this.selectedShortNameObj = this.allServiceHeads.find(sh => sh.testName === shortNameValue);
    console.log('Selected shortName object:', this.selectedShortNameObj);
  }

}
