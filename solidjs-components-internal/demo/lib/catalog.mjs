// Reference data for the demo: workflow, issue types, priorities, resolutions, labels, people, projects.

/** Jira's default workflow plus "Won't Do". `locked` statuses make the issue read-only (SDMS disableItemBool). */
export const STATUSES = [
  { name: 'To Do', color: '#7c7f8f', category: 'todo' },
  { name: 'In Progress', color: '#3e63dd', category: 'inprogress' },
  { name: 'In Review', color: '#8e4ec6', category: 'inprogress' },
  { name: 'Done', color: '#2f9e5b', category: 'done' },
  { name: "Won't Do", color: '#a1a1aa', category: 'done', locked: true },
];

/** Allowed moves, by status name (used by <solid-issue-status> and the board rule). */
export const TRANSITIONS = {
  'To Do': ['In Progress', "Won't Do"],
  'In Progress': ['To Do', 'In Review', 'Done'],
  'In Review': ['In Progress', 'Done'],
  Done: ['In Progress'],
  "Won't Do": ['To Do'],
};

export const TYPES = ['Epic', 'Story', 'Task', 'Bug', 'Improvement'];
export const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
export const RESOLUTIONS = ['Done', "Won't Do", 'Duplicate', 'Cannot Reproduce'];
export const LABELS = [
  'frontend', 'backend', 'ios', 'android', 'performance', 'security', 'ux', 'accessibility',
  'payments', 'onboarding', 'offline', 'regression', 'tech-debt', 'customer-reported',
];

/** People; `admin` also gets the admin menu and the key to account security documents. */
export const PEOPLE = [
  { key: 'alex', first: 'Alex', last: 'Morgan', title: 'Engineering Manager', admin: true, projects: ['MOB', 'WEB', 'SUP'] },
  { key: 'priya', first: 'Priya', last: 'Natarajan', title: 'Mobile Lead', projects: ['MOB', 'SUP'] },
  { key: 'sam', first: 'Sam', last: 'Okafor', title: 'Web Platform Lead', projects: ['WEB', 'SUP'] },
  { key: 'mei', first: 'Mei', last: 'Chen', title: 'QA Engineer', projects: ['MOB', 'WEB', 'SUP'] },
  { key: 'lucas', first: 'Lucas', last: 'Ferreira', title: 'Product Designer', projects: ['MOB', 'WEB'] },
  { key: 'hana', first: 'Hana', last: 'Kobayashi', title: 'Product Manager', projects: ['MOB', 'WEB'] },
  { key: 'tom', first: 'Tom', last: 'Becker', title: 'Support Lead', projects: ['SUP'] },
  { key: 'aisha', first: 'Aisha', last: 'Rahman', title: 'Backend Engineer', projects: ['MOB', 'WEB'] },
  { key: 'noah', first: 'Noah', last: 'Williams', title: 'Frontend Engineer', projects: ['WEB'] },
];

export const emailOf = (person) => `${person.first}.${person.last}@example.com`.toLowerCase();

export const PROJECTS = [
  {
    key: 'MOB',
    name: 'Mobile App',
    lead: 'priya',
    description:
      'The technician app for iOS and Android: job lists, checklists, photos, customer signatures and offline sync.',
  },
  {
    key: 'WEB',
    name: 'Web Platform',
    lead: 'sam',
    description: 'The admin console, dashboards, billing, single sign-on and the public API.',
  },
  {
    key: 'SUP',
    name: 'Customer Support',
    lead: 'tom',
    description: 'Problems and requests reported by customers, escalations and support tasks.',
  },
];
