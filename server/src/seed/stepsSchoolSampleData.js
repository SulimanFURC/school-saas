require('dotenv').config();

const bcrypt = require('bcrypt');
const sequelize = require('../config/db');

const Tenant = require('../modules/tenant/tenant.model');
const User = require('../modules/users/user.model');
const TenantModule = require('../modules/tenant-module/tenantModule.model');

const { CATALOG } = require('./moduleSeed');

const AcademicYear = require('../modules/classes/academicYear.model');
const SchoolClass = require('../modules/classes/class.model');
const Section = require('../modules/classes/section.model');

const Teacher = require('../modules/teachers/teacher.model');
const TeacherAcademicAssignment = require('../modules/teachers/teacherAcademicAssignment.model');

const Subject = require('../modules/subjects/subject.model');

const Student = require('../modules/students/student.model');
const StudentEnrollment = require('../modules/students/studentEnrollment.model');

const Expense = require('../modules/expenses/expense.model');

const Exam = require('../modules/exams/exam.model');
const ExamClass = require('../modules/exams/examClass.model');
const ExamTimetable = require('../modules/exams/examTimetable.model');
const ExamMark = require('../modules/exams/examMark.model');
const ExamGradingConfig = require('../modules/exams/examGradingConfig.model');
const GradingScheme = require('../modules/exams/gradingScheme.model');
const GradingBand = require('../modules/exams/gradingBand.model');

const STEPS_SUBDOMAIN = 'steps-school';
const STEPS_TENANT_ID_ENV = process.env.STEPS_SCHOOL_TENANT_ID || process.env.TENANT_ID || '';

const ACADEMIC_YEAR_NAME = '2025-2026';

const EXAM_DRAFT_TITLE = 'Steps Draft Exam';
const EXAM_ONGOING_TITLE = 'Steps Ongoing Exam';
const EXAM_PUBLISHED_TITLE = 'Steps Completed Exam';

function safeNormalizeUsername(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
}

function makeStudentUsername(tenantSubdomain, admissionNo) {
  return safeNormalizeUsername(`${tenantSubdomain}-${String(admissionNo).trim()}`);
}

async function getOrCreate(Model, { where, defaults = {}, transaction }) {
  const found = await Model.findOne({ where, transaction });
  if (found) return found;
  return Model.create({ ...where, ...defaults }, { transaction });
}

/**
 * Seeds demo data for the steps-school tenant. Pass `{ transaction }` for atomic runs (e.g. reseed Phase 3).
 * @param {{ transaction?: import('sequelize').Transaction }} [options]
 */
async function seedStepsSchoolSampleData(options = {}) {
  const trx = options.transaction;
  const oc = (Model, { where, defaults = {} }) =>
    getOrCreate(Model, { where, defaults, transaction: trx });

  try {
    console.log('steps-school seed: start');
    // 1) Tenant + module flags + academic year
    let tenant = null;
    if (STEPS_TENANT_ID_ENV) {
      tenant = { id: STEPS_TENANT_ID_ENV };
      console.log('steps-school seed: using tenant id from env');
    } else {
      console.log('steps-school seed: ensuring tenant row');
      tenant = await Tenant.findOne({ where: { subdomain: STEPS_SUBDOMAIN }, transaction: trx });
      if (!tenant) {
        tenant = await Tenant.create(
          {
            name: 'Steps School',
            subdomain: STEPS_SUBDOMAIN,
            status: 'active',
          },
          { transaction: trx }
        );
      }
      console.log('steps-school seed: tenant ready');
    }

    console.log('steps-school seed: ensuring tenant module flags');
    for (const moduleKey of CATALOG.map((m) => m.key)) {
      await TenantModule.findOrCreate({
        where: { tenant_id: tenant.id, module_key: moduleKey },
        defaults: { tenant_id: tenant.id, module_key: moduleKey, is_enabled: true },
        transaction: trx,
      });
    }

    // Ensure we have an academic year row and it is the active one.
    const [year] = await AcademicYear.findOrCreate({
      where: { tenant_id: tenant.id, name: ACADEMIC_YEAR_NAME },
      defaults: { is_active: true },
      transaction: trx,
    });
    await AcademicYear.update({ is_active: false }, { where: { tenant_id: tenant.id }, transaction: trx });
    await year.update({ is_active: true }, { transaction: trx });
    console.log('steps-school seed: academic year ready');

    // 2) Subjects (used by exam timetable + teacher assignments)
    const subjectsSeed = [
      { name: 'Mathematics' },
      { name: 'Science' },
    ];
    const subjectsByName = new Map();
    for (const s of subjectsSeed) {
      const normKey = String(s.name).trim().toLowerCase();
      const subject = await oc(Subject, {
        where: { tenant_id: tenant.id, name_key: normKey },
        defaults: {
          tenant_id: tenant.id,
          name: String(s.name).trim(),
          name_key: normKey,
          is_active: true,
        },
      });
      subjectsByName.set(s.name, subject);
    }
    const math = subjectsByName.get('Mathematics');
    const science = subjectsByName.get('Science');
    console.log('steps-school seed: subjects ready');

    // 3) Teachers + login users
    const teachersSeed = [
      {
        key: 'homeroom-9',
        teacher: {
          first_name: 'Asha',
          last_name: 'Verma',
          email: 'homeroom9@steps-school.com',
          designation: 'Homeroom Teacher',
          gender: 'female',
        },
      },
      {
        key: 'homeroom-10',
        teacher: {
          first_name: 'Ravi',
          last_name: 'Kumar',
          email: 'homeroom10@steps-school.com',
          designation: 'Homeroom Teacher',
          gender: 'male',
        },
      },
      {
        key: 'homeroom-11',
        teacher: {
          first_name: 'Meera',
          last_name: 'Sharma',
          email: 'homeroom11@steps-school.com',
          designation: 'Homeroom Teacher',
          gender: 'female',
        },
      },
    ];

    const pwdAdmin = process.env.DUMMY_ADMIN_PASSWORD || '123456';
    const pwdTeacher = process.env.DUMMY_TEACHER_PASSWORD || '123456';
    const pwdStudent = process.env.STUDENT_DEFAULT_PASSWORD || '123456';
    const adminHash = await bcrypt.hash(pwdAdmin, 10);
    const teacherHash = await bcrypt.hash(pwdTeacher, 10);
    const studentHash = await bcrypt.hash(pwdStudent, 10);

    // Admin user for creating expenses / viewing everything.
    await oc(User, {
      where: { tenant_id: tenant.id, email: 'admin@steps-school.com' },
      defaults: {
        tenant_id: tenant.id,
        name: 'Steps Admin',
        email: 'admin@steps-school.com',
        username: 'admin-steps-school',
        password: adminHash,
        role: 'admin',
        status: 'active',
      },
    });

    const teachersByKey = new Map();
    for (const row of teachersSeed) {
      const email = row.teacher.email;
      const teacher = await oc(Teacher, {
        where: { tenant_id: tenant.id, email },
        defaults: {
          tenant_id: tenant.id,
          first_name: row.teacher.first_name,
          last_name: row.teacher.last_name,
          email,
          designation: row.teacher.designation,
          gender: row.teacher.gender,
          photo_base64: null,
          photo_mime: null,
          cv_file_name: null,
          cv_file_url: null,
        },
      });

      const username = safeNormalizeUsername(row.key);
      const loginUser = await oc(User, {
        where: { tenant_id: tenant.id, email },
        defaults: {
          tenant_id: tenant.id,
          name: `${row.teacher.first_name} ${row.teacher.last_name}`.trim(),
          email,
          username: username || email,
          password: teacherHash,
          role: 'teacher',
          status: 'active',
          teacher_id: teacher.id,
        },
      });

      // If user existed, ensure teacher linkage is correct.
      if (loginUser.teacher_id !== teacher.id) {
        await loginUser.update({ teacher_id: teacher.id }, { transaction: trx });
      }

      teachersByKey.set(row.key, teacher);
    }

    const teacher9 = teachersByKey.get('homeroom-9'); // Also teaches Mathematics for Class 9 + 10
    const teacher10 = teachersByKey.get('homeroom-10'); // Also teaches Science for Class 9 + 10 + 11
    const teacher11 = teachersByKey.get('homeroom-11'); // Also teaches Mathematics for Class 11
    console.log('steps-school seed: teachers ready');

    // 4) Classes + sections (two sections A/B so teacher filtering can be tested)
    const classesSeed = [
      { name: 'Class 9th', class_teacher: teacher9 },
      { name: 'Class 10th', class_teacher: teachersByKey.get('homeroom-10') },
      { name: 'Class 11th', class_teacher: teachersByKey.get('homeroom-11') },
    ];

    const classByName = new Map();
    for (const c of classesSeed) {
      const cls = await oc(SchoolClass, {
        where: { tenant_id: tenant.id, name: c.name },
        defaults: { tenant_id: tenant.id, name: c.name, class_teacher_id: c.class_teacher.id, is_active: true },
      });

      if (cls.class_teacher_id !== c.class_teacher.id) {
        await cls.update({ class_teacher_id: c.class_teacher.id }, { transaction: trx });
      }

      classByName.set(c.name, cls);
    }
    console.log('steps-school seed: classes + sections ready');

    const sectionsByKey = new Map(); // `${className}:${sectionName}`
    const sectionNames = ['A', 'B'];
    for (const [className, cls] of classByName.entries()) {
      for (const sName of sectionNames) {
        const sec = await oc(Section, {
          where: { tenant_id: tenant.id, class_id: cls.id, name: sName },
          defaults: { tenant_id: tenant.id, class_id: cls.id, name: sName },
        });
        sectionsByKey.set(`${className}:${sName}`, sec);
      }
    }

    // 5) Teacher academic assignments (controls who can view/edit marks)
    console.log('steps-school seed: seeding teacher assignments');
    const academicYearId = year.id;

    // Teacher9 teaches Mathematics for Class 9 + 10 (A & B)
    for (const className of ['Class 9th', 'Class 10th']) {
      const cls = classByName.get(className);
      for (const sName of sectionNames) {
        const sec = sectionsByKey.get(`${className}:${sName}`);
        await oc(TeacherAcademicAssignment, {
          where: {
            tenant_id: tenant.id,
            teacher_id: teacher9.id,
            academic_year_id: academicYearId,
            class_id: cls.id,
            section_id: sec.id,
            subject_id: math.id,
          },
          defaults: {
            tenant_id: tenant.id,
            teacher_id: teacher9.id,
            academic_year_id: academicYearId,
            class_id: cls.id,
            section_id: sec.id,
            subject_id: math.id,
            subject_name: math.name,
          },
        });
      }
    }

    // Teacher10 teaches Science for Class 9 + 10 + 11 (A & B)
    for (const className of ['Class 9th', 'Class 10th', 'Class 11th']) {
      const cls = classByName.get(className);
      for (const sName of sectionNames) {
        const sec = sectionsByKey.get(`${className}:${sName}`);
        await oc(TeacherAcademicAssignment, {
          where: {
            tenant_id: tenant.id,
            teacher_id: teacher10.id,
            academic_year_id: academicYearId,
            class_id: cls.id,
            section_id: sec.id,
            subject_id: science.id,
          },
          defaults: {
            tenant_id: tenant.id,
            teacher_id: teacher10.id,
            academic_year_id: academicYearId,
            class_id: cls.id,
            section_id: sec.id,
            subject_id: science.id,
            subject_name: science.name,
          },
        });
      }
    }

    // Teacher11 teaches Mathematics for Class 11 (A & B)
    for (const sName of sectionNames) {
      const sec = sectionsByKey.get('Class 11th:' + sName);
      await oc(TeacherAcademicAssignment, {
        where: {
          tenant_id: tenant.id,
          teacher_id: teacher11.id,
          academic_year_id: academicYearId,
          class_id: classByName.get('Class 11th').id,
          section_id: sec.id,
          subject_id: math.id,
        },
        defaults: {
          tenant_id: tenant.id,
          teacher_id: teacher11.id,
          academic_year_id: academicYearId,
          class_id: classByName.get('Class 11th').id,
          section_id: sec.id,
          subject_id: math.id,
          subject_name: math.name,
        },
      });
    }

    // 6) Students + enrollments + login users
    console.log('steps-school seed: seeding students + enrollments');
    const studentsSeed = [
      { admission_no: 'ST-9A-001', className: 'Class 9th', sectionName: 'A', full_name: 'Zara Patel' },
      { admission_no: 'ST-9B-002', className: 'Class 9th', sectionName: 'B', full_name: 'Arjun Mehta' },
      { admission_no: 'ST-10A-001', className: 'Class 10th', sectionName: 'A', full_name: 'Nina Das' },
      { admission_no: 'ST-10B-002', className: 'Class 10th', sectionName: 'B', full_name: 'Rahul Iyer' },
      { admission_no: 'ST-11A-001', className: 'Class 11th', sectionName: 'A', full_name: 'Sara Khan' },
      { admission_no: 'ST-11B-002', className: 'Class 11th', sectionName: 'B', full_name: 'Vikram Singh' },
    ];

    // A deterministic roll number per student for stable UI sorting.
    const rollByAdmission = new Map([
      ['ST-9A-001', 1],
      ['ST-9B-002', 2],
      ['ST-10A-001', 1],
      ['ST-10B-002', 2],
      ['ST-11A-001', 1],
      ['ST-11B-002', 2],
    ]);

    const studentByAdmission = new Map();
    for (const s of studentsSeed) {
      const student = await oc(Student, {
        where: { tenant_id: tenant.id, admission_no: s.admission_no },
        defaults: {
          tenant_id: tenant.id,
          admission_no: s.admission_no,
          full_name: s.full_name,
          first_name: s.full_name.split(' ')[0] || null,
          last_name: s.full_name.split(' ').slice(1).join(' ') || null,
          gender: null,
          dob: null,
          phone: null,
          email: null,
          blood_group: null,
          current_address: null,
          permanent_address: null,
          extra_details: 'Seeded student for development.',
          status: 'active',
        },
      });
      studentByAdmission.set(s.admission_no, student);

      const cls = classByName.get(s.className);
      const sec = sectionsByKey.get(`${s.className}:${s.sectionName}`);
      await oc(StudentEnrollment, {
        where: {
          tenant_id: tenant.id,
          student_id: student.id,
          academic_year_id: academicYearId,
        },
        defaults: {
          tenant_id: tenant.id,
          student_id: student.id,
          academic_year_id: academicYearId,
          class_id: cls.id,
          section_id: sec.id,
          roll_number: rollByAdmission.get(s.admission_no) || null,
          category: null,
          promotion_type: 'initial',
          status: 'active',
        },
      });

      const username = makeStudentUsername(STEPS_SUBDOMAIN, s.admission_no);
      await oc(User, {
        where: { tenant_id: tenant.id, username },
        defaults: {
          tenant_id: tenant.id,
          name: s.full_name,
          email: null,
          username,
          password: studentHash,
          role: 'student',
          status: 'active',
          student_id: student.id,
        },
      });
    }

    // 7) Expenses (admin/super_admin only)
    console.log('steps-school seed: seeding expenses');
    const adminUser = await User.findOne({
      where: { tenant_id: tenant.id, email: 'admin@steps-school.com' },
      transaction: trx,
    });

    const expensesSeed = [
      { name: 'Monthly Salary', description: 'Staff salary payout', expense_type: 'Salary', status: 'Paid', amount: 200000.0, expense_date: '2026-03-30' },
      { name: 'Office Rent', description: 'Monthly rent', expense_type: 'Rent', status: 'Due', amount: 50000.0, expense_date: '2026-04-25' },
      { name: 'Internet', description: 'Campus internet bill', expense_type: 'Internet', status: 'Paid', amount: 4500.5, expense_date: '2026-04-10' },
      { name: 'Stationery', description: 'Supplies and stationery', expense_type: 'Supplies', status: 'Other', amount: 1500.0, expense_date: '2026-04-05' },
      { name: 'Transport', description: 'Bus/transport cost', expense_type: 'Transport', status: 'Due', amount: 2750.0, expense_date: '2026-04-20' },
    ];

    for (const ex of expensesSeed) {
      const found = await Expense.findOne({
        where: { tenant_id: tenant.id, name: ex.name, expense_date: ex.expense_date, expense_type: ex.expense_type },
        transaction: trx,
      });
      if (found) continue;
      await Expense.create(
        {
          tenant_id: tenant.id,
          name: ex.name,
          description: ex.description,
          amount: ex.amount,
          expense_date: ex.expense_date,
          expense_type: ex.expense_type,
          status: ex.status,
          attachment_url: null,
          created_by_user_id: adminUser ? adminUser.id : null,
        },
        { transaction: trx }
      );
    }

    // 8) Exams (draft / ongoing / completed) + timetable + marks
    console.log('steps-school seed: seeding exams + marks');
    const examDraft = await oc(Exam, {
      where: { tenant_id: tenant.id, title: EXAM_DRAFT_TITLE, academic_year_id: academicYearId },
      defaults: {
        tenant_id: tenant.id,
        title: EXAM_DRAFT_TITLE,
        exam_type: 'final',
        academic_year_id: academicYearId,
        start_date: '2026-06-01',
        end_date: '2026-06-10',
        is_internal: false,
        status: 'draft',
        timetable_finalized_at: null,
        published_at: null,
      },
    });

    const examOngoing = await oc(Exam, {
      where: { tenant_id: tenant.id, title: EXAM_ONGOING_TITLE, academic_year_id: academicYearId },
      defaults: {
        tenant_id: tenant.id,
        title: EXAM_ONGOING_TITLE,
        exam_type: 'mid_term',
        academic_year_id: academicYearId,
        start_date: '2026-04-15',
        end_date: '2026-06-15',
        is_internal: false,
        status: 'ongoing',
        timetable_finalized_at: new Date(),
        published_at: null,
      },
    });

    const examPublished = await oc(Exam, {
      where: { tenant_id: tenant.id, title: EXAM_PUBLISHED_TITLE, academic_year_id: academicYearId },
      defaults: {
        tenant_id: tenant.id,
        title: EXAM_PUBLISHED_TITLE,
        exam_type: 'first_term',
        academic_year_id: academicYearId,
        start_date: '2025-02-01',
        end_date: '2025-02-15',
        is_internal: false,
        status: 'published',
        timetable_finalized_at: new Date('2025-02-05'),
        published_at: new Date('2025-02-16'),
      },
    });

    // Exam classes participating in each exam.
    const examsClasses = new Map([
      [examDraft.id, ['Class 9th', 'Class 10th']],
      [examOngoing.id, ['Class 9th', 'Class 10th']],
      [examPublished.id, ['Class 9th', 'Class 10th', 'Class 11th']],
    ]);

    for (const [examId, classNames] of examsClasses.entries()) {
      for (const className of classNames) {
        const cls = classByName.get(className);
        await oc(ExamClass, {
          where: { tenant_id: tenant.id, exam_id: examId, class_id: cls.id },
          defaults: { tenant_id: tenant.id, exam_id: examId, class_id: cls.id, grade_level: null },
        });
      }
    }

    // Timetables: 2 subjects per participating class.
    // draft: no marks; ongoing: partial marks; published: all marks.
    function mkTimeSlot(index) {
      // HH:MM generator; keeps times within a single day.
      // Our seed uses <= 20 slots, so "00..23" is guaranteed.
      const base = 9 * 60;
      const start = base + index * 60;
      const end = start + 60;
      const toHHMM = (mins) => {
        const hh = Math.floor(mins / 60);
        const mm = mins % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      };
      return { start_time: toHHMM(start), end_time: toHHMM(end) };
    }

    const timetablesToSeed = [];
    const draftClassNames = ['Class 9th', 'Class 10th'];
    const ongoingClassNames = ['Class 9th', 'Class 10th'];
    const publishedClassNames = ['Class 9th', 'Class 10th', 'Class 11th'];

    const draftDate = '2026-06-05';
    const ongoingDate = '2026-05-20';
    const publishedDate = '2025-02-10';

    for (const className of draftClassNames) {
      for (const [subjName, subj] of [
        ['Mathematics', math],
        ['Science', science],
      ]) {
        timetablesToSeed.push({
          exam: examDraft,
          className,
          subject: subj,
          exam_date: draftDate,
          ...mkTimeSlot(timetablesToSeed.length),
          room: `${className} - ${subjName}`,
          total_marks: 50,
          passing_marks: 25,
          is_locked: false,
        });
      }
    }

    for (const className of ongoingClassNames) {
      for (const [subjName, subj] of [
        ['Mathematics', math],
        ['Science', science],
      ]) {
        timetablesToSeed.push({
          exam: examOngoing,
          className,
          subject: subj,
          exam_date: ongoingDate,
          ...mkTimeSlot(timetablesToSeed.length),
          room: `${className} - ${subjName}`,
          total_marks: 50,
          passing_marks: 25,
          is_locked: false,
        });
      }
    }

    for (const className of publishedClassNames) {
      for (const [subjName, subj] of [
        ['Mathematics', math],
        ['Science', science],
      ]) {
        timetablesToSeed.push({
          exam: examPublished,
          className,
          subject: subj,
          exam_date: publishedDate,
          ...mkTimeSlot(timetablesToSeed.length),
          room: `${className} - ${subjName}`,
          total_marks: 50,
          passing_marks: 25,
          is_locked: true,
        });
      }
    }

    const timetablesByExamClassSubject = new Map();
    for (const tt of timetablesToSeed) {
      const cls = classByName.get(tt.className);
      const key = `${tt.exam.id}:${cls.id}:${tt.subject.id}`;
      const timetable = await oc(ExamTimetable, {
        where: {
          tenant_id: tenant.id,
          exam_id: tt.exam.id,
          class_id: cls.id,
          subject_id: tt.subject.id,
        },
        defaults: {
          tenant_id: tenant.id,
          exam_id: tt.exam.id,
          class_id: cls.id,
          subject_id: tt.subject.id,
          exam_date: tt.exam_date,
          start_time: tt.start_time,
          end_time: tt.end_time,
          room: tt.room,
          total_marks: tt.total_marks,
          passing_marks: tt.passing_marks,
          is_locked: tt.is_locked,
          deadline_at: null,
        },
      });
      timetablesByExamClassSubject.set(key, timetable);
    }

    // Marks:
    // ongoing:
    //  - Mathematics: marks only for section A students
    //  - Science: marks only for section B students
    // published:
    //  - marks for all students (A & B)
    const marksForOngoing = [];
    const marksForPublished = [];

    function addMark({ exam, className, subject, sectionName, admissionNo, marks_obtained }) {
      const cls = classByName.get(className);
      const ttKey = `${exam.id}:${cls.id}:${subject.id}`;
      const tt = timetablesByExamClassSubject.get(ttKey);
      if (!tt) return;
      const student = studentByAdmission.get(admissionNo);
      if (!student) return;
      const list = exam.id === examOngoing.id ? marksForOngoing : marksForPublished;
      list.push({
        exam,
        className,
        subject,
        sectionName,
        student,
        tt,
        marks_obtained,
      });
    }

    // Ongoing - Math only section A
    addMark({
      exam: examOngoing,
      className: 'Class 9th',
      subject: math,
      sectionName: 'A',
      admissionNo: 'ST-9A-001',
      marks_obtained: 40,
    });
    addMark({
      exam: examOngoing,
      className: 'Class 10th',
      subject: math,
      sectionName: 'A',
      admissionNo: 'ST-10A-001',
      marks_obtained: 35,
    });

    // Ongoing - Science only section B
    addMark({
      exam: examOngoing,
      className: 'Class 9th',
      subject: science,
      sectionName: 'B',
      admissionNo: 'ST-9B-002',
      marks_obtained: 30,
    });
    addMark({
      exam: examOngoing,
      className: 'Class 10th',
      subject: science,
      sectionName: 'B',
      admissionNo: 'ST-10B-002',
      marks_obtained: 28,
    });

    // Published - all students, both subjects
    const publishedStudents = ['ST-9A-001', 'ST-9B-002', 'ST-10A-001', 'ST-10B-002', 'ST-11A-001', 'ST-11B-002'];
    for (const admissionNo of publishedStudents) {
      const student = studentByAdmission.get(admissionNo);
      const match = studentsSeed.find((x) => x.admission_no === admissionNo);
      if (!match) continue;
      const className = match.className;
      addMark({
        exam: examPublished,
        className,
        subject: math,
        sectionName: match.sectionName,
        admissionNo,
        marks_obtained: className === 'Class 9th' ? 42 : className === 'Class 10th' ? 38 : 45,
      });
      addMark({
        exam: examPublished,
        className,
        subject: science,
        sectionName: match.sectionName,
        admissionNo,
        marks_obtained: className === 'Class 9th' ? 36 : className === 'Class 10th' ? 40 : 33,
      });
    }

    // Create marks idempotently.
    for (const m of marksForOngoing) {
      await oc(ExamMark, {
        where: { tenant_id: tenant.id, exam_timetable_id: m.tt.id, student_id: m.student.id },
        defaults: {
          tenant_id: tenant.id,
          exam_id: m.exam.id,
          exam_timetable_id: m.tt.id,
          student_id: m.student.id,
          entry_status: 'present',
          marks_obtained: m.marks_obtained,
          entered_by_user_id: null,
          updated_by_user_id: null,
        },
      });
    }

    for (const m of marksForPublished) {
      await oc(ExamMark, {
        where: { tenant_id: tenant.id, exam_timetable_id: m.tt.id, student_id: m.student.id },
        defaults: {
          tenant_id: tenant.id,
          exam_id: m.exam.id,
          exam_timetable_id: m.tt.id,
          student_id: m.student.id,
          entry_status: 'present',
          marks_obtained: m.marks_obtained,
          entered_by_user_id: null,
          updated_by_user_id: null,
        },
      });
    }

    // 9) Grading config for the published exam (so results have letter grade)
    const scheme = await oc(GradingScheme, {
      where: { tenant_id: tenant.id, name: 'Steps Letter Grade' },
      defaults: {
        tenant_id: tenant.id,
        name: 'Steps Letter Grade',
        description: 'Seeded grading scheme for demo results.',
        has_grade_points: true,
        archived_at: null,
      },
    });

    const existingBands = await GradingBand.findAll({
      where: { tenant_id: tenant.id, grading_scheme_id: scheme.id },
      transaction: trx,
    });
    if (existingBands.length === 0) {
      await GradingBand.bulkCreate(
        [
        {
          tenant_id: tenant.id,
          grading_scheme_id: scheme.id,
          grade_label: 'A',
          min_percent: 85.0,
          max_percent: 100.0,
          grade_point: 10.0,
          remarks: 'Excellent',
          is_failing: false,
        },
        {
          tenant_id: tenant.id,
          grading_scheme_id: scheme.id,
          grade_label: 'B',
          min_percent: 75.0,
          max_percent: 84.99,
          grade_point: 8.0,
          remarks: 'Very Good',
          is_failing: false,
        },
        {
          tenant_id: tenant.id,
          grading_scheme_id: scheme.id,
          grade_label: 'C',
          min_percent: 65.0,
          max_percent: 74.99,
          grade_point: 6.0,
          remarks: 'Good',
          is_failing: false,
        },
        {
          tenant_id: tenant.id,
          grading_scheme_id: scheme.id,
          grade_label: 'D',
          min_percent: 55.0,
          max_percent: 64.99,
          grade_point: 4.0,
          remarks: 'Average',
          is_failing: false,
        },
        {
          tenant_id: tenant.id,
          grading_scheme_id: scheme.id,
          grade_label: 'E',
          min_percent: 0.0,
          max_percent: 54.99,
          grade_point: 2.0,
          remarks: 'Needs Improvement',
          is_failing: true,
        },
        ],
        { transaction: trx }
      );
    }

    await oc(ExamGradingConfig, {
      where: { tenant_id: tenant.id, exam_id: examPublished.id },
      defaults: {
        tenant_id: tenant.id,
        exam_id: examPublished.id,
        grading_scheme_id: scheme.id,
        grading_mode: 'aggregate',
      },
    });
  } catch (err) {
    console.error('seedStepsSchoolSampleData error:', err);
    throw err;
  }
}

module.exports = {
  seedStepsSchoolSampleData,
};

if (require.main === module) {
  seedStepsSchoolSampleData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

