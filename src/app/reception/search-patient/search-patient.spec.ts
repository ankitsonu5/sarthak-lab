import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchPatient } from './search-patient';

describe('SearchPatient', () => {
  let component: SearchPatient;
  let fixture: ComponentFixture<SearchPatient>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SearchPatient]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchPatient);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
