// =============================================================================
// SAMPLE DATA — Stage 1 only
// -----------------------------------------------------------------------------
// Every page reads its data from THIS file so the interface can be clicked
// through before the database exists. In Stage 2 these arrays are replaced by
// Supabase queries; nothing else in the UI should need to know the difference.
//
// Nothing here is saved. Changes made on a page are lost on reload.
// =============================================================================

// Dates are relative to "today" so due / overdue labels always look realistic.
const DAY = 24 * 60 * 60 * 1000;
const today = new Date();
today.setHours(9, 0, 0, 0);
const daysFromToday = (n) => new Date(today.getTime() + n * DAY).toISOString();

export const categories = [
  "Microscopes",
  "Electronics",
  "Measurement",
  "Glassware",
  "Computing",
  "Audio-Visual",
];

export const equipment = [
  {
    id: "eq-01", tag: "SV-EQ-0001", name: "Compound Microscope", category: "Microscopes",
    location: "Bio Lab · Cabinet A", total: 12, available: 8, condition: "Good",
    components: ["Microscope body", "10x eyepiece", "Objective lenses (4x/10x/40x)", "Dust cover", "Power cable"],
    photo: null,
  },
  {
    id: "eq-02", tag: "SV-EQ-0002", name: "Digital Multimeter", category: "Electronics",
    location: "Physics Lab · Drawer 3", total: 20, available: 15, condition: "Good",
    components: ["Multimeter unit", "Red test lead", "Black test lead", "9V battery", "Carry pouch"],
    photo: null,
  },
  {
    id: "eq-03", tag: "SV-EQ-0003", name: "Arduino Uno Starter Kit", category: "Electronics",
    location: "Robotics Room · Shelf 2", total: 15, available: 2, condition: "Good",
    components: ["Arduino Uno board", "USB cable", "Breadboard", "Jumper wire set", "Component box"],
    photo: null,
  },
  {
    id: "eq-04", tag: "SV-EQ-0004", name: "Vernier Caliper", category: "Measurement",
    location: "Physics Lab · Drawer 1", total: 25, available: 21, condition: "Good",
    components: ["Caliper", "Protective case"],
    photo: null,
  },
  {
    id: "eq-05", tag: "SV-EQ-0005", name: "Digital Weighing Scale", category: "Measurement",
    location: "Chem Lab · Bench 4", total: 6, available: 0, condition: "Good",
    components: ["Scale unit", "Draft shield", "Calibration weight", "Power adapter"],
    photo: null,
  },
  {
    id: "eq-06", tag: "SV-EQ-0006", name: "Beaker Set (250–1000 mL)", category: "Glassware",
    location: "Chem Lab · Cabinet C", total: 30, available: 24, condition: "Good",
    components: ["250 mL beaker", "500 mL beaker", "1000 mL beaker"],
    photo: null,
  },
  {
    id: "eq-07", tag: "SV-EQ-0007", name: "Laptop — Lab Issue", category: "Computing",
    location: "IT Office · Locker 1–10", total: 10, available: 4, condition: "Fair",
    components: ["Laptop", "Charger", "Laptop sleeve"],
    photo: null,
  },
  {
    id: "eq-08", tag: "SV-EQ-0008", name: "Portable Projector", category: "Audio-Visual",
    location: "AV Room · Rack 1", total: 4, available: 3, condition: "Good",
    components: ["Projector", "HDMI cable", "Power cable", "Remote control", "Carry bag"],
    photo: null,
  },
  {
    id: "eq-09", tag: "SV-EQ-0009", name: "Oscilloscope (2-Channel)", category: "Electronics",
    location: "Physics Lab · Bench 2", total: 5, available: 1, condition: "Needs repair",
    components: ["Oscilloscope", "Probe x2", "Power cable"],
    photo: null,
  },
];

export const students = [
  { id: "st-01", studentNo: "2024-00117", name: "Maria Santos", course: "BS Biology", year: 2, email: "maria.santos@school.edu" },
  { id: "st-02", studentNo: "2023-00452", name: "John Reyes", course: "BS Electronics Eng.", year: 3, email: "john.reyes@school.edu" },
  { id: "st-03", studentNo: "2025-00031", name: "Aisha Khan", course: "BS Chemistry", year: 1, email: "aisha.khan@school.edu" },
  { id: "st-04", studentNo: "2022-00888", name: "Daniel Cruz", course: "BS Computer Science", year: 4, email: "daniel.cruz@school.edu" },
  { id: "st-05", studentNo: "2024-00309", name: "Lena Park", course: "BS Physics", year: 2, email: "lena.park@school.edu" },
];

export const admins = [
  { id: "ad-01", name: "Prof. Alan Ramos", email: "a.ramos@school.edu", role: "Lab Administrator" },
];

// status is derived in app.js (active / overdue / returned), not stored.
export const transactions = [
  {
    id: "tx-1042", studentId: "st-02", equipmentId: "eq-03", quantity: 2,
    borrowedAt: daysFromToday(-9), dueAt: daysFromToday(-2), returnedAt: null,
    checklistOut: ["Arduino Uno board", "USB cable", "Breadboard", "Jumper wire set", "Component box"],
    checklistIn: null, notes: "",
  },
  {
    id: "tx-1043", studentId: "st-01", equipmentId: "eq-01", quantity: 1,
    borrowedAt: daysFromToday(-3), dueAt: daysFromToday(1), returnedAt: null,
    checklistOut: ["Microscope body", "10x eyepiece", "Objective lenses (4x/10x/40x)", "Dust cover", "Power cable"],
    checklistIn: null, notes: "",
  },
  {
    id: "tx-1044", studentId: "st-04", equipmentId: "eq-07", quantity: 1,
    borrowedAt: daysFromToday(-2), dueAt: daysFromToday(5), returnedAt: null,
    checklistOut: ["Laptop", "Charger", "Laptop sleeve"],
    checklistIn: null, notes: "",
  },
  {
    id: "tx-1045", studentId: "st-03", equipmentId: "eq-05", quantity: 1,
    borrowedAt: daysFromToday(-1), dueAt: daysFromToday(0), returnedAt: null,
    checklistOut: ["Scale unit", "Draft shield", "Calibration weight", "Power adapter"],
    checklistIn: null, notes: "",
  },
  {
    id: "tx-1046", studentId: "st-05", equipmentId: "eq-02", quantity: 3,
    borrowedAt: daysFromToday(-1), dueAt: daysFromToday(6), returnedAt: null,
    checklistOut: ["Multimeter unit", "Red test lead", "Black test lead", "9V battery", "Carry pouch"],
    checklistIn: null, notes: "Group activity — Lab 4",
  },
  {
    id: "tx-1038", studentId: "st-01", equipmentId: "eq-04", quantity: 1,
    borrowedAt: daysFromToday(-14), dueAt: daysFromToday(-7), returnedAt: daysFromToday(-8),
    checklistOut: ["Caliper", "Protective case"],
    checklistIn: ["Caliper", "Protective case"], notes: "",
  },
  {
    id: "tx-1039", studentId: "st-02", equipmentId: "eq-09", quantity: 1,
    borrowedAt: daysFromToday(-12), dueAt: daysFromToday(-5), returnedAt: daysFromToday(-4),
    checklistOut: ["Oscilloscope", "Probe x2", "Power cable"],
    checklistIn: ["Oscilloscope", "Power cable"], notes: "One probe missing — reported to lab head.",
  },
  {
    id: "tx-1040", studentId: "st-04", equipmentId: "eq-08", quantity: 1,
    borrowedAt: daysFromToday(-6), dueAt: daysFromToday(-5), returnedAt: daysFromToday(-5),
    checklistOut: ["Projector", "HDMI cable", "Power cable", "Remote control", "Carry bag"],
    checklistIn: ["Projector", "HDMI cable", "Power cable", "Remote control", "Carry bag"], notes: "",
  },
  {
    id: "tx-1041", studentId: "st-03", equipmentId: "eq-06", quantity: 2,
    borrowedAt: daysFromToday(-4), dueAt: daysFromToday(-1), returnedAt: daysFromToday(-1),
    checklistOut: ["250 mL beaker", "500 mL beaker", "1000 mL beaker"],
    checklistIn: ["250 mL beaker", "500 mL beaker", "1000 mL beaker"], notes: "",
  },
];

// Lookup helpers ---------------------------------------------------------------
export const findEquipment = (id) => equipment.find((e) => e.id === id);
export const findStudent = (id) => students.find((s) => s.id === id);
export const findStudentByNumber = (no) =>
  students.find((s) => s.studentNo === no.trim());

// In Stage 1 the "signed in" student for the student portal is fixed.
export const previewStudentId = "st-01";
