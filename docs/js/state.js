// Shared app state. Modules import this object and read/write its fields directly.
export const state = {
  eventList: [],
  currentMeta: null,
  currentReport: null,
  currentCurated: null,  // curated run sheet {template, days: [{date, title, items}]}
  curatedFile: null,
  isDirty: false,
  editing: null,         // {day, item} or {day, isNew: true}
  currentStatus: null,   // vendor contract/payment overlay {updated, vendors}
  statusFile: null,
  statusDirty: false,
};
