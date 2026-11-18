// Sample issues. `created`/`updated` are days before the seed runs, so the demo always looks current.
// Keys (TRK-n) are assigned in creation order.

/** @typedef {{ project: string, type: string, priority: string, status: string, resolution?: string,
 *   assignee?: string, reporter: string, labels?: string[], watchers?: string[], points?: number,
 *   created: number, updated: number, summary: string, description: string,
 *   comments?: [string, number, string][] }} IssueSpec */

/** @type {IssueSpec[]} */
export const ISSUES = [
  // ---------------------------------------------------------------- Mobile App
  {
    project: 'MOB', type: 'Epic', priority: 'High', status: 'In Progress', assignee: 'priya', reporter: 'hana',
    labels: ['offline'], watchers: ['alex', 'mei'], created: 41, updated: 2,
    summary: 'Offline-first job workflow',
    description: `Technicians lose signal in basements, plant rooms and rural sites. Every step of a job (open, checklist, photos, signature, complete) has to work offline and sync when the connection comes back.

**Scope**
- Queue writes locally with conflict detection
- Background sync with retry and backoff
- Clear "waiting to sync" state on every screen`,
    comments: [['hana', 30, 'Linked the customer interviews from Northwind and Acme in the research folder.'], ['priya', 2, 'Sync queue is in review; photos are the last big piece.']],
  },
  {
    project: 'MOB', type: 'Bug', priority: 'Highest', status: 'In Progress', assignee: 'priya', reporter: 'mei',
    labels: ['android', 'offline', 'regression'], watchers: ['alex', 'hana'], points: 5, created: 9, updated: 0,
    summary: 'Offline sync drops photo attachments when the app is closed mid-upload',
    description: `**Steps to reproduce**
1. Turn on airplane mode and complete a job with 3 photos
2. Turn airplane mode off and close the app while the upload banner shows
3. Reopen the app

**Expected:** all 3 photos upload.
**Actual:** the job syncs, but only the first photo arrives.

Seen on Android 14 (Pixel 7, Galaxy S23). Not reproducible on iOS.`,
    comments: [['mei', 8, 'Reproduced 4/5 times on the Pixel. Logs attached to the test run.'], ['priya', 1, 'The upload worker is cancelled with the activity. Moving it to WorkManager.']],
  },
  {
    project: 'MOB', type: 'Story', priority: 'High', status: 'In Review', assignee: 'aisha', reporter: 'hana',
    labels: ['ios', 'android', 'security'], watchers: ['alex'], points: 8, created: 26, updated: 1,
    summary: 'Sign in with Face ID or fingerprint',
    description: `As a technician I want to unlock the app with biometrics so I don't type my password with gloves on.

**Acceptance criteria**
- Opt-in from Settings after the first password sign-in
- Falls back to the password after 3 failed attempts
- Token stored in the Keychain / Android Keystore, never in plain storage`,
    comments: [['aisha', 3, 'PR is up. Android needs a device with a class 3 biometric sensor to test.'], ['mei', 1, 'Passing on iPhone 15 and Pixel 8. Testing the fallback path now.']],
  },
  {
    project: 'MOB', type: 'Bug', priority: 'High', status: 'Done', resolution: 'Done', assignee: 'priya', reporter: 'tom',
    labels: ['android'], points: 3, created: 34, updated: 20,
    summary: 'Crash when rotating the device on the signature screen',
    description: `Rotating the phone while the customer is signing crashes the app and the signature is lost.

Crash: \`IllegalStateException: Canvas already released\` in SignaturePad.`,
    comments: [['priya', 22, 'Fixed by keeping the stroke buffer in the view model. Released in 4.1.3.']],
  },
  {
    project: 'MOB', type: 'Story', priority: 'Medium', status: 'To Do', assignee: 'aisha', reporter: 'hana',
    labels: ['ios', 'android'], points: 5, created: 15, updated: 15,
    summary: 'Push notification when a job is reassigned to me',
    description: `When a dispatcher reassigns a job, the new technician should get a push notification within a minute.

**Acceptance criteria**
- Notification shows the customer and the scheduled time
- Tapping it opens the job`,
  },
  {
    project: 'MOB', type: 'Bug', priority: 'Medium', status: 'To Do', assignee: 'lucas', reporter: 'mei',
    labels: ['ux'], points: 2, created: 12, updated: 6,
    summary: 'Map pins overlap at low zoom levels',
    description: 'When more than ~20 jobs are in view, pins overlap and the nearest job is hard to tap. Cluster pins below zoom level 12.',
    comments: [['lucas', 6, 'Added a cluster style to the design file, ready for dev.']],
  },
  {
    project: 'MOB', type: 'Task', priority: 'Medium', status: 'In Progress', assignee: 'aisha', reporter: 'priya',
    labels: ['tech-debt'], points: 5, created: 18, updated: 3,
    summary: 'Upgrade to React Native 0.76',
    description: 'Upgrade from 0.73 and enable the New Architecture. The camera and maps libraries need new major versions.',
  },
  {
    project: 'MOB', type: 'Bug', priority: 'High', status: 'To Do', assignee: 'priya', reporter: 'tom',
    labels: ['ios', 'customer-reported'], watchers: ['tom'], points: 3, created: 7, updated: 7,
    summary: 'Barcode scanner fails in low light',
    description: 'Technicians in plant rooms cannot scan asset tags unless they use a torch. Turn on the flash automatically when the camera reports low light.',
  },
  {
    project: 'MOB', type: 'Story', priority: 'Medium', status: 'In Review', assignee: 'priya', reporter: 'hana',
    labels: ['ux'], points: 3, created: 21, updated: 2,
    summary: 'Show estimated travel time on the job list',
    description: 'Add drive time from the current location to each job on the "Today" list, using the maps SDK. Hide it when location permission is off.',
  },
  {
    project: 'MOB', type: 'Task', priority: 'Medium', status: 'To Do', assignee: 'lucas', reporter: 'hana',
    labels: ['accessibility'], points: 3, created: 10, updated: 10,
    summary: 'Accessibility audit of the checklist screens',
    description: 'Check screen reader labels, touch target sizes and contrast on the checklist and photo screens. Record findings as sub-tasks.',
  },
  {
    project: 'MOB', type: 'Bug', priority: 'Highest', status: 'In Progress', assignee: 'aisha', reporter: 'mei',
    labels: ['android', 'performance'], watchers: ['priya', 'alex'], points: 5, created: 6, updated: 1,
    summary: 'Battery drain from background location updates',
    description: `Users report 30–40% battery use per shift. Location is requested every 5 seconds even when no job is in progress.

Request updates only while a job is "On the way" and drop to significant-change updates otherwise.`,
    comments: [['mei', 5, 'Measured 34% over 8 hours on a Galaxy A54 with one job.'], ['aisha', 1, 'New location policy behind a feature flag in the beta build.']],
  },
  {
    project: 'MOB', type: 'Improvement', priority: 'Low', status: "Won't Do", resolution: "Won't Do", assignee: 'lucas', reporter: 'tom',
    labels: ['ux'], created: 29, updated: 19,
    summary: 'Let technicians reorder checklist items',
    description: 'Some customers asked for drag-to-reorder. Checklists come from compliance templates, so their order is fixed.',
    comments: [['hana', 19, "Closing: checklist order is part of the compliance template, so technicians shouldn't change it."]],
  },
  {
    project: 'MOB', type: 'Bug', priority: 'High', status: 'Done', resolution: 'Done', assignee: 'priya', reporter: 'mei',
    labels: ['regression'], points: 2, created: 24, updated: 16,
    summary: 'Duplicate jobs appear after pull-to-refresh',
    description: 'Pulling to refresh twice quickly shows every job twice until the app restarts. Regression from 4.1.0.',
  },
  {
    project: 'MOB', type: 'Task', priority: 'Low', status: 'Done', resolution: 'Done', assignee: 'lucas', reporter: 'hana',
    points: 1, created: 33, updated: 27,
    summary: 'App Store screenshots for 4.2',
    description: 'New screenshots for the job list, map and signature screens, in all six required sizes.',
  },
  {
    project: 'MOB', type: 'Story', priority: 'Medium', status: 'To Do', assignee: 'priya', reporter: 'hana',
    labels: ['ux'], points: 3, created: 4, updated: 4,
    summary: 'Customer signature in landscape mode',
    description: 'Signing on a phone in portrait is cramped. Allow landscape on the signature screen only.',
  },

  // ---------------------------------------------------------------- Web Platform
  {
    project: 'WEB', type: 'Epic', priority: 'High', status: 'In Progress', assignee: 'sam', reporter: 'hana',
    labels: ['security'], watchers: ['alex'], created: 40, updated: 3,
    summary: 'Single sign-on with Keycloak for enterprise tenants',
    description: `Enterprise customers want staff to sign in with their own identity provider.

**Scope**
- OIDC through Keycloak, one realm per tenant
- Just-in-time account creation
- Admin screen to map identity provider groups to roles`,
    comments: [['sam', 3, 'Realm-per-tenant works in staging. Group mapping is next.']],
  },
  {
    project: 'WEB', type: 'Bug', priority: 'Highest', status: 'In Progress', assignee: 'aisha', reporter: 'tom',
    labels: ['performance', 'backend', 'customer-reported'], watchers: ['sam', 'alex'], points: 8, created: 8, updated: 0,
    summary: 'Dashboard widgets take 20+ seconds to load for accounts with 10k+ jobs',
    description: `Contoso and Northwind (both 12k+ jobs) see the dashboard spinner for 20–40 seconds.

The "jobs by status" widget runs one aggregation per status instead of a single terms aggregation.`,
    comments: [['tom', 7, 'Contoso escalated this again today.'], ['aisha', 2, 'Single aggregation brings it to ~600ms on a copy of their data.'], ['sam', 0, 'Great, let\'s get it into Thursday\'s release.']],
  },
  {
    project: 'WEB', type: 'Story', priority: 'High', status: 'In Review', assignee: 'noah', reporter: 'hana',
    labels: ['frontend'], points: 5, created: 19, updated: 1,
    summary: 'Bulk edit job status from the job list',
    description: `Dispatchers close 50+ jobs at the end of the day one by one.

**Acceptance criteria**
- Select rows, then "Change status"
- Shows how many jobs will change and which can't (locked statuses)
- One undo for the whole change`,
  },
  {
    project: 'WEB', type: 'Bug', priority: 'Medium', status: 'To Do', assignee: 'noah', reporter: 'tom',
    labels: ['customer-reported'], points: 2, created: 11, updated: 11,
    summary: 'CSV export cuts off multi-line notes',
    description: 'Notes with line breaks end at the first line in the exported CSV. Quote fields that contain newlines.',
  },
  {
    project: 'WEB', type: 'Story', priority: 'High', status: 'To Do', assignee: 'sam', reporter: 'alex',
    labels: ['security'], points: 5, created: 13, updated: 13,
    summary: 'Audit log for permission changes',
    description: 'Record who changed a role or permission, when, and the before/after values. Admins can filter by user and date and export to CSV.',
  },
  {
    project: 'WEB', type: 'Task', priority: 'Medium', status: 'In Review', assignee: 'noah', reporter: 'sam',
    labels: ['frontend', 'tech-debt'], points: 3, created: 14, updated: 0,
    summary: 'Move issue fields to the SolidJS components',
    description: 'Replace sc-related-document on the issue form with the new SolidJS status, lookup and user pickers. Field names and stored values stay the same.',
    comments: [['noah', 1, 'Status, type, priority and assignee are done; the board is next.']],
  },
  {
    project: 'WEB', type: 'Task', priority: 'High', status: 'To Do', assignee: 'aisha', reporter: 'sam',
    labels: ['security', 'backend'], points: 3, created: 9, updated: 9,
    summary: 'Rate limiting for the public API',
    description: '100 requests per minute per API key, with `429` and a `Retry-After` header. Higher limits configurable per tenant.',
  },
  {
    project: 'WEB', type: 'Bug', priority: 'High', status: 'Done', resolution: 'Done', assignee: 'aisha', reporter: 'tom',
    labels: ['payments'], points: 2, created: 27, updated: 18,
    summary: 'Invoice PDF rounds tax incorrectly',
    description: 'Tax is rounded per line instead of on the total, so some invoices are off by a cent compared to the accounting export.',
  },
  {
    project: 'WEB', type: 'Story', priority: 'Medium', status: 'In Progress', assignee: 'lucas', reporter: 'hana',
    labels: ['onboarding', 'ux'], points: 5, created: 16, updated: 2,
    summary: 'Onboarding checklist for new admins',
    description: 'A checklist on the first sign-in: invite your team, import customers, create a job template, connect billing. Each item links to the right screen.',
  },
  {
    project: 'WEB', type: 'Improvement', priority: 'Low', status: 'To Do', assignee: 'noah', reporter: 'lucas',
    labels: ['accessibility'], points: 2, created: 5, updated: 5,
    summary: 'Keyboard shortcuts for the job view',
    description: '`e` to edit, `a` to assign, `s` to change status, `?` to list shortcuts.',
  },
  {
    project: 'WEB', type: 'Bug', priority: 'Highest', status: 'Done', resolution: 'Done', assignee: 'sam', reporter: 'tom',
    labels: ['payments', 'backend'], watchers: ['alex'], points: 5, created: 31, updated: 23,
    summary: 'Stripe webhook retries create duplicate payments',
    description: 'When our endpoint times out, Stripe retries the webhook and the payment is recorded twice. Make the handler idempotent on the event id.',
    comments: [['sam', 23, 'Deployed. Backfilled 14 duplicates and sent the list to finance.']],
  },
  {
    project: 'WEB', type: 'Bug', priority: 'Medium', status: 'In Review', assignee: 'noah', reporter: 'mei',
    labels: ['regression'], points: 2, created: 6, updated: 1,
    summary: 'Search ignores accented characters',
    description: 'Searching "Jose" doesn\'t find "José". Add ASCII folding to the search analyzer.',
  },
  {
    project: 'WEB', type: 'Improvement', priority: 'Low', status: 'Done', resolution: 'Done', assignee: 'lucas', reporter: 'hana',
    labels: ['ux'], points: 3, created: 36, updated: 25,
    summary: 'Dark theme for the admin console',
    description: 'Follow the operating system setting, with a toggle in the user menu.',
  },
  {
    project: 'WEB', type: 'Task', priority: 'Medium', status: 'To Do', assignee: 'aisha', reporter: 'sam',
    labels: ['tech-debt', 'backend'], points: 3, created: 17, updated: 17,
    summary: 'Upgrade the Elasticsearch client to 8.x',
    description: 'The 7.x client is end of life. Replace deprecated `type` parameters and test reindexing on staging.',
  },
  {
    project: 'WEB', type: 'Story', priority: 'Medium', status: 'To Do', assignee: 'sam', reporter: 'hana',
    labels: ['frontend'], points: 5, created: 3, updated: 3,
    summary: 'Saved filters on the job list',
    description: 'Let users save the current filters with a name and share them with their team.',
  },
  {
    project: 'WEB', type: 'Bug', priority: 'High', status: "Won't Do", resolution: 'Cannot Reproduce', assignee: 'noah', reporter: 'tom',
    labels: ['customer-reported'], created: 22, updated: 12,
    summary: 'Session expires while editing a long form',
    description: 'A customer lost a long job report after their session expired.',
    comments: [['noah', 14, 'Tried with 2h idle edits on Chrome, Edge and Safari. Drafts were restored every time.'], ['tom', 12, 'Customer could not reproduce after updating their browser. Closing.']],
  },

  // ---------------------------------------------------------------- Customer Support
  {
    project: 'SUP', type: 'Bug', priority: 'High', status: 'In Progress', assignee: 'tom', reporter: 'tom',
    labels: ['customer-reported'], watchers: ['sam'], points: 2, created: 5, updated: 0,
    summary: 'Acme Plumbing: password reset email never arrives',
    description: 'Three Acme users requested resets this week and received nothing. Their mail server rejects our sender domain (missing DKIM on the new mail provider).',
    comments: [['tom', 4, 'Confirmed with Acme IT: bounced for DKIM.'], ['sam', 0, 'DKIM record added, waiting for DNS to propagate.']],
  },
  {
    project: 'SUP', type: 'Story', priority: 'Medium', status: 'To Do', assignee: 'tom', reporter: 'tom',
    labels: ['customer-reported'], points: 3, created: 12, updated: 12,
    summary: 'Weekly technician timesheet export',
    description: 'Several customers export timesheets by hand every Monday. Schedule a weekly CSV email to the account owner.',
  },
  {
    project: 'SUP', type: 'Bug', priority: 'High', status: 'In Review', assignee: 'sam', reporter: 'tom',
    labels: ['customer-reported'], watchers: ['tom'], points: 3, created: 10, updated: 1,
    summary: 'Invoice emails land in spam for Outlook users',
    description: 'Outlook marks invoice emails as spam because the PDF link uses a URL shortener. Use our own domain for links.',
  },
  {
    project: 'SUP', type: 'Task', priority: 'Medium', status: 'Done', resolution: 'Done', assignee: 'tom', reporter: 'alex',
    created: 28, updated: 21,
    summary: 'Training session for the Northwind field team',
    description: 'Two-hour remote session covering the job list, offline mode and signatures. Recording shared with their team.',
  },
  {
    project: 'SUP', type: 'Task', priority: 'Low', status: 'Done', resolution: 'Done', assignee: 'mei', reporter: 'tom',
    created: 20, updated: 18,
    summary: 'How do I bulk import customers from Excel?',
    description: 'Customer question. Answered with the import template and the help article. Turned into a knowledge base task.',
  },
  {
    project: 'SUP', type: 'Bug', priority: 'Medium', status: 'To Do', assignee: 'tom', reporter: 'tom',
    labels: ['customer-reported'], points: 2, created: 8, updated: 8,
    summary: 'Job reminders use the wrong time zone for New Zealand customers',
    description: 'Reminders go out an hour early since daylight saving changed. The scheduler uses a fixed offset instead of the time zone.',
  },
  {
    project: 'SUP', type: 'Improvement', priority: 'Low', status: 'To Do', assignee: 'priya', reporter: 'tom',
    labels: ['onboarding'], points: 1, created: 16, updated: 16,
    summary: 'Help center links in the mobile app',
    description: 'Add a "Help" item to the app menu that opens the help center for the current screen.',
  },
  {
    project: 'SUP', type: 'Bug', priority: 'Highest', status: 'In Progress', assignee: 'tom', reporter: 'tom',
    labels: ['customer-reported'], watchers: ['sam', 'alex'], points: 3, created: 2, updated: 0,
    summary: 'Escalation: Contoso jobs stuck in "Scheduled"',
    description: 'Since yesterday 120 Contoso jobs stay "Scheduled" after technicians start them. The status update fails with a validation error on a custom field they added.',
    comments: [['tom', 1, 'Workaround sent: technicians can start the job from the web console.'], ['sam', 0, 'Root cause is the new required field. Patch going out today.']],
  },
  {
    project: 'SUP', type: 'Task', priority: 'Low', status: 'In Review', assignee: 'mei', reporter: 'tom',
    labels: ['offline'], points: 1, created: 9, updated: 2,
    summary: 'Knowledge base article: working offline',
    description: 'Explain what works offline, how to tell that a job is waiting to sync, and what to do if sync fails.',
  },
  {
    project: 'SUP', type: 'Task', priority: 'High', status: 'To Do', assignee: 'alex', reporter: 'tom',
    labels: ['security'], points: 2, created: 3, updated: 3,
    summary: 'Data deletion request from a former customer',
    description: 'A former customer asked us to delete their account and all job data under GDPR article 17. Confirm the retention policy and the deadline.',
  },
];
