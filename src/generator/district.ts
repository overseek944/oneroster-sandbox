import { Rng } from "./rng.js";
import {
  ELEMENTARY_SUBJECTS,
  FAMILY_NAMES,
  GHOST_SECTIONS,
  GIVEN_NAMES,
  MIDDLE_COURSES,
  SCHOOL_STEMS,
  SECONDARY_COURSES,
} from "./names.js";
import type {
  AcademicSession,
  Class,
  Course,
  Demographics,
  DistrictData,
  Enrollment,
  Org,
  User,
} from "../domain/types.js";
import type { Grade } from "../domain/vocabularies.js";

export interface GeneratorConfig {
  seed: number;
  districtName: string;
  schoolYear: string;
  elementarySchools: number;
  middleSchools: number;
  highSchools: number;
  /** Approximate students per school, by level. */
  elementarySize: number;
  middleSize: number;
  highSize: number;
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  seed: 20262027,
  districtName: "Riverbend Unified School District",
  schoolYear: "2026-2027",
  elementarySchools: 7,
  middleSchools: 3,
  highSchools: 2,
  elementarySize: 350,
  middleSize: 600,
  highSize: 900,
};

type Level = "elementary" | "middle" | "high";

const ELEMENTARY_GRADES: Grade[] = ["KG", "01", "02", "03", "04", "05"];
const MIDDLE_GRADES: Grade[] = ["06", "07", "08"];
const HIGH_GRADES: Grade[] = ["09", "10", "11", "12"];

/** Everything is stamped with one instant so a full generation is one version. */
function isoNow(offsetDays = 0): string {
  const base = Date.UTC(2026, 7, 3, 6, 0, 0); // 3 Aug 2026, before the year starts
  return new Date(base + offsetDays * 86_400_000).toISOString();
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Builds one district's worth of OneRoster data.
 *
 * The point of this generator is not volume, it is pathology. Real district
 * feeds contain elementary students with no email address, sections nobody
 * teaches, two teachers on one class, students who moved schools in January,
 * and the occasional duplicate row. A consumer tested only against tidy data
 * passes here and fails in September.
 */
export function generateDistrict(config: GeneratorConfig = DEFAULT_CONFIG): DistrictData {
  const rng = new Rng(config.seed);

  const orgs: Org[] = [];
  const academicSessions: AcademicSession[] = [];
  const courses: Course[] = [];
  const classes: Class[] = [];
  const users: User[] = [];
  const enrollments: Enrollment[] = [];
  const demographics: Demographics[] = [];

  // ---- District -----------------------------------------------------------
  const districtId = "org-district-001";
  orgs.push({
    sourcedId: districtId,
    status: "active",
    dateLastModified: isoNow(),
    name: config.districtName,
    type: "district",
    identifier: "RUSD",
    parentSourcedId: null,
  });

  // ---- Academic sessions --------------------------------------------------
  // One school year, with terms nested under it. High schools run semesters
  // with grading periods inside them; elementary and middle run trimesters.
  // Two schools in one district on different term structures is normal, and
  // it is exactly what breaks a consumer that flattens sessions to a year.
  const yearId = "term-year-2026";
  academicSessions.push({
    sourcedId: yearId,
    status: "active",
    dateLastModified: isoNow(),
    title: `${config.schoolYear} School Year`,
    startDate: "2026-08-24",
    endDate: "2027-06-11",
    type: "schoolYear",
    parentSourcedId: null,
    schoolYear: "2027",
  });

  const trimesters = [
    { id: "term-tri-1", title: "Trimester 1", start: "2026-08-24", end: "2026-11-20" },
    { id: "term-tri-2", title: "Trimester 2", start: "2026-11-30", end: "2027-03-05" },
    { id: "term-tri-3", title: "Trimester 3", start: "2027-03-15", end: "2027-06-11" },
  ];
  for (const t of trimesters) {
    academicSessions.push({
      sourcedId: t.id,
      status: "active",
      dateLastModified: isoNow(),
      title: t.title,
      startDate: t.start,
      endDate: t.end,
      type: "term",
      parentSourcedId: yearId,
      schoolYear: "2027",
    });
  }

  const semesters = [
    { id: "term-sem-1", title: "Semester 1", start: "2026-08-24", end: "2027-01-15" },
    { id: "term-sem-2", title: "Semester 2", start: "2027-01-20", end: "2027-06-11" },
  ];
  for (const [index, s] of semesters.entries()) {
    academicSessions.push({
      sourcedId: s.id,
      status: "active",
      dateLastModified: isoNow(),
      title: s.title,
      startDate: s.start,
      endDate: s.end,
      type: "semester",
      parentSourcedId: yearId,
      schoolYear: "2027",
    });
    // Grading periods inside each semester. A gradebook needs these to decide
    // which scores count; a feed that omits them is the common real-world case
    // and is why consumers need a fallback.
    for (let q = 1; q <= 2; q++) {
      const n = index * 2 + q;
      academicSessions.push({
        sourcedId: `term-gp-${n}`,
        status: "active",
        dateLastModified: isoNow(),
        title: `Quarter ${n}`,
        startDate: s.start,
        endDate: s.end,
        type: "gradingPeriod",
        parentSourcedId: s.id,
        schoolYear: "2027",
      });
    }
  }

  // ---- Schools ------------------------------------------------------------
  const stems = rng.shuffle([...SCHOOL_STEMS]);
  let stemCursor = 0;
  const schools: { id: string; name: string; level: Level; grades: Grade[]; termIds: string[] }[] = [];

  const plan: [Level, number, string][] = [
    ["elementary", config.elementarySchools, "Elementary School"],
    ["middle", config.middleSchools, "Middle School"],
    ["high", config.highSchools, "High School"],
  ];

  let schoolSeq = 1;
  for (const [level, count, suffix] of plan) {
    for (let i = 0; i < count; i++) {
      const stem = stems[stemCursor++ % stems.length] as string;
      const id = `org-school-${String(schoolSeq).padStart(3, "0")}`;
      const name = `${stem} ${suffix}`;
      const grades =
        level === "elementary" ? ELEMENTARY_GRADES
        : level === "middle" ? MIDDLE_GRADES
        : HIGH_GRADES;
      // Some elementary schools run a pre-K programme. Grade "PK" in a feed
      // is the classic case that breaks integer parsing.
      const withPk: Grade[] =
        level === "elementary" && rng.chance(0.4) ? ["PK", ...grades] : [...grades];

      orgs.push({
        sourcedId: id,
        status: "active",
        dateLastModified: isoNow(),
        name,
        type: "school",
        identifier: `${1000 + schoolSeq}`,
        parentSourcedId: districtId,
      });
      schools.push({
        id,
        name,
        level,
        grades: withPk,
        termIds: level === "high" ? semesters.map((s) => s.id) : trimesters.map((t) => t.id),
      });
      schoolSeq++;
    }
  }

  // ---- People helpers -----------------------------------------------------
  let userSeq = 1;
  const makeName = () => ({
    given: rng.pick(GIVEN_NAMES),
    family: rng.pick(FAMILY_NAMES),
  });

  function addStaff(schoolId: string, role: "teacher" | "administrator"): User {
    const { given, family } = makeName();
    const id = `usr-${String(userSeq).padStart(6, "0")}`;
    const username = `${given.toLowerCase()}.${slug(family)}${userSeq}`;
    userSeq++;
    const user: User = {
      sourcedId: id,
      status: "active",
      dateLastModified: isoNow(),
      username,
      userIds: [{ type: "sis", identifier: `E${100000 + userSeq}` }],
      enabledUser: true,
      givenName: given,
      familyName: family,
      middleName: null,
      role,
      identifier: `E${100000 + userSeq}`,
      email: `${username}@riverbend.k12.example.org`,
      sms: null,
      phone: null,
      agentSourcedIds: [],
      orgSourcedIds: [schoolId],
      grades: [],
    };
    users.push(user);
    return user;
  }

  function addStudent(schoolId: string, grade: Grade, level: Level): User {
    const { given, family } = makeName();
    const id = `usr-${String(userSeq).padStart(6, "0")}`;
    const username = `${slug(given)}${slug(family)}${String(userSeq).slice(-4)}`;
    const sis = `S${200000 + userSeq}`;
    userSeq++;

    // Elementary students are not issued mailboxes here. This is a real
    // district policy pattern and the single most common cause of a consumer
    // that cannot serve K-5.
    const hasEmail = level !== "elementary";

    const user: User = {
      sourcedId: id,
      status: "active",
      dateLastModified: isoNow(),
      username,
      userIds: [{ type: "sis", identifier: sis }],
      enabledUser: true,
      givenName: given,
      familyName: family,
      middleName: rng.chance(0.25) ? rng.pick(GIVEN_NAMES) : null,
      role: "student",
      identifier: sis,
      email: hasEmail ? `${username}@students.riverbend.k12.example.org` : null,
      sms: null,
      phone: null,
      agentSourcedIds: [],
      orgSourcedIds: [schoolId],
      grades: [grade],
    };
    users.push(user);

    demographics.push({
      sourcedId: id,
      status: "active",
      dateLastModified: isoNow(),
      birthDate: `20${String(rng.int(8, 20)).padStart(2, "0")}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
      sex: rng.pick(["male", "female", "unspecified"] as const),
      americanIndianOrAlaskaNative: rng.chance(0.02),
      asian: rng.chance(0.09),
      blackOrAfricanAmerican: rng.chance(0.15),
      nativeHawaiianOrOtherPacificIslander: rng.chance(0.01),
      white: rng.chance(0.45),
      demographicRaceTwoOrMoreRaces: rng.chance(0.06),
      hispanicOrLatinoEthnicity: rng.chance(0.27),
      countryOfBirthCode: "US",
      stateOfBirthAbbreviation: null,
      cityOfBirth: null,
      publicSchoolResidenceStatus: null,
    });

    return user;
  }

  // ---- Courses, classes and enrolments per school -------------------------
  let classSeq = 1;
  let enrollSeq = 1;
  let courseSeq = 1;

  function addEnrollment(
    classId: string,
    schoolId: string,
    userId: string,
    role: "student" | "teacher",
    primary: boolean | null,
    beginDate: string | null = null,
    endDate: string | null = null,
  ): void {
    enrollments.push({
      sourcedId: `enr-${String(enrollSeq++).padStart(7, "0")}`,
      status: "active",
      dateLastModified: isoNow(),
      classSourcedId: classId,
      schoolSourcedId: schoolId,
      userSourcedId: userId,
      role,
      primary,
      beginDate,
      endDate,
    });
  }

  for (const school of schools) {
    addStaff(school.id, "administrator");

    const instructionalGrades = school.grades.filter((g) => g !== "PK");
    const perGrade = Math.max(
      1,
      Math.round(
        (school.level === "elementary" ? config.elementarySize
          : school.level === "middle" ? config.middleSize
          : config.highSize) / instructionalGrades.length,
      ),
    );

    if (school.level === "elementary") {
      // Self-contained classrooms: one teacher, one room, all subjects.
      const course: Course = {
        sourcedId: `crs-${String(courseSeq++).padStart(4, "0")}`,
        status: "active",
        dateLastModified: isoNow(),
        title: "Self-Contained Elementary",
        schoolYearSourcedId: yearId,
        courseCode: "ELEM-SC",
        grades: instructionalGrades,
        subjects: [...ELEMENTARY_SUBJECTS],
        orgSourcedId: school.id,
        subjectCodes: [],
      };
      courses.push(course);

      for (const grade of instructionalGrades) {
        const sections = Math.max(1, Math.round(perGrade / 24));
        for (let s = 0; s < sections; s++) {
          const teacher = addStaff(school.id, "teacher");
          const classId = `cls-${String(classSeq++).padStart(5, "0")}`;
          // A few sections are genuinely mixed-grade. Small schools combine
          // years, and `grades` is an array in the spec for this reason.
          const mixed = rng.chance(0.08) && grade !== "KG";
          const gradeIndex = instructionalGrades.indexOf(grade);
          const classGrades: Grade[] =
            mixed && gradeIndex > 0
              ? [instructionalGrades[gradeIndex - 1] as Grade, grade]
              : [grade];

          classes.push({
            sourcedId: classId,
            status: "active",
            dateLastModified: isoNow(),
            title: `${grade === "KG" ? "Kindergarten" : `Grade ${grade}`} - ${teacher.familyName}`,
            classCode: `${grade}-${String(s + 1).padStart(2, "0")}`,
            classType: "scheduled",
            location: `Room ${rng.int(100, 240)}`,
            grades: classGrades,
            subjects: [...ELEMENTARY_SUBJECTS],
            courseSourcedId: course.sourcedId,
            schoolSourcedId: school.id,
            termSourcedIds: school.termIds,
            subjectCodes: [],
            periods: [],
          });
          addEnrollment(classId, school.id, teacher.sourcedId, "teacher", true);

          // Roughly one section in eight is co-taught, usually where a special
          // education teacher pushes in. Exactly one is the teacher of record.
          if (rng.chance(0.12)) {
            const coTeacher = addStaff(school.id, "teacher");
            addEnrollment(classId, school.id, coTeacher.sourcedId, "teacher", false);
          }

          const size = rng.int(18, 27);
          for (let i = 0; i < size; i++) {
            const student = addStudent(school.id, grade, "elementary");
            addEnrollment(classId, school.id, student.sourcedId, "student", null);
          }
        }
      }
    } else {
      // Period-based schools.
      const catalogue = school.level === "middle" ? MIDDLE_COURSES : SECONDARY_COURSES;
      const schoolCourses: Course[] = catalogue.map((entry) => {
        const course: Course = {
          sourcedId: `crs-${String(courseSeq++).padStart(4, "0")}`,
          status: "active",
          dateLastModified: isoNow(),
          title: entry.title,
          schoolYearSourcedId: yearId,
          courseCode: entry.code,
          grades: [...entry.grades] as Grade[],
          subjects: [entry.subject],
          orgSourcedId: school.id,
          subjectCodes: [],
        };
        courses.push(course);
        return course;
      });

      // Students first, so sections can be filled from a real cohort.
      const roster: { user: User; grade: Grade }[] = [];
      for (const grade of instructionalGrades) {
        for (let i = 0; i < perGrade; i++) {
          roster.push({ user: addStudent(school.id, grade, school.level), grade });
        }
      }

      const teachers = Array.from({ length: Math.max(6, Math.round(roster.length / 22)) }, () =>
        addStaff(school.id, "teacher"),
      );

      for (const course of schoolCourses) {
        const eligible = roster.filter((r) => course.grades.includes(r.grade));
        if (eligible.length === 0) continue;
        const sections = Math.max(1, Math.ceil(eligible.length / 28));
        const shuffled = rng.shuffle(eligible);

        for (let s = 0; s < sections; s++) {
          const teacher = rng.pick(teachers);
          const classId = `cls-${String(classSeq++).padStart(5, "0")}`;
          const term = rng.pick(school.termIds);
          classes.push({
            sourcedId: classId,
            status: "active",
            dateLastModified: isoNow(),
            title: `${course.title} - Period ${rng.int(1, 7)}`,
            classCode: `${course.courseCode}-${String(s + 1).padStart(2, "0")}`,
            classType: "scheduled",
            location: `Room ${rng.int(100, 340)}`,
            grades: course.grades,
            subjects: course.subjects,
            courseSourcedId: course.sourcedId,
            schoolSourcedId: school.id,
            // High school courses often sit in one semester rather than the
            // whole year. A consumer that assumes year-long classes mis-scopes
            // every gradebook write.
            termSourcedIds: school.level === "high" ? [term] : school.termIds,
            subjectCodes: [],
            periods: [String(rng.int(1, 7))],
          });
          addEnrollment(classId, school.id, teacher.sourcedId, "teacher", true);
          if (rng.chance(0.1)) {
            addEnrollment(classId, school.id, rng.pick(teachers).sourcedId, "teacher", false);
          }

          const slice = shuffled.slice(s * 28, (s + 1) * 28);
          for (const { user } of slice) {
            // A small number of students transfer mid-year. Their enrolment
            // ends; it is not deleted. History has to survive that.
            const transfers = rng.chance(0.03);
            addEnrollment(
              classId,
              school.id,
              user.sourcedId,
              "student",
              null,
              null,
              transfers ? "2027-01-16" : null,
            );
          }
        }
      }

      // Homerooms. Not instructional, and present in every real feed.
      const homeroomCourse: Course = {
        sourcedId: `crs-${String(courseSeq++).padStart(4, "0")}`,
        status: "active",
        dateLastModified: isoNow(),
        title: "Homeroom",
        schoolYearSourcedId: yearId,
        courseCode: "HR",
        grades: instructionalGrades,
        subjects: [],
        orgSourcedId: school.id,
        subjectCodes: [],
      };
      courses.push(homeroomCourse);
      for (let h = 0; h < Math.max(2, Math.round(roster.length / 30)); h++) {
        const classId = `cls-${String(classSeq++).padStart(5, "0")}`;
        classes.push({
          sourcedId: classId,
          status: "active",
          dateLastModified: isoNow(),
          title: `Homeroom ${String.fromCharCode(65 + h)}`,
          classCode: `HR-${String(h + 1).padStart(2, "0")}`,
          classType: "homeroom",
          location: `Room ${rng.int(100, 340)}`,
          grades: instructionalGrades,
          subjects: [],
          courseSourcedId: homeroomCourse.sourcedId,
          schoolSourcedId: school.id,
          termSourcedIds: school.termIds,
          subjectCodes: [],
          periods: [],
        });
        addEnrollment(classId, school.id, rng.pick(teachers).sourcedId, "teacher", true);
      }

      // Ghost sections: no students, sometimes no teacher, never instructional.
      for (const ghost of rng.shuffle([...GHOST_SECTIONS]).slice(0, 2)) {
        const classId = `cls-${String(classSeq++).padStart(5, "0")}`;
        classes.push({
          sourcedId: classId,
          status: "active",
          dateLastModified: isoNow(),
          title: ghost,
          classCode: null,
          classType: "scheduled",
          location: null,
          grades: instructionalGrades,
          subjects: [],
          courseSourcedId: homeroomCourse.sourcedId,
          schoolSourcedId: school.id,
          termSourcedIds: school.termIds,
          subjectCodes: [],
          periods: [],
        });
      }
    }
  }

  // A small number of sections end up with two teachers both flagged primary.
  // The specification says one is the teacher of record; real feeds routinely
  // disagree with themselves. A consumer needs a deterministic fallback and
  // should surface the ambiguity rather than pick silently, so the generator
  // produces the defect on purpose.
  const teacherRows = enrollments.filter((e) => e.role === "teacher" && e.primary === false);
  const ambiguous = Math.max(1, Math.round(teacherRows.length * 0.05));
  for (let i = 0; i < ambiguous && i < teacherRows.length; i++) {
    const row = teacherRows[i * 7 % teacherRows.length];
    if (row) row.primary = true;
  }

  // A handful of duplicate enrolments. Real feeds contain them, and a
  // consumer that does not deduplicate double-counts a class.
  const duplicateCount = Math.max(1, Math.round(enrollments.length * 0.002));
  for (let i = 0; i < duplicateCount; i++) {
    const source = enrollments[rng.int(0, enrollments.length - 1)];
    if (!source) continue;
    enrollments.push({
      ...source,
      sourcedId: `enr-${String(enrollSeq++).padStart(7, "0")}`,
    });
  }

  return { orgs, academicSessions, courses, classes, users, enrollments, demographics };
}

export function summarise(data: DistrictData) {
  const students = data.users.filter((u) => u.role === "student");
  return {
    orgs: data.orgs.length,
    schools: data.orgs.filter((o) => o.type === "school").length,
    academicSessions: data.academicSessions.length,
    courses: data.courses.length,
    classes: data.classes.length,
    users: data.users.length,
    students: students.length,
    staff: data.users.length - students.length,
    enrollments: data.enrollments.length,
    studentsWithoutEmail: students.filter((u) => u.email === null).length,
    homerooms: data.classes.filter((c) => c.classType === "homeroom").length,
    coTaught: (() => {
      const byClass = new Map<string, number>();
      for (const e of data.enrollments) {
        if (e.role !== "teacher") continue;
        byClass.set(e.classSourcedId, (byClass.get(e.classSourcedId) ?? 0) + 1);
      }
      return [...byClass.values()].filter((n) => n > 1).length;
    })(),
    endedEnrollments: data.enrollments.filter((e) => e.endDate !== null).length,
    ambiguousPrimaryTeacher: (() => {
      const primaries = new Map<string, number>();
      for (const e of data.enrollments) {
        if (e.role !== "teacher" || e.primary !== true) continue;
        primaries.set(e.classSourcedId, (primaries.get(e.classSourcedId) ?? 0) + 1);
      }
      return [...primaries.values()].filter((n) => n > 1).length;
    })(),
  };
}
