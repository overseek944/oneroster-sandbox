import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, generateDistrict, summarise } from "../src/generator/district.js";
import { GRADE } from "../src/domain/vocabularies.js";

const data = generateDistrict(DEFAULT_CONFIG);
const summary = summarise(data);

describe("district generator", () => {
  it("is deterministic for a given seed", () => {
    const again = generateDistrict(DEFAULT_CONFIG);
    expect(JSON.stringify(again.users)).toBe(JSON.stringify(data.users));
    expect(JSON.stringify(again.enrollments)).toBe(JSON.stringify(data.enrollments));
  });

  it("produces a district containing schools", () => {
    const district = data.orgs.filter((o) => o.type === "district");
    const schools = data.orgs.filter((o) => o.type === "school");
    expect(district).toHaveLength(1);
    expect(schools.length).toBe(
      DEFAULT_CONFIG.elementarySchools + DEFAULT_CONFIG.middleSchools + DEFAULT_CONFIG.highSchools,
    );
    for (const school of schools) {
      expect(school.parentSourcedId).toBe(district[0]?.sourcedId);
    }
  });

  it("nests academic sessions rather than flattening them to a year", () => {
    const year = data.academicSessions.find((s) => s.type === "schoolYear");
    expect(year).toBeDefined();
    const children = data.academicSessions.filter((s) => s.parentSourcedId === year?.sourcedId);
    expect(children.length).toBeGreaterThan(0);
    // Grading periods hang off semesters, not off the year directly.
    const gradingPeriods = data.academicSessions.filter((s) => s.type === "gradingPeriod");
    expect(gradingPeriods.length).toBeGreaterThan(0);
    for (const period of gradingPeriods) {
      const parent = data.academicSessions.find((s) => s.sourcedId === period.parentSourcedId);
      expect(parent?.type).toBe("semester");
    }
  });

  it("runs different term structures in the same district", () => {
    const types = new Set(data.academicSessions.map((s) => s.type));
    expect(types.has("term")).toBe(true);
    expect(types.has("semester")).toBe(true);
  });

  // The pathology below is the point of the generator. If these assertions
  // stop holding, the sandbox has quietly become a tidy dataset and stops
  // testing anything worth testing.
  describe("realistic pathology", () => {
    it("leaves elementary students without an email address", () => {
      expect(summary.studentsWithoutEmail).toBeGreaterThan(0);
      const noEmail = data.users.filter((u) => u.role === "student" && u.email === null);
      expect(noEmail.length).toBe(summary.studentsWithoutEmail);
    });

    it("emits grade levels as strings from the CEDS vocabulary", () => {
      const grades = new Set(data.users.flatMap((u) => u.grades));
      for (const grade of grades) {
        expect(GRADE).toContain(grade);
        expect(typeof grade).toBe("string");
      }
      expect(grades.has("KG")).toBe(true);
    });

    it("includes at least one mixed-grade section", () => {
      expect(data.classes.some((c) => c.grades.length > 1)).toBe(true);
    });

    it("co-teaches some sections, usually with one clear teacher of record", () => {
      const teachersByClass = new Map<string, typeof data.enrollments>();
      for (const e of data.enrollments) {
        if (e.role !== "teacher") continue;
        const list = teachersByClass.get(e.classSourcedId) ?? [];
        list.push(e);
        teachersByClass.set(e.classSourcedId, list);
      }
      const coTaught = [...teachersByClass.values()].filter((list) => list.length > 1);
      expect(coTaught.length).toBeGreaterThan(0);
      // Most co-taught sections name exactly one primary.
      const clean = coTaught.filter((l) => l.filter((e) => e.primary === true).length === 1);
      expect(clean.length).toBeGreaterThan(coTaught.length / 2);
    });

    it("includes sections where the teacher of record is ambiguous", () => {
      // Deliberate. The spec says one teacher is primary; real feeds set the
      // flag on both often enough that a consumer must have a fallback and
      // must make the ambiguity visible rather than guessing quietly.
      expect(summary.ambiguousPrimaryTeacher).toBeGreaterThan(0);
    });

    it("includes homerooms, which are not instructional", () => {
      expect(summary.homerooms).toBeGreaterThan(0);
      expect(data.classes.some((c) => c.classType === "homeroom")).toBe(true);
    });

    it("includes ghost sections with no students", () => {
      const enrolled = new Set(data.enrollments.map((e) => e.classSourcedId));
      const empty = data.classes.filter((c) => !enrolled.has(c.sourcedId));
      expect(empty.length).toBeGreaterThan(0);
    });

    it("ends some enrolments mid-year rather than deleting them", () => {
      expect(summary.endedEnrollments).toBeGreaterThan(0);
      const ended = data.enrollments.filter((e) => e.endDate !== null);
      for (const e of ended) expect(e.status).toBe("active");
    });

    it("contains duplicate enrolments, as real feeds do", () => {
      const seen = new Set<string>();
      let duplicates = 0;
      for (const e of data.enrollments) {
        const key = `${e.classSourcedId}|${e.userSourcedId}|${e.role}`;
        if (seen.has(key)) duplicates++;
        seen.add(key);
      }
      expect(duplicates).toBeGreaterThan(0);
    });
  });

  it("references only entities that exist", () => {
    const classIds = new Set(data.classes.map((c) => c.sourcedId));
    const userIds = new Set(data.users.map((u) => u.sourcedId));
    const orgIds = new Set(data.orgs.map((o) => o.sourcedId));
    for (const e of data.enrollments) {
      expect(classIds.has(e.classSourcedId)).toBe(true);
      expect(userIds.has(e.userSourcedId)).toBe(true);
      expect(orgIds.has(e.schoolSourcedId)).toBe(true);
    }
    const courseIds = new Set(data.courses.map((c) => c.sourcedId));
    for (const c of data.classes) {
      expect(courseIds.has(c.courseSourcedId)).toBe(true);
      expect(orgIds.has(c.schoolSourcedId)).toBe(true);
    }
  });
});
