/**
 * OneRoster controlled vocabularies.
 *
 * These are the enumerations the specification defines. They are kept as const
 * arrays rather than TypeScript enums so that they can be used both as types
 * and as runtime validators, which the CSV writer and the REST filter parser
 * both need.
 */

export const STATUS = ["active", "tobedeleted"] as const;
export type Status = (typeof STATUS)[number];

export const ORG_TYPE = [
  "department",
  "school",
  "district",
  "local",
  "state",
  "national",
] as const;
export type OrgType = (typeof ORG_TYPE)[number];

export const SESSION_TYPE = [
  "gradingPeriod",
  "semester",
  "schoolYear",
  "term",
] as const;
export type SessionType = (typeof SESSION_TYPE)[number];

export const CLASS_TYPE = ["homeroom", "scheduled"] as const;
export type ClassType = (typeof CLASS_TYPE)[number];

/**
 * v1.1 role vocabulary. v1.2 widens this considerably, but a consumer that
 * handles the v1.1 set and degrades unknown roles to least privilege is
 * correct against both.
 */
export const ROLE = [
  "administrator",
  "aide",
  "guardian",
  "parent",
  "proctor",
  "relative",
  "student",
  "teacher",
] as const;
export type Role = (typeof ROLE)[number];

export const ENROLLMENT_ROLE = [
  "administrator",
  "proctor",
  "student",
  "teacher",
] as const;
export type EnrollmentRole = (typeof ENROLLMENT_ROLE)[number];

/**
 * CEDS-aligned grade codes. Note that these are STRINGS: a consumer that
 * parses them as integers loses kindergarten, pre-K and ungraded settings.
 * The sandbox emits the full range deliberately so that bug surfaces early.
 */
export const GRADE = [
  "IT", // infant/toddler
  "PR", // preschool
  "PK", // prekindergarten
  "TK", // transitional kindergarten
  "KG", // kindergarten
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
  "13",
  "PS", // postsecondary
  "UG", // ungraded
  "Other",
] as const;
export type Grade = (typeof GRADE)[number];

export const SCORE_STATUS = [
  "exempt",
  "fully graded",
  "not submitted",
  "partially graded",
  "submitted",
] as const;
export type ScoreStatus = (typeof SCORE_STATUS)[number];

export const SEX = ["male", "female", "other", "unspecified"] as const;
export type Sex = (typeof SEX)[number];
