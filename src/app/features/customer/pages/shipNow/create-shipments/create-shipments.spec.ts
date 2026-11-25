import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateShipments } from './create-shipments';

describe('CreateShipments', () => {
  let component: CreateShipments;
  let fixture: ComponentFixture<CreateShipments>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateShipments],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateShipments);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
