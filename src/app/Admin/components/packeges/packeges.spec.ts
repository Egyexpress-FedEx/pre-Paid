import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Packeges } from './packeges';

describe('Packeges', () => {
  let component: Packeges;
  let fixture: ComponentFixture<Packeges>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Packeges],
    }).compileComponents();

    fixture = TestBed.createComponent(Packeges);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
