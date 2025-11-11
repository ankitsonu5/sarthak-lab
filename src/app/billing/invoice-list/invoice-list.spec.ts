import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceList } from './invoice-list';

describe('InvoiceList', () => {
  let component: InvoiceList;
  let fixture: ComponentFixture<InvoiceList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [InvoiceList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InvoiceList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
