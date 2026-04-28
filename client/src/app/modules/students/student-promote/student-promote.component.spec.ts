import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { StudentPromoteComponent } from './student-promote.component';
import { AcademicService } from '../../../services/academic.service';
import { StudentListRow, StudentService } from '../../../services/student.service';
import { ToastService } from '../../../services/toast.service';

describe('StudentPromoteComponent', () => {
  let fixture: ComponentFixture<StudentPromoteComponent>;
  let component: StudentPromoteComponent;
  let academic: jasmine.SpyObj<AcademicService>;
  let students: jasmine.SpyObj<StudentService>;
  let toast: jasmine.SpyObj<ToastService>;

  const mockYears = [
    { id: 1, name: '2024-2025', is_active: true },
    { id: 2, name: '2025-2026', is_active: false },
  ];
  const mockClasses = [
    { id: 10, name: 'Class 5', class_teacher_id: 'tch-1', is_active: true, sections: [] },
    { id: 11, name: 'Class 6', class_teacher_id: 'tch-2', is_active: true, sections: [] },
  ];
  const mockSections = [{ id: 20, class_id: 10, name: 'A' }];
  const mockSectionsClass6 = [{ id: 21, class_id: 11, name: 'A' }];
  const mockStudentRows: StudentListRow[] = [
    {
      id: 'stu-1',
      admission_no: 'A001',
      display_name: 'Test Student',
      full_name: 'Test Student',
      first_name: 'Test',
      last_name: 'Student',
      dob: null,
      gender: null,
      phone: null,
      status: 'active',
      class_name: 'Class 5',
      current_enrollment: {
        id: 1,
        academic_year_id: 1,
        class_id: 10,
        section_id: 20,
        academicYear: { id: 1, name: '2024-2025' },
        schoolClass: { id: 10, name: 'Class 5' },
        section: { id: 20, name: 'A' },
      },
    },
  ];

  function setupSpies(): void {
    academic = jasmine.createSpyObj('AcademicService', [
      'listAcademicYears',
      'getCurrentAcademicYear',
      'listClasses',
      'listSections',
    ]);
    academic.listAcademicYears.and.returnValue(of(mockYears));
    academic.getCurrentAcademicYear.and.returnValue(of(mockYears[0]));
    academic.listClasses.and.returnValue(of(mockClasses));
    academic.listSections.and.callFake((classId: number) => {
      if (classId === 11) return of(mockSectionsClass6);
      return of(mockSections);
    });

    students = jasmine.createSpyObj('StudentService', ['list', 'lookupByAdmission', 'promote']);
    students.list.and.returnValue(
      of({
        data: mockStudentRows,
        total: 1,
        page: 1,
        pageSize: 100,
        totalPages: 1,
      })
    );
    students.lookupByAdmission.and.returnValue(of(mockStudentRows[0]));
    students.promote.and.returnValue(of({ created: 1, updated: 0, enrollments: [] }));

    toast = jasmine.createSpyObj('ToastService', ['open']);
  }

  beforeEach(async () => {
    setupSpies();

    await TestBed.configureTestingModule({
      imports: [StudentPromoteComponent],
      providers: [
        provideRouter([]),
        { provide: AcademicService, useValue: academic },
        { provide: StudentService, useValue: students },
        { provide: ToastService, useValue: toast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StudentPromoteComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should finish loading and set current year and classes (no default promote session until rows)', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    expect(component.loading()).toBe(false);
    expect(component.currentYear()?.id).toBe(1);
    expect(component.classes().length).toBe(2);
    expect(component.form.get('to_academic_year_id')?.value).toBeNull();
    expect(academic.listAcademicYears).toHaveBeenCalled();
    expect(academic.getCurrentAcademicYear).toHaveBeenCalled();
    expect(academic.listClasses).toHaveBeenCalledWith(false);
  }));

  it('should load students when from class is selected and set adjacent target year', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.patchValue({ from_class_id: 10 });
    component.onFromClassChange();
    tick();
    expect(students.list).toHaveBeenCalledWith(
      jasmine.objectContaining({
        academic_year_id: 1,
        class_id: 10,
        page: 1,
        pageSize: 100,
      })
    );
    expect(component.studentRows().length).toBe(1);
    expect(component.form.get('to_academic_year_id')?.value).toBe(2);
  }));

  it('should call lookupByAdmission when Search is clicked', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    students.lookupByAdmission.calls.reset();
    component.form.patchValue({ admission_q: 'A001' });
    component.searchByAdmission();
    tick();
    expect(students.lookupByAdmission).toHaveBeenCalledWith('A001');
    expect(component.form.get('from_class_id')?.value).toBe(10);
    expect(component.form.get('to_academic_year_id')?.value).toBe(2);
  }));

  it('should toast on lookup error', fakeAsync(() => {
    students.lookupByAdmission.and.returnValue(throwError(() => ({ status: 500, message: 'err' })));
    fixture.detectChanges();
    tick();
    component.form.patchValue({ admission_q: 'A001' });
    component.searchByAdmission();
    tick();
    expect(toast.open).toHaveBeenCalled();
  }));

  it('should set empty hint when lookup returns no data', fakeAsync(() => {
    students.lookupByAdmission.and.returnValue(of(null));
    fixture.detectChanges();
    tick();
    component.form.patchValue({ admission_q: 'NOMATCH' });
    component.searchByAdmission();
    tick();
    expect(component.studentRows().length).toBe(0);
    expect(component.listEmptyHint()).toContain('No student found');
  }));

  it('should show toast when no students selected on submit', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.patchValue({
      from_class_id: 10,
      to_academic_year_id: 2,
      to_class_id: 11,
      to_section_id: 21,
    });
    component.submit();
    expect(toast.open).toHaveBeenCalledWith('Select at least one student', 'Dismiss', {
      duration: 4000,
    });
    expect(students.promote).not.toHaveBeenCalled();
  }));

  it('should show toast when target session/class/section incomplete', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.selected.set(new Set(['stu-1']));
    component.form.patchValue({
      from_class_id: 10,
      to_academic_year_id: null,
      to_class_id: null,
      to_section_id: null,
    });
    component.submit();
    expect(toast.open).toHaveBeenCalledWith(
      'Select promote session, target class and section',
      'Dismiss',
      { duration: 4000 }
    );
    expect(students.promote).not.toHaveBeenCalled();
  }));

  it('should show toast when from class missing', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.selected.set(new Set(['stu-1']));
    component.form.patchValue({
      from_class_id: null,
      to_academic_year_id: 2,
      to_class_id: 11,
      to_section_id: 21,
    });
    component.submit();
    expect(toast.open).toHaveBeenCalledWith('Select promotion from class', 'Dismiss', {
      duration: 4000,
    });
    expect(students.promote).not.toHaveBeenCalled();
  }));

  it('should call promote with from_academic_year_id from enrollment and refresh class list', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.patchValue({ from_class_id: 10 });
    component.onFromClassChange();
    tick();
    students.list.calls.reset();
    component.form.patchValue({
      to_class_id: 11,
      to_section_id: 21,
      roll_number: 5,
    });
    component.selected.set(new Set(['stu-1']));
    component.submit();
    tick();
    expect(students.promote).toHaveBeenCalledWith({
      student_ids: ['stu-1'],
      from_academic_year_id: 1,
      from_class_id: 10,
      to_academic_year_id: 2,
      to_class_id: 11,
      to_section_id: 21,
      kind: 'promote',
      roll_number: 5,
    });
    expect(toast.open).toHaveBeenCalledWith('Promotion saved', 'Dismiss', { duration: 4000 });
    expect(component.selected().size).toBe(0);
    expect(students.list).toHaveBeenCalled();
  }));

  it('should send rolls array when per-student roll is set', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.patchValue({ from_class_id: 10 });
    component.onFromClassChange();
    tick();
    component.form.patchValue({
      to_class_id: 11,
      to_section_id: 21,
      roll_number: 99,
    });
    component.selected.set(new Set(['stu-1']));
    component.setRollDraft('stu-1', '42');
    component.submit();
    tick();
    expect(students.promote).toHaveBeenCalledWith(
      jasmine.objectContaining({
        rolls: [{ student_id: 'stu-1', roll_number: 42 }],
        roll_number: 99,
      })
    );
  }));

  it('should show API error message when promote fails', fakeAsync(() => {
    students.promote.and.returnValue(
      throwError(() => ({ error: { message: 'Roll number already taken' } }))
    );
    fixture.detectChanges();
    tick();
    fillSubmitReady();
    component.submit();
    tick();
    expect(toast.open).toHaveBeenCalledWith('Roll number already taken', 'Dismiss', {
      duration: 6000,
    });
    expect(component.submitting()).toBe(false);
  }));

  it('should sync repeat to same session and class and send kind repeat', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.patchValue({ from_class_id: 10 });
    component.onFromClassChange();
    tick();
    component.form.patchValue({ repeat_class: true });
    tick();
    expect(component.form.get('to_class_id')?.value).toBe(10);
    expect(component.form.get('to_class_id')?.disabled).toBe(true);
    expect(component.form.get('to_academic_year_id')?.value).toBe(1);

    component.form.patchValue({
      to_section_id: 20,
    });
    component.selected.set(new Set(['stu-1']));
    students.promote.calls.reset();
    component.submit();
    tick();
    expect(students.promote).toHaveBeenCalledWith(
      jasmine.objectContaining({
        kind: 'repeat',
        from_class_id: 10,
        to_class_id: 10,
        to_academic_year_id: 1,
        to_section_id: 20,
      })
    );
  }));

  it('should select all rows when selection mode is all', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.form.patchValue({ from_class_id: 10 });
    component.onFromClassChange();
    tick();
    component.onSelectionModeChange('all');
    expect(component.selected().size).toBe(1);
    expect(component.selected().has('stu-1')).toBe(true);
  }));

  it('should show main content after init (sync APIs complete in first tick)', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(component.loading()).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.spinner-border')).toBeNull();
    expect(compiled.querySelector('button[type="submit"]')?.textContent?.trim()).toContain('Promote');
  }));

  it('should disable submit button while submitting', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    component.submitting.set(true);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector(
      'button[type="submit"]'
    ) as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  }));

  it('should disable admission Search when input is empty', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    const btn = fixture.nativeElement.querySelector(
      '.input-group button'
    ) as HTMLButtonElement | null;
    expect(btn?.disabled).toBe(true);
  }));

  function fillSubmitReady(): void {
    component.form.patchValue({ from_class_id: 10 });
    component.onFromClassChange();
    tick();
    component.form.patchValue({
      to_class_id: 11,
      to_section_id: 21,
    });
    component.selected.set(new Set(['stu-1']));
  }
});
