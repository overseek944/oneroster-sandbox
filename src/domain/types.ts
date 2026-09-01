import type {
  ClassType,
  EnrollmentRole,
  Grade,
  OrgType,
  Role,
  SessionType,
  Sex,
  Status,
} from "./vocabularies.js";

/**
 * Every OneRoster object carries these. `sourcedId` is the district's
 * identifier for the object and is the only key a consumer is given; note that
 * it is reissued when a district migrates its student information system,
 * which is why consumers must not use it as an internal primary key.
 */
export interface Base {
  sourcedId: string;
  status: Status;
  dateLastModified: string;
}

export interface GUIDRef {
  href: string;
  sourcedId: string;
  type: string;
}

export interface Org extends Base {
  name: string;
  type: OrgType;
  identifier: string | null;
  parentSourcedId: string | null;
}

export interface AcademicSession extends Base {
  title: string;
  startDate: string;
  endDate: string;
  type: SessionType;
  parentSourcedId: string | null;
  schoolYear: string;
}

export interface Course extends Base {
  title: string;
  schoolYearSourcedId: string | null;
  courseCode: string | null;
  grades: Grade[];
  subjects: string[];
  orgSourcedId: string;
  subjectCodes: string[];
}

export interface Class extends Base {
  title: string;
  classCode: string | null;
  classType: ClassType;
  location: string | null;
  grades: Grade[];
  subjects: string[];
  courseSourcedId: string;
  schoolSourcedId: string;
  termSourcedIds: string[];
  subjectCodes: string[];
  periods: string[];
}

export interface User extends Base {
  username: string;
  userIds: { type: string; identifier: string }[];
  enabledUser: boolean;
  givenName: string;
  familyName: string;
  middleName: string | null;
  role: Role;
  identifier: string | null;
  /** Frequently null for elementary students. That is district policy, not a gap. */
  email: string | null;
  sms: string | null;
  phone: string | null;
  agentSourcedIds: string[];
  orgSourcedIds: string[];
  grades: Grade[];
}

export interface Enrollment extends Base {
  classSourcedId: string;
  schoolSourcedId: string;
  userSourcedId: string;
  role: EnrollmentRole;
  /** Which teacher is the teacher of record in a co-taught section. */
  primary: boolean | null;
  beginDate: string | null;
  endDate: string | null;
}

export interface Demographics extends Base {
  birthDate: string | null;
  sex: Sex | null;
  americanIndianOrAlaskaNative: boolean | null;
  asian: boolean | null;
  blackOrAfricanAmerican: boolean | null;
  nativeHawaiianOrOtherPacificIslander: boolean | null;
  white: boolean | null;
  demographicRaceTwoOrMoreRaces: boolean | null;
  hispanicOrLatinoEthnicity: boolean | null;
  countryOfBirthCode: string | null;
  stateOfBirthAbbreviation: string | null;
  cityOfBirth: string | null;
  publicSchoolResidenceStatus: string | null;
}

/** Everything the generator produces for one district. */
export interface DistrictData {
  orgs: Org[];
  academicSessions: AcademicSession[];
  courses: Course[];
  classes: Class[];
  users: User[];
  enrollments: Enrollment[];
  demographics: Demographics[];
}
