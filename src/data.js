// Air Billing Self-Serve Roadmap — seed data.
// Months are columns; each area has items bucketed by month index.
// An item can carry nested sub-items (one level, rendered indented).
// IDs are stable so drag/drop + localStorage persistence can track them.

export const MONTHS = [
  "Aug 1", "Sept 1", "Oct 1", "Nov 1", "Dec 1",
  "Jan 1", "Feb 1", "Mar 1", "Apr 1", "May 1",
];

// Milestones gate specific months (index into MONTHS).
export const MILESTONES = [
  { id: "m1", monthIndex: 1, label: "Milestone 1", title: "PT & Ortho self-serve across core flows", date: "Sept 1" },
  { id: "m2", monthIndex: 4, label: "Milestone 2", title: "Navigation polished · Prompt/WebPT parity", date: "Dec 1" },
  { id: "m3", monthIndex: 7, label: "Milestone 3", title: "AI roadmap · Athena/eCW parity", date: "Mar 1" },
];

// Helper to make an item.
let _id = 0;
const it = (text, sub = []) => ({ id: `i${++_id}`, text, sub });

export const AREAS = [
  {
    id: "clinical",
    name: "Clinical",
    accent: "#6ee7b7", // mint
    meta: null,
    months: {
      0: [ // Aug 1
        it("Ortho Magic-Migrate"),
      ],
      1: [ // Sept 1
        it("Prior Auth Tracker"),
        it("Calendar — eligibility / PR explainability"),
        it("Medication, Imaging, Referral Order Sets"),
        it("Services / Billing UX"),
        it("Non-billable Notes"),
        it("Medication UX"),
        it("Scheduling by body part"),
        it("Lab alerting and results visibility"),
      ],
      4: [ // Dec 1
        it("Room Tracker Revamp"),
        it("Calendar UX improvements"),
        it("Injections"),
        it("Air CRM"),
        it("Smart charge capture config & deployment"),
        it("Care team fax workflows"),
        it("Provider Home Page"),
      ],
      7: [ // Mar 1
        it("Fax to lead-gen improvements"),
        it("Ortho auto-carry-forward logic"),
        it("Prior auth CMS-0057-F integrations"),
        it("Lab order sets"),
        it("Search optimization — CPT & ICD"),
        it("Multi-panel visit note"),
        it("Appointment type & case structure revamp"),
        it("Patient Intake forms expanded", ["Image annotation", "Eligibility"]),
        it("Actionable Patient Profile"),
        it("Exec dashboard — patient pipeline"),
        it("Multi-lingual patient comms"),
      ],
    },
  },
  {
    id: "workspaces",
    name: "Workspaces",
    accent: "#fca5a5", // coral
    meta: {
      subtitle: "Claims end-to-end → domain navigation",
      dris: ["Myles", "Elliot", "Lorenza", "Gopesh"],
    },
    months: {
      1: [ // Sept 1
        it("Biller Improvements — BOBA", [
          "Create custom payer groups",
          "Ability to defer a claim",
          "Ability to group claims by metadata",
          "Easily manage claims with “work queues”",
          "Claim context released to everyone (Appeals, Reasons, Attachments)",
          "[RAD] Appeal packet generation async + approve/submit",
          "Similar claims, Site feedback UI",
          "Bulk Actions",
          "Create Claim",
          "Activity Feed released to everyone",
          "AI Filters",
          "Banner with a date to deprecate all legacy pages",
        ]),
        it("Biller Experience — LCS", [
          "Override duplicate claim check",
          "Soft overrides on CHC verification errors",
          "Unify submission blockers into Balrog",
          "Submission Service Layer Cleanup",
          "Improve Claim Submission Time",
          "Improve Claim Duplicate Detection",
        ]),
        it("Front Office Experience — BOBA", ["Sunset old Appointments Page"]),
      ],
      2: [ // Oct 1
        it("Biller Experience — LCS", [
          "Provider Credentialing Matrix in Sync (confirm deadline w/ Gopesh + Sid)",
        ]),
        it("[R2P2] Initial Posting UX improvements"),
      ],
      4: [ // Dec 1
        it("Clean domain navigation (Analytics ↔ Workspace ↔ Automations; Workspace ↔ Workspace)"),
        it("Void claims"),
        it("Appointments Page → Workspaces"),
        it("Remittances Page → Workspaces", ["Provider Adjustment Support"]),
        it("Patient Profile → new workspace UI (Disputes view; Merge Patients)"),
        it("Claims Page", [
          "Prioritized sort",
          "Posting merged",
          "Delete claims",
          "AI Claim Summary",
          "Clinical docs",
        ]),
        it("Automated claim assignment config"),
        it("One-off 277 requests"),
      ],
      5: [ // Jan 1
        it("Biller Experience — LCS", [
          "Edit/Cancel Queued Claim Submission",
          "Balrog error clarity",
          "Actionable Errors",
          "Billing Rule Traceability",
          "PDF generation time is slow",
          "Bulk Download PDF services",
          "Global Balrog Rule Override",
        ]),
      ],
      7: [ // Mar 1
        it("Move Taskers to Insights"),
        it("Timely filing tracker for appeals"),
        it("Collaboration Suite", [
          "Automated task assignment",
          "Tasks ↔ workspace objects",
        ]),
        it("Authorization as a service", ["Prior Auth Submission Through Claims"]),
        it("Appeals", [
          "Status tracking",
          "Denial viz",
          "Automation → Claim Context",
        ]),
      ],
    },
  },
  {
    id: "reporting",
    name: "Reporting & Analytics",
    accent: "#93c5fd", // sky
    meta: {
      subtitle: "Libraries → AI builders → full loop",
      dris: ["Weiyang", "Aadit", "Suchi", "Tanmay + Suhas"],
    },
    months: {
      1: [ // Sept 1
        it("KPI Dashboard / Template Library V0", [
          "Financial",
          "Operational + Submissions Funnel (infra via Colossus — at risk for 8/1)",
          "Clinical",
        ]),
        it("Set targets"),
        it("Metric drill-down → workspace"),
        it("Custom Dashboard Builder", ["Metrics Library"]),
        it("Month-end close reports (RVPT)"),
      ],
      2: [ // Oct 1
        it("Template Library V1"),
        it("Schedule report download"),
        it("Continue adding metrics"),
      ],
      3: [ // Nov 1
        it("More Templates"),
        it("Manual Metric Builder"),
        it("Target management"),
      ],
      4: [ // Dec 1
        it("1-click month-end close"),
        it("AI metric builder"),
        it("AI report (template) builder ← cut?"),
      ],
      5: [ // Jan 1
        it("Sending scheduled reports"),
        it("Drill-down full loop (Metric → workspace → automation)"),
        it("Manual Practice Pulse — user flags"),
        it("Underpayment metrics"),
      ],
      6: [ // Feb 1
        it("Presentation deck export for leadership"),
      ],
      7: [ // Mar 1
        it("Modeling and levers", ["Forecasting"]),
        it("Deprecate EHR Reports"),
      ],
    },
  },
  {
    id: "automations",
    name: "Automations",
    accent: "#c4b5fd", // violet
    meta: {
      subtitle: "Patient → billing → Account → EHR sync",
      dris: ["Aryan", "Arkady", "Herui", "Gopesh", "Dhanvee"],
    },
    months: {
      1: [ // Sept 1
        it("Rules UI complete — build, test, promote", [
          "Billing", "Balrog", "Posting", "ARES", "Genesis",
        ]),
        it("Natural language rules"),
        it("Rules dry-run (>5 rules)"),
        it("Submit Rules / Rule Requests"),
        it("[Clinical] Lab alerting & results"),
        it("Automation primitives built", [
          "View pipeline/configuration/rules/dbs",
          "Pause/Start",
          "Historical runs",
          "Owners/contributors",
        ]),
        it("First Automation in App", [
          "Patient Statements redesign (Bad Debt / In Collections)",
        ]),
      ],
      2: [ // Oct 1
        it("All Data Tables in app", [
          "Fee Schedule", "Credentialing", "Payer mapping",
          "Portal Login Manager", "Adj types", "etc",
        ]),
        it("Void a payment (workspace item)"),
        it("More Automations visible — Billing", ["Claim Submissions"]),
      ],
      3: [ // Nov 1
        it("Patient Automations", [
          "PR Payment Plans", "Payment Refunds", "Pre-Visit Reminders",
          "Pre-Visit Check-In", "Pre-visit PR rules", "Text Blasts",
          "Payment plan failure alerting",
        ]),
        it("More core automations", [
          "Auto resubmission & appeals", "Partial Denials",
          "EOB scrapers", "EOB copilot", "Coverage & eligibility enrichment",
        ]),
        it("EHR Sync automations", ["Encounters"]),
      ],
      4: [ // Dec 1 — UPDATED VALUES
        it("Billing Automation", [
          "PR Generation",
          "Auto-ERA posting",
          "Posting Manual Review improved",
        ]),
        it("Accounting Automations", [
          "Deposit Matching",
          "Underpayment Detection",
        ]),
        it("Front office Automations", ["Scheduled Eligibility"]),
      ],
      5: [ // Jan 1
        it("Billing Automations", [
          "Appeals Automation",
          "Autosubmit — timely filing",
          "Automate WC submissions & recon",
        ]),
        it("Accounting Automations", [
          "Plaid / BAI2 Ingestion",
          "Remittances automation + BRTC mapping",
        ]),
        it("EHR Sync Automation", [
          "Appointments", "Patients", "Medical Records", "Patient Files",
        ]),
      ],
      6: [ // Feb 1
        it("Automated Rule Updates"),
        it("Approval-gated automations"),
        it("Accept the automation"),
      ],
      7: [ // Mar 1
        it("Collections Escalation agency integration"),
      ],
    },
  },
  {
    id: "onboarding",
    name: "Onboarding / Settings",
    accent: "#fcd34d", // amber
    meta: { dris: ["Dhanvee"] },
    months: {
      0: [ // Aug 1
        it("[push this out] Parent/child site solution V1", [
          "Claims page", "Rules", "Data", "Analytics",
        ]),
      ],
      1: [ // Sept 1
        it("Foundation — locations, hours, facilities"),
        it("My Practice — info, portals, EHR logins"),
        it("RBAC"),
        it("Configurable notifications"),
        it("Scheduling templates"),
        it("Data tables — Claims, Calendar, Appointments (Appointment Type; Calendar setup)"),
      ],
      3: [ // Nov 1
        it("EDIs/ERAs management/guides in app"),
      ],
      4: [ // Dec 1
        it("Custom template / form builder"),
        it("Password reset retool → Insights"),
        it("Add Taxonomy"),
        it("Parent / Child relationships"),
      ],
      7: [ // Mar 1
        it("User activity log / audit trail", ["+ Patient timeline view"]),
        it("Athelas Invoice & Billing — customizable"),
        it("Athelas POCs per Site"),
      ],
    },
  },
  {
    id: "collaboration",
    name: "Collaboration",
    accent: "#f9a8d4", // pink
    meta: { dris: ["Adit"] },
    months: {
      4: [ // Dec 1
        it("Collaboration Suite foundation", [
          "Notifications", "Messages + patient comms", "Tasking",
        ]),
      ],
      5: [ // Jan 1
        it("Mobile app"),
      ],
      7: [ // Mar 1
        it("2-way patient comms"),
        it("Tasking"),
        it("AI Agents"),
      ],
    },
  },
  {
    id: "rnd",
    name: "RnD",
    accent: "#67e8f9", // cyan
    meta: {
      subtitle: "Migration, AI pulse, orchestration",
      dris: ["Brian", "Adit"],
    },
    months: {
      0: [ // Aug 1
        it("Copilot Foundation", [
          "Satisfaction classifier",
          "Data interactions/refresh",
          "Simplify tool calls",
        ]),
        it("Biller gets an awesome LLM assistant", [
          "Denials summary and next steps",
          "New activity feed tool",
          "Compare similar/historical claims tool",
          "EOB transcription is delightful and fully self-serve",
          "Call a payer to solve a denial, see transcript in real time",
        ]),
      ],
      1: [ // Sept 1
        it("CFO gets an LLM assistant", [
          "Upload metrics → dashboard",
          "Drill into any metric with AI (whoop style) — NL responses on metrics",
          "Trend analysis — insights based on dashboard results",
          "Threshold alerts (Natural-language alerting)",
        ]),
      ],
      2: [ // Oct 1
        it("Front Office gets an LLM Assistant", [
          "AI Insurance card OCR",
          "One-off scrape elig from portal",
          "Explain this patient balance",
        ]),
      ],
      3: [ // Nov 1
        it("For Everyone — AI summary of tasks for the day", [
          "Appts Summary",
          "Claims/Tasks Summary",
          "Deposit Matching Summary",
        ]),
      ],
      4: [ // Dec 1
        it("Seamless migration & onboarding", [
          "Core Data — “found in your EHR”",
          "Billing Rules — “from your 835s”",
        ]),
        it("AI suggested rule generation"),
      ],
      6: [ // Feb 1
        it("AI Practice Pulse", ["surface signals, opportunities and outcomes"]),
      ],
      7: [ // Mar 1
        it("AI orchestration + skills manager", [
          "Hand off tasks to AI (Hydra; Page)",
          "Follow up with patient for insurance",
        ]),
      ],
    },
  },
  {
    id: "product",
    name: "Product",
    accent: "#fdba74", // orange
    meta: { dris: ["Sean"] },
    months: {
      0: [ // Aug 1
        it("Onboarding experience is fully designed"),
        it("Beta Program Designed", [
          "What do we expect from our customer?",
          "What should the customer expect from us?",
        ]),
        it("Documentation and guides"),
        it("Marketing material and feature set"),
      ],
      1: [ // Sept 1
        it("Demo env is ready for beta users", ["With sandbox environment"]),
        it("Full documentation presented on beta program, where ops is in the loop"),
      ],
    },
  },
];

// Build the initial board state from AREAS.
export function seedBoard() {
  return {
    months: MONTHS,
    milestones: MILESTONES,
    areas: AREAS.map((a) => ({
      ...a,
      months: { ...a.months },
    })),
  };
}

/* ---------- @-mention entities ---------- */
export const TEAMS = [
  { key: "SPOT", color: "#2f9e44" },
  { key: "BOBA", color: "#dc2626" },
  { key: "DRGN", color: "#4f46e5" },
  { key: "LCS", color: "#0891b2" },
  { key: "ARES", color: "#d97706" },
  { key: "Balrog", color: "#7c3aed" },
  { key: "Genesis", color: "#059669" },
  { key: "Colossus", color: "#be185d" },
  { key: "Hydra", color: "#0d9488" },
];

export const PEOPLE = [
  "Arkady", "Aryan", "Herui", "Gopesh", "Dhanvee",
  "Myles", "Elliot", "Lorenza", "Weiyang", "Aadit",
  "Suchi", "Tanmay", "Suhas", "Brian", "Adit", "Sean", "Sid",
];

export const STATUSES = [
  { key: "Planned", color: "#6b7280", dot: "#9ca3af" },
  { key: "In progress", color: "#2563eb", dot: "#60a5fa" },
  { key: "At risk", color: "#d97706", dot: "#fbbf24" },
  { key: "Blocked", color: "#dc2626", dot: "#f87171" },
  { key: "Done", color: "#059669", dot: "#34d399" },
];

// Relative dates resolve against "today" passed in at runtime (so the file
// stays deterministic). Each returns { label, monthIndex|null } — monthIndex
// drives auto-positioning when a date is attached.
export const REL_DATES = [
  "Today", "Tomorrow", "Next week", "End of month",
  ...MONTHS, // the 10 roadmap columns are also pickable dates
];

// Map a chosen date label to a month column index (for auto-positioning).
// MONTHS labels match 1:1; relative ones map to the nearest roadmap month
// based on a provided "current month index" (caller supplies it).
export function dateToMonthIndex(label, currentMonthIdx = 0) {
  const exact = MONTHS.indexOf(label);
  if (exact >= 0) return exact;
  switch (label) {
    case "Today":
    case "Tomorrow":
    case "End of month":
      return currentMonthIdx;
    case "Next week":
      return Math.min(currentMonthIdx + 1, MONTHS.length - 1);
    default:
      return null;
  }
}
