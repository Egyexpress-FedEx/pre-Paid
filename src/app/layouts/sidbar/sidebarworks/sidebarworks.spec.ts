import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Sidebarworks } from './sidebarworks';

describe('Sidebarworks', () => {
  let component: Sidebarworks;
  let fixture: ComponentFixture<Sidebarworks>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebarworks],
    }).compileComponents();

    fixture = TestBed.createComponent(Sidebarworks);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
