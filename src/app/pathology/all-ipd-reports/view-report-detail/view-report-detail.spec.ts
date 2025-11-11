import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ViewReportDetail } from './view-report-detail';

describe('ViewReportDetail', () => {
  let component: ViewReportDetail;
  let fixture: ComponentFixture<ViewReportDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ViewReportDetail]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ViewReportDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
