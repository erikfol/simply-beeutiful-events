// Shared app state. Modules import this object and read/write its fields directly.
export const state = {
  eventList: [],
  currentMeta: null,
  currentReport: null,
  currentCurated: null,  // curated run sheet {template, days: [{date, title, items}]}
  curatedFile: null,
  isDirty: false,
  editing: null,         // {day, item} or {day, isNew: true}
  viewRole: '',          // '' = full timeline, else a role key from roles.js
  currentStatus: null,   // vendor contract/payment overlay {updated, vendors}
  statusFile: null,
  statusDirty: false,
  corrections: {},       // planner corrections to facts read from documents
  details: {},           // event details the planner typed in (couple, venue, guest count…)
  rawTimeline: [],       // demo/local events: dated mentions before corrections
  driveFiles: [],        // Drive events: the event's files
  readingCache: null,    // Drive events: cached reading results per file
  reading: null,         // Drive events: {done, total} while documents are being read
};
