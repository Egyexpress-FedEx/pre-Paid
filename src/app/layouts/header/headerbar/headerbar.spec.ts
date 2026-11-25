import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Headerbar } from './headerbar';

describe('Headerbar', () => {
  let component: Headerbar;
  let fixture: ComponentFixture<Headerbar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Headerbar],
    }).compileComponents();

    fixture = TestBed.createComponent(Headerbar);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
