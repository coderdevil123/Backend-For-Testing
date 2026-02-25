const NodeCache = require('node-cache');

const shortCache  = new NodeCache({ stdTTL: 900   }); // 15 min
const mediumCache = new NodeCache({ stdTTL: 1800  }); // 30 min
const longCache   = new NodeCache({ stdTTL: 3600  }); // 1 hour

const cacheService = {
  // Tasks (short TTL, per-user)
  getTasks(email)       { return shortCache.get(`tasks:${email}`); },
  setTasks(email, data) { shortCache.set(`tasks:${email}`, data); },
  delTasks(email)       { shortCache.del(`tasks:${email}`); },

  // Manager tasks (short TTL, shared)
  getManagerTasks()     { return shortCache.get('manager_tasks'); },
  setManagerTasks(data) { shortCache.set('manager_tasks', data); },
  delManagerTasks()     { shortCache.del('manager_tasks'); },

  // Announcements (medium TTL, per-user)
  getAnnouncements(email)       { return mediumCache.get(`announcements:${email}`); },
  setAnnouncements(email, data) { mediumCache.set(`announcements:${email}`, data); },
  delAnnouncements(email)       { mediumCache.del(`announcements:${email}`); },

  // Team (medium TTL, shared)
  getTeam()      { return mediumCache.get('team'); },
  setTeam(data)  { mediumCache.set('team', data); },
  delTeam()      { mediumCache.del('team'); },

  // Assignments (medium TTL, shared)
  getAssignments()      { return mediumCache.get('assignments'); },
  setAssignments(data)  { mediumCache.set('assignments', data); },
  delAssignments()      { mediumCache.del('assignments'); },

  // Departments (long TTL)
  getDepartments()      { return longCache.get('departments'); },
  setDepartments(data)  { longCache.set('departments', data); },
  delDepartments()      { longCache.del('departments'); },

  // Roles (long TTL)
  getRoles()      { return longCache.get('roles'); },
  setRoles(data)  { longCache.set('roles', data); },
  delRoles()      { longCache.del('roles'); },

  // Tools (long TTL)
  getTools()      { return longCache.get('tools'); },
  setTools(data)  { longCache.set('tools', data); },
  delTools()      { longCache.del('tools'); },

  flushAll() {
    shortCache.flushAll();
    mediumCache.flushAll();
    longCache.flushAll();
    console.log('[Cache] All caches flushed');
  },
};

module.exports = cacheService;