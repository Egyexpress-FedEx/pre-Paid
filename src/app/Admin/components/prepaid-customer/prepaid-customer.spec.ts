import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrepaidCustomer } from './prepaid-customer';

describe('PrepaidCustomer', () => {
  let component: PrepaidCustomer;
  let fixture: ComponentFixture<PrepaidCustomer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrepaidCustomer],
    }).compileComponents();

    fixture = TestBed.createComponent(PrepaidCustomer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
