import { parseWindows } from "./agreements.mjs";

export const TOPICS = ["infrastructure", "security", "data", "design", "writing", "legal", "wellbeing"];
export const SKILLS = ["kubernetes", "networking", "incident-response", "postgres", "gdpr", "accessibility", "react", "copywriting", "contracts", "spanish", "counseling"];

const v = (id, name, skills, topics, windows, minUrgency, maxPerDay, breakthrough, replyMin) => ({
  id, name, skills, replyMin,
  agreement: { topics, windows: parseWindows(windows), minUrgency, maxPerDay, breakthrough },
});

export const seedVolunteers = () => [
  v("ana", "Ana Reyes", ["kubernetes", "networking", "incident-response"], ["infrastructure", "security"], "Mon-Fri 09:00-17:00", "normal", 4, true, 15),
  v("dev", "Dev Okafor", ["postgres", "incident-response", "gdpr"], ["security", "data"], "Mon-Thu 18:00-22:00; Sat 10:00-14:00", "high", 2, false, 30),
  v("mei", "Mei Tanaka", ["accessibility", "react", "copywriting"], ["design", "writing"], "Mon-Fri 12:00-14:00; Sat-Sun 09:00-12:00", "low", 6, false, 60),
  v("luis", "Luis Ortega", ["gdpr", "contracts", "spanish"], ["legal"], "Tue,Thu 10:00-16:00", "normal", 3, false, 120),
  v("priya", "Priya Nair", ["postgres", "networking", "kubernetes"], ["infrastructure", "data"], "Mon-Sun 22:00-06:00", "high", 3, true, 20),
  v("sam", "Sam Whitfield", ["counseling", "copywriting", "spanish"], ["wellbeing", "writing"], "Mon-Sun 08:00-10:00; Mon-Fri 19:00-21:00", "normal", 2, true, 10),
];
