import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { PathologyDetailFormComponent } from './pathology-detail-form.component';
import { PathologyService } from '../pathology.service';

describe('PathologyDetailFormComponent', () => {
  let component: PathologyDetailFormComponent;
  let fixture: ComponentFixture<PathologyDetailFormComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PathologyDetailFormComponent],
      imports: [
        ReactiveFormsModule,
        RouterTestingModule,
        HttpClientTestingModule
      ],
      providers: [PathologyService]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PathologyDetailFormComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize form with default values', () => {
    expect(component.pathologyForm).toBeDefined();
    expect(component.pathologyForm.get('status')?.value).toBe('Pending');
    expect(component.pathologyForm.get('priority')?.value).toBe('Normal');
    expect(component.pathologyForm.get('isPaid')?.value).toBe(false);
  });

  it('should load patients and doctors on init', () => {
    expect(component.patients.length).toBeGreaterThan(0);
    expect(component.doctors.length).toBeGreaterThan(0);
  });

  it('should validate required fields', () => {
    const form = component.pathologyForm;
    
    // Test required fields
    expect(form.get('collectionDate')?.hasError('required')).toBeFalsy(); // Has default value
    expect(form.get('patient')?.hasError('required')).toBeTruthy();
    expect(form.get('doctor')?.hasError('required')).toBeTruthy();
    expect(form.get('testType')?.hasError('required')).toBeTruthy();
    expect(form.get('testName')?.hasError('required')).toBeTruthy();
    expect(form.get('testCategory')?.hasError('required')).toBeTruthy();
    expect(form.get('sampleType')?.hasError('required')).toBeTruthy();
  });

  it('should add and remove test parameters', () => {
    const initialLength = component.testParametersArray.length;
    
    // Add parameter
    component.addTestParameter();
    expect(component.testParametersArray.length).toBe(initialLength + 1);
    
    // Remove parameter
    component.removeTestParameter(0);
    expect(component.testParametersArray.length).toBe(initialLength);
  });
});
