import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';

import { environment } from '../../../../environments/environment';

// Test Category Interface
export interface TestCategory {
  _id?: string;
  categoryId?: string;
  name: string;
  description?: string;
  // isActive removed from DB; keep optional for backward compatibility
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Test Parameter Interface
export interface TestParameter {
  _id?: string;
  parameterId?: string;
  name: string;
  categoryId: string;
  category?: TestCategory;
  unit: string;
  normalRanges: {
    male?: {
      min?: number;
      max?: number;
      textValue?: string;
    };
    female?: {
      min?: number;
      max?: number;
      textValue?: string;
    };
    child?: {
      min?: number;
      max?: number;
      textValue?: string;
    };
  };
  testMethod?: string;
  sampleType?: string; // Blood, Urine, Stool, etc.
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Test Definition Interface
export interface TestDefinition {
  _id?: string;
  testId?: string;
  name: string;
  shortName: string | { testName: string; price: string; _id: string };
  category: string | { name: string; categoryId: string; _id: string };
  testType: 'single' | 'multiple' | 'nested' | 'document' | 'panel';
  // Fields for single parameter tests
  sampleType?: string | string[]; // now supports multi-select
  unit?: string;
  inputType?: 'Numeric' | 'Single Line' | 'Paragraph';
  method?: string;
  instrument?: string;
  // Single parameter default-result system at root
  resultType?: 'manual' | 'dropdown' | 'fixed' | 'formula';
  dropdownOptions?: string; // CSV stored in DB
  defaultResult?: string;
  formula?: string;

  isOptional?: boolean;
  normalValues?: NormalValue[]; // For single parameter tests
  parameters: TestParameterDefinition[];
  // For Test Panels: list of included test IDs
  tests?: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TestParameterDefinition {
  order: number;
  name: string;
  sampleType?: string;
  unit?: string;
  inputType: 'Numeric' | 'Single Line' | 'Paragraph';
  defaultResult?: string;
  formula?: string;

  resultType?: 'manual' | 'dropdown' | 'fixed' | 'formula';
  dropdownOptions?: string; // comma-separated list stored in DB
  isOptional: boolean;
  removed?: boolean;
  groupBy?: string;
  normalValues?: NormalValue[];
}

export interface NormalValue {
  _id?: string;
  type: 'Numeric range' | 'Text';
  gender?: string; // Changed from sex to gender
  minAge?: string; // Changed to string to store "14 Years" format
  maxAge?: string; // Changed to string to store "100 Years" format
  ageUnit?: string;
  lowerValue?: string;
  upperValue?: string;
  textValue?: string;
  displayInReport?: string;
  remark?: string;
}



export interface TestParameterDefinition {
  order: number;
  name: string;
  sampleType?: string;
  unit?: string;
  inputType: 'Numeric' | 'Single Line' | 'Paragraph';
  defaultResult?: string;
  formula?: string;

  isOptional: boolean;
  groupBy?: string; // For nested parameters
}

// Test Template Interface
export interface TestTemplate {
  _id?: string;
  templateId?: string;
  name: string;
  category: string;
  description: string;
  headerText: string;
  footerText: string;
  reportFormat: 'standard' | 'tabular' | 'narrative';
  includeReferenceRanges: boolean;
  includeInterpretation: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Patient Test Entry Interface
export interface PatientTestEntry {
  _id?: string;
  entryId?: string;
  patientId: string;
  patientName: string;
  doctorId?: string;
  doctorName?: string;
  testDate: Date;
  sampleCollectionDate?: Date;
  reportDate?: Date;
  tests: {
    categoryId: string;
    categoryName: string;
    parameters: {
      parameterId: string;
      parameterName: string;
      value: string | number;
      unit: string;
      normalRange: string;
      isAbnormal: boolean;
      remarks?: string;
    }[];
  }[];
  overallRemarks?: string;
  reportStatus: 'Pending' | 'In Progress' | 'Completed' | 'Verified';
  verifiedBy?: string;
  verifiedDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// Report Template Interface
export interface ReportTemplate {
  _id?: string;
  templateId?: string;
  name: string;
  categoryId: string;
  category?: TestCategory;
  headerTemplate: string;
  footerTemplate: string;
  parameterLayout: 'table' | 'list' | 'grouped';
  includeNormalRanges: boolean;
  includeRemarks: boolean;
  logoPosition: 'left' | 'center' | 'right';
  isDefault: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Reference Range Interface
export interface TestReferenceRange {
  _id?: string;
  rangeId?: string;
  testParameterId: string;
  testParameterName: string;
  rangeType: 'Numeric range' | 'Text value' | 'Positive/Negative' | 'Present/Absent';
  gender: 'Any' | 'Male' | 'Female';
  minAge: number;
  maxAge: number;
  ageUnit: 'Years' | 'Months' | 'Days';
  lowerValue?: number;
  upperValue?: number;
  textValue?: string;
  displayText: string;
  unit: string;
  notes?: string;
  priority: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Injectable({
  providedIn: 'root'
})
export class PathologyService {
  private apiUrl = environment.apiUrl;

  // BehaviorSubjects for real-time updates
  private testCategoriesSubject = new BehaviorSubject<TestCategory[]>([]);
  private testParametersSubject = new BehaviorSubject<TestParameter[]>([]);
  private patientTestsSubject = new BehaviorSubject<PatientTestEntry[]>([]);
  private testDeletedSubject = new Subject<void>();
  private testDefinitionChangedSubject = new Subject<void>();

  public testCategories$ = this.testCategoriesSubject.asObservable();
  public testParameters$ = this.testParametersSubject.asObservable();
  public patientTests$ = this.patientTestsSubject.asObservable();
  public testDeleted$ = this.testDeletedSubject.asObservable();
  public testDefinitionChanged$ = this.testDefinitionChangedSubject.asObservable();

  constructor(private http: HttpClient) { }

  // ================= Units API =================
  getUnits(): Observable<{ _id: string; name: string }[]> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/units`)
      .pipe(map(res => (res.units || []).map((u: any) => ({ _id: u._id, name: u.name }))));
  }

  createUnitsBulk(names: string[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/pathology-master/units/bulk`, { names });
  }

  deleteUnit(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/pathology-master/units/${id}`);
  }

  // Check if a unit is used by any TestDefinition (single or parameter units)
  checkUnitUsage(unitId: string): Observable<{ success: boolean; blocked: boolean; inSingle: number; inParams: number; count: number }> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/units/${unitId}/usage`);
  }


  // Sample Types (share collection, kind: 'SAMPLE')
  getSampleTypes(): Observable<Array<{ _id: string; name: string }>> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/sample-types`)
      .pipe(map(res => (res.sampleTypes || []).map((s: any) => ({ _id: s._id, name: s.name }))));
  }

  createSampleTypesBulk(names: string[]): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/pathology-master/sample-types/bulk`, { names });
  }

  // Sample Type usage/delete (mirror unit rules)
  checkSampleTypeUsage(id: string): Observable<{
    message: string; success: boolean; blocked: boolean; count: number
}> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/sample-types/${id}/usage`);
  }

  deleteSampleType(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/pathology-master/sample-types/${id}`);
  }


  // Test Categories CRUD
  getTestCategories(nocache: boolean = false): Observable<TestCategory[]> {
    const ts = nocache ? `?_=${Date.now()}` : '';
    return this.http.get<any>(`${this.apiUrl}/pathology-master/categories${ts}`)
      .pipe(
        map(response => response.categories || []),
        tap(categories => this.testCategoriesSubject.next(categories)),
        catchError(this.handleError<TestCategory[]>('getTestCategories', []))
      );
  }

  createTestCategory(category: TestCategory): Observable<TestCategory> {
    return this.http.post<any>(`${this.apiUrl}/pathology-master/categories`, category)
      .pipe(
        tap(() => this.refreshTestCategories()),
        catchError(this.handleError<TestCategory>('createTestCategory'))
      );
  }

  updateTestCategory(id: string, category: TestCategory): Observable<TestCategory> {
    return this.http.put<any>(`${this.apiUrl}/pathology-master/categories/${id}`, category)
      .pipe(
        tap(() => this.refreshTestCategories()),
        catchError(this.handleError<TestCategory>('updateTestCategory'))
      );
  }

  deleteTestCategory(id: string): Observable<any> {
    const token = localStorage.getItem('token');
    const headers = token ? { headers: new HttpHeaders({ 'Authorization': `Bearer ${token}` }) } : {};
    // Do not swallow errors here; let subscribers handle them
    return this.http.delete(`${this.apiUrl}/pathology-master/categories/${id}`, headers)
      .pipe(
        tap(() => this.refreshTestCategories())
      );
  }

  // Check if test category is being used by test definitions
  checkTestCategoryUsage(categoryId: string): Observable<{ hasTests: boolean; testCount: number; tests: TestDefinition[] }> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/categories/${categoryId}/usage`)
      .pipe(
        catchError(this.handleError('checkTestCategoryUsage', { hasTests: false, testCount: 0, tests: [] }))
      );
  }

  // Test Parameters CRUD
  getTestParameters(): Observable<TestParameter[]> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/parameters`)
      .pipe(
        tap(response => this.testParametersSubject.next(response.parameters || [])),
        catchError(this.handleError<TestParameter[]>('getTestParameters', []))
      );
  }

  getTestParametersByCategory(categoryId: string): Observable<TestParameter[]> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/parameters/category/${categoryId}`)
      .pipe(
        catchError(this.handleError<TestParameter[]>('getTestParametersByCategory', []))
      );
  }

  createTestParameter(parameter: TestParameter): Observable<TestParameter> {
    return this.http.post<any>(`${this.apiUrl}/pathology-master/parameters`, parameter)
      .pipe(
        tap(() => this.refreshTestParameters()),
        catchError(this.handleError<TestParameter>('createTestParameter'))
      );
  }

  updateTestParameter(id: string, parameter: TestParameter): Observable<TestParameter> {
    return this.http.put<any>(`${this.apiUrl}/pathology-master/parameters/${id}`, parameter)
      .pipe(
        tap(() => this.refreshTestParameters()),
        catchError(this.handleError<TestParameter>('updateTestParameter'))
      );
  }

  deleteTestParameter(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/pathology-master/parameters/${id}`)
      .pipe(
        tap(() => this.refreshTestParameters()),
        catchError(this.handleError('deleteTestParameter'))
      );
  }

  // Patient Test Entries CRUD
  getPatientTestEntries(): Observable<PatientTestEntry[]> {
    return this.http.get<PatientTestEntry[]>(`${this.apiUrl}/pathology/patient-tests`)
      .pipe(
        tap(tests => this.patientTestsSubject.next(tests)),
        catchError(this.handleError<PatientTestEntry[]>('getPatientTestEntries', []))
      );
  }

  createPatientTestEntry(testEntry: PatientTestEntry): Observable<PatientTestEntry> {
    return this.http.post<PatientTestEntry>(`${this.apiUrl}/pathology/patient-tests`, testEntry)
      .pipe(
        tap(() => this.refreshPatientTests()),
        catchError(this.handleError<PatientTestEntry>('createPatientTestEntry'))
      );
  }

  updatePatientTestEntry(id: string, testEntry: PatientTestEntry): Observable<PatientTestEntry> {
    return this.http.put<PatientTestEntry>(`${this.apiUrl}/pathology/patient-tests/${id}`, testEntry)
      .pipe(
        tap(() => this.refreshPatientTests()),
        catchError(this.handleError<PatientTestEntry>('updatePatientTestEntry'))
      );
  }

  // Report Generation
  generateReport(testEntryId: string, templateId?: string): Observable<any> {
    const payload = { testEntryId, templateId };
    return this.http.post(`${this.apiUrl}/pathology/generate-report`, payload)
      .pipe(
        catchError(this.handleError('generateReport'))
      );
  }

  // Reference Ranges CRUD
  getReferenceRanges(testParameterId: string): Observable<TestReferenceRange[]> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/reference-ranges/${testParameterId}`)
      .pipe(
        catchError(this.handleError<TestReferenceRange[]>('getReferenceRanges', []))
      );
  }

  createReferenceRange(range: TestReferenceRange): Observable<TestReferenceRange> {
    return this.http.post<any>(`${this.apiUrl}/pathology-master/reference-ranges`, range)
      .pipe(
        catchError(this.handleError<TestReferenceRange>('createReferenceRange'))
      );
  }

  updateReferenceRange(id: string, range: TestReferenceRange): Observable<TestReferenceRange> {
    return this.http.put<any>(`${this.apiUrl}/pathology-master/reference-ranges/${id}`, range)
      .pipe(
        catchError(this.handleError<TestReferenceRange>('updateReferenceRange'))
      );
  }

  deleteReferenceRange(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/pathology-master/reference-ranges/${id}`)
      .pipe(
        catchError(this.handleError('deleteReferenceRange'))
      );
  }

  findReferenceRangeForPatient(testParameterId: string, patientAge: number, patientGender: string, ageUnit: string = 'Years'): Observable<TestReferenceRange> {
    const payload = { testParameterId, patientAge, patientGender, ageUnit };
    return this.http.post<any>(`${this.apiUrl}/pathology-master/reference-ranges/find-for-patient`, payload)
      .pipe(
        catchError(this.handleError<TestReferenceRange>('findReferenceRangeForPatient'))
      );
  }



  // Test Template Methods
  getTestTemplates(): Observable<TestTemplate[]> {
    return this.http.get<any>(`${this.apiUrl}/pathology-master/test-templates`)
      .pipe(
        catchError(this.handleError<TestTemplate[]>('getTestTemplates', []))
      );
  }

  createTestTemplate(template: TestTemplate): Observable<TestTemplate> {
    return this.http.post<any>(`${this.apiUrl}/pathology-master/test-templates`, template)
      .pipe(
        catchError(this.handleError<TestTemplate>('createTestTemplate'))
      );
  }

  updateTestTemplate(id: string, template: TestTemplate): Observable<TestTemplate> {
    return this.http.put<any>(`${this.apiUrl}/pathology-master/test-templates/${id}`, template)
      .pipe(
        catchError(this.handleError<TestTemplate>('updateTestTemplate'))
      );
  }

  deleteTestTemplate(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/pathology-master/test-templates/${id}`)
      .pipe(
        catchError(this.handleError<any>('deleteTestTemplate'))
      );
  }

  // Test Definitions CRUD
  getTestDefinitions(nocache: boolean = false): Observable<TestDefinition[]> {
    const ts = nocache ? `?_=${Date.now()}` : '';
    return this.http.get<any>(`${this.apiUrl}/pathology-master/test-definitions${ts}`)
      .pipe(
        map(response => response.testDefinitions || []),
        catchError(this.handleError<TestDefinition[]>('getTestDefinitions', []))
      );
  }

  getTestDefinitionById(id: string, nocache: boolean = false): Observable<TestDefinition> {
    const ts = nocache ? `?_=${Date.now()}` : '';
    return this.http.get<any>(`${this.apiUrl}/pathology-master/test-definitions/${id}${ts}`)
      .pipe(
        map(response => response.testDefinition || response),
        catchError(this.handleError<TestDefinition>('getTestDefinitionById'))
      );
  }

  createTestDefinition(testDefinition: TestDefinition): Observable<TestDefinition> {
    return this.http.post<TestDefinition>(`${this.apiUrl}/pathology-master/test-definitions`, testDefinition)
      .pipe(
        tap(() => this.notifyTestDefinitionChanged()),
        catchError(this.handleError<TestDefinition>('createTestDefinition'))
      );
  }

  updateTestDefinition(id: string, testDefinition: TestDefinition | Partial<TestDefinition>): Observable<TestDefinition> {
    return this.http.put<any>(`${this.apiUrl}/pathology-master/test-definitions/${id}`, testDefinition)
      .pipe(
        map(response => response.testDefinition || response),
        tap(() => this.notifyTestDefinitionChanged()),
        catchError(this.handleError<TestDefinition>('updateTestDefinition'))
      );
  }

  deleteTestDefinition(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/pathology-master/test-definitions/${id}`)
      .pipe(
        catchError(this.handleError<any>('deleteTestDefinition'))
      );
  }

  // Notify other components when a test is deleted
  notifyTestDeleted(): void {
    this.testDeletedSubject.next();
  }

  // Notify other components when a test definition is created or updated
  notifyTestDefinitionChanged(): void {
    this.testDefinitionChangedSubject.next();
  }

  // Report Templates CRUD
  getReportTemplates(): Observable<ReportTemplate[]> {
    return this.http.get<ReportTemplate[]>(`${this.apiUrl}/pathology/templates`)
      .pipe(
        catchError(this.handleError<ReportTemplate[]>('getReportTemplates', []))
      );
  }

  createReportTemplate(template: ReportTemplate): Observable<ReportTemplate> {
    return this.http.post<ReportTemplate>(`${this.apiUrl}/pathology/templates`, template)
      .pipe(
        catchError(this.handleError<ReportTemplate>('createReportTemplate'))
      );
  }

  // Utility methods
  private refreshTestCategories(): void {
    // Force fresh fetch to bypass any HTTP cache/interceptor
    this.getTestCategories(true).subscribe();
  }

  private refreshTestParameters(): void {
    this.getTestParameters().subscribe();
  }

  private refreshPatientTests(): void {
    this.getPatientTestEntries().subscribe();
  }

  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.error(`${operation} failed:`, error);
      return new Observable<T>(observer => {
        if (result !== undefined) {
          observer.next(result as T);
        }
        observer.complete();
      });
    };
  }
}
