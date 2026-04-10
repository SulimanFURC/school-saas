import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { StudentRegisterComponent } from './student-register.component';
import { AcademicService } from '../../../services/academic.service';
import { StudentService } from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

describe('StudentRegisterComponent', () => {
  let fixture: ComponentFixture<StudentRegisterComponent>;
  let component: StudentRegisterComponent;
  let studentService: jasmine.SpyObj<StudentService>;
  let toast: jasmine.SpyObj<ToastService>;
  let router: Router;

  const mockClasses = [{ id: 1, name: 'Class 1', code: 'C1', display_order: 1 }];
  const mockYears = [{ id: 1, name: '2025-2026', is_active: true }];
  const mockSections = [{ id: 1, class_id: 1, name: 'A' }];

  beforeEach(async () => {
    const studentSpy = jasmine.createSpyObj('StudentService', ['register']);
    const academicSpy = jasmine.createSpyObj('AcademicService', ['listClasses', 'listAcademicYears', 'listSections']);
    academicSpy.listClasses.and.returnValue(of(mockClasses));
    academicSpy.listAcademicYears.and.returnValue(of(mockYears));
    academicSpy.listSections.and.returnValue(of(mockSections));
    const toastSpy = jasmine.createSpyObj('ToastService', ['open']);

    await TestBed.configureTestingModule({
      imports: [StudentRegisterComponent],
      providers: [
        provideRouter([]),
        { provide: StudentService, useValue: studentSpy },
        { provide: AcademicService, useValue: academicSpy },
        { provide: ToastService, useValue: toastSpy },
      ],
    }).compileComponents();

    studentService = TestBed.inject(StudentService) as jasmine.SpyObj<StudentService>;
    toast = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.stub();

    fixture = TestBed.createComponent(StudentRegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function fillValidForms(): void {
    component.s1.patchValue({
      admission_no: 'ADM-100',
      first_name: 'Test',
      last_name: 'Student',
      email: '',
    });
    component.s2.patchValue({
      guardian_type: 'father',
      father_name: 'John',
      father_phone: '555-0100',
    });
    component.classes = mockClasses;
    component.years = mockYears;
    component.sections = mockSections;
    component.s5.patchValue({
      academic_year_id: 1,
      class_id: 1,
      section_id: 1,
      create_student_login: false,
      login_password: '',
    });
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should navigate to student profile after successful registration', fakeAsync(() => {
    studentService.register.and.returnValue(of({ student: { id: 'stu-uuid-1' }, login: null }));
    fillValidForms();
    component.submit();
    tick();
    expect(studentService.register).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/students', 'stu-uuid-1']);
  }));

  it('should show toast with API error message when registration fails', fakeAsync(() => {
    studentService.register.and.returnValue(
      throwError(() => ({ error: { message: 'Duplicate admission number' } }))
    );
    fillValidForms();
    component.submit();
    tick();
    expect(toast.open).toHaveBeenCalledWith(
      'Duplicate admission number',
      'Dismiss',
      jasmine.objectContaining({ duration: 6000 })
    );
  }));
});
