/**
 * Name pools. Deliberately varied, because a roster consumer that assumes
 * ASCII, single-word family names or a fixed name length breaks on real
 * district data.
 */
export const GIVEN_NAMES = [
  "Aaliyah", "Aiden", "Amara", "Andres", "Anika", "Antoine", "Aria", "Arjun",
  "Bianca", "Brandon", "Camila", "Carlos", "Chloe", "Damian", "Daniela",
  "DeAndre", "Elena", "Eli", "Emeka", "Emma", "Fatima", "Gabriel", "Grace",
  "Hana", "Hassan", "Imani", "Isabella", "Jamal", "Jasmine", "Javier", "Jin",
  "Jordan", "Kai", "Keisha", "Kenji", "Leila", "Liam", "Lucia", "Malik",
  "Maria", "Mateo", "Maya", "Mohammed", "Nadia", "Nathan", "Nia", "Noah",
  "Olivia", "Omar", "Priya", "Rafael", "Rania", "Ravi", "Rosa", "Samuel",
  "Sofia", "Tariq", "Thandiwe", "Tomas", "Valentina", "Wei", "Xiomara",
  "Yusuf", "Zainab", "Zoe",
] as const;

export const FAMILY_NAMES = [
  "Abebe", "Acosta", "Adeyemi", "Alvarez", "Anderson", "Bautista", "Bennett",
  "Chen", "Choi", "Cisneros", "Coleman", "Delgado", "Diallo", "Dubois",
  "Fernandez", "Fitzgerald", "Garcia", "Gonzalez", "Grant", "Gupta",
  "Hernandez", "Hoffman", "Ibrahim", "Jackson", "Jimenez", "Johnson", "Kaur",
  "Khan", "Kim", "Kowalski", "Lam", "Larsen", "Lopez", "Mahmoud", "Martinez",
  "Mbeki", "Mendoza", "Mitchell", "Nakamura", "Nguyen", "Nowak", "Okafor",
  "O'Brien", "Olsen", "Ortiz", "Patel", "Pereira", "Ramirez", "Reyes",
  "Rodriguez", "Rossi", "Santos", "Sharma", "Silva", "Singh", "Sullivan",
  "Tanaka", "Thompson", "Torres", "Tran", "Vargas", "Vasquez", "Wallace",
  "Washington", "Williams", "Wright", "Yamamoto", "Zhang",
] as const;

export const SCHOOL_STEMS = [
  "Alder Creek", "Belmont", "Briarwood", "Cedar Ridge", "Clearwater",
  "Eastview", "Fairfield", "Franklin", "Glenwood", "Harborview", "Hillcrest",
  "Kingsley", "Lakeside", "Lincoln", "Maple Grove", "Meadowbrook",
  "Northgate", "Oakmont", "Pinehurst", "Riverbend", "Roosevelt", "Sandalwood",
  "Silver Lake", "Springdale", "Stonebridge", "Sunnyside", "Westfield",
  "Whitmore", "Willow Park", "Woodland",
] as const;

export const ELEMENTARY_SUBJECTS = [
  "Mathematics", "English Language Arts", "Science", "Social Studies",
] as const;

export const SECONDARY_COURSES = [
  { title: "Algebra I", code: "MAT101", subject: "Mathematics", grades: ["08", "09"] },
  { title: "Geometry", code: "MAT201", subject: "Mathematics", grades: ["09", "10"] },
  { title: "Algebra II", code: "MAT301", subject: "Mathematics", grades: ["10", "11"] },
  { title: "Pre-Calculus", code: "MAT401", subject: "Mathematics", grades: ["11", "12"] },
  { title: "Biology", code: "SCI201", subject: "Science", grades: ["09", "10"] },
  { title: "Chemistry", code: "SCI301", subject: "Science", grades: ["10", "11"] },
  { title: "Physics", code: "SCI401", subject: "Science", grades: ["11", "12"] },
  { title: "English 9", code: "ELA109", subject: "English Language Arts", grades: ["09"] },
  { title: "English 10", code: "ELA110", subject: "English Language Arts", grades: ["10"] },
  { title: "US History", code: "SOC201", subject: "Social Studies", grades: ["10", "11"] },
  { title: "World History", code: "SOC101", subject: "Social Studies", grades: ["09"] },
  { title: "Spanish I", code: "WLG101", subject: "World Languages", grades: ["09", "10"] },
  { title: "Physical Education", code: "PED101", subject: "Physical Education", grades: ["09", "10", "11", "12"] },
  { title: "Introduction to Computer Science", code: "CTE201", subject: "Computer Science", grades: ["10", "11", "12"] },
] as const;

export const MIDDLE_COURSES = [
  { title: "Mathematics 6", code: "MAT006", subject: "Mathematics", grades: ["06"] },
  { title: "Mathematics 7", code: "MAT007", subject: "Mathematics", grades: ["07"] },
  { title: "Mathematics 8", code: "MAT008", subject: "Mathematics", grades: ["08"] },
  { title: "Science 6", code: "SCI006", subject: "Science", grades: ["06"] },
  { title: "Science 7", code: "SCI007", subject: "Science", grades: ["07"] },
  { title: "Science 8", code: "SCI008", subject: "Science", grades: ["08"] },
  { title: "English 6", code: "ELA006", subject: "English Language Arts", grades: ["06"] },
  { title: "English 7", code: "ELA007", subject: "English Language Arts", grades: ["07"] },
  { title: "English 8", code: "ELA008", subject: "English Language Arts", grades: ["08"] },
  { title: "Social Studies 6", code: "SOC006", subject: "Social Studies", grades: ["06"] },
  { title: "Social Studies 7", code: "SOC007", subject: "Social Studies", grades: ["07"] },
  { title: "Social Studies 8", code: "SOC008", subject: "Social Studies", grades: ["08"] },
] as const;

/**
 * Sections that exist in every real SIS and are not instructional. A consumer
 * that shows these to teachers as classes looks broken on day one.
 */
export const GHOST_SECTIONS = [
  "DO NOT USE",
  "Study Hall",
  "Homeroom - Unassigned",
  "TEST SECTION - IGNORE",
  "Lunch",
] as const;
