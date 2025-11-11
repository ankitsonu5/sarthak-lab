import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AllIpdReports } from './all-ipd-reports';

describe('AllIpdReports', () => {
  let component: AllIpdReports;
  let fixture: ComponentFixture<AllIpdReports>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AllIpdReports]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AllIpdReports);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
