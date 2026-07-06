import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgxQuillInk } from './ngx-quill-ink';

describe('NgxQuillInk', () => {
  let component: NgxQuillInk;
  let fixture: ComponentFixture<NgxQuillInk>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgxQuillInk],
    }).compileComponents();

    fixture = TestBed.createComponent(NgxQuillInk);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
