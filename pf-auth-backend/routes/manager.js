// const express = require('express');
// const router  = express.Router();
// const { supabase } = require('../lib/supabase');
// const auth  = require('../middlewares/auth');
// const cache = require('../services/cache');

// // GET /api/manager/tasks
// router.get('/tasks', auth, async (req, res) => {
//   try {
//     const page  = Math.max(1, parseInt(req.query.page  || '1'));
//     const limit = Math.min(200, parseInt(req.query.limit || '100'));
//     const from  = (page - 1) * limit;
//     const to    = from + limit - 1;

//     if (page === 1) {
//       const cached = cache.getManagerTasks();
//       if (cached) return res.json(cached);
//     }

//     const { data: tasks, error: tErr, count } = await supabase
//       .from('tasks')
//       .select('id,title,status,priority,created_at,assigned_to_email', { count: 'exact' })
//       .order('created_at', { ascending: false })
//       .range(from, to);

//     if (tErr) return res.status(500).json({ error: tErr.message });

//     let assignments = cache.getAssignments();
//     let departments = cache.getDepartments();

//     if (!assignments) {
//       const { data } = await supabase
//         .from('admin_assignments')
//         .select('user_email,department_id')
//         .eq('is_active', true);
//       assignments = data;
//       cache.setAssignments(data);
//     }

//     if (!departments) {
//       const { data } = await supabase.from('departments').select('id,name');
//       departments = data;
//       cache.setDepartments(data);
//     }

//     const assignmentMap = new Map(assignments.map(a => [a.user_email, a.department_id]));
//     const departmentMap = new Map(departments.map(d => [d.id, d.name]));

//     const result = {
//       data: tasks.map(task => ({
//         ...task,
//         department: departmentMap.get(assignmentMap.get(task.assigned_to_email)) || null,
//       })),
//       pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
//     };

//     if (page === 1) cache.setManagerTasks(result);

//     res.json(result);
//   } catch (err) {
//     console.error('Manager tasks crash:', err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// // PATCH /api/manager/update-task-status
// router.patch('/update-task-status', auth, async (req, res) => {
//   const { taskId, status, assignedToEmail } = req.body;

//   if (!taskId || !status)
//     return res.status(400).json({ error: 'taskId and status required' });

//   const { error } = await supabase
//     .from('tasks')
//     .update({ status })
//     .eq('id', taskId);

//   if (error) return res.status(500).json({ error: error.message });

//   cache.delManagerTasks();
//   if (assignedToEmail) cache.delTasks(assignedToEmail);

//   res.json({ success: true });
// });

// module.exports = router;

const express = require('express');
const router  = express.Router();
const { supabase } = require('../lib/supabase');
const auth  = require('../middlewares/auth');
const cache = require('../services/cache');

// GET /api/manager/tasks
router.get('/tasks', auth, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(50,  parseInt(req.query.limit || '20'));
    const from   = (page - 1) * limit;
    const to     = from + limit - 1;

    // Filter params from frontend
    const { status, department, memberEmail, search, dateFilter } = req.query;

    // Only cache page 1 with no filters applied
    const isUnfiltered = !status && !department && !memberEmail && !search && !dateFilter;
    if (page === 1 && isUnfiltered) {
      const cached = cache.getManagerTasks();
      if (cached) return res.json(cached);
    }

    // Build query
    let query = supabase
      .from('tasks')
      .select('id,title,status,priority,created_at,assigned_to_email', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Apply filters
    if (status && status !== 'all')  query = query.eq('status', status);
    if (memberEmail)                 query = query.eq('assigned_to_email', memberEmail);
    if (search)                      query = query.ilike('title', `%${search}%`);
    if (dateFilter)                  query = query.gte('created_at', `${dateFilter}T00:00:00`).lte('created_at', `${dateFilter}T23:59:59`);

    const { data: tasks, error: tErr, count } = await query;

    if (tErr) return res.status(500).json({ error: tErr.message });

    // Get assignments + departments (cached)
    let assignments = cache.getAssignments();
    let departments = cache.getDepartments();

    if (!assignments) {
      const { data } = await supabase
        .from('admin_assignments')
        .select('user_email,department_id')
        .eq('is_active', true);
      assignments = data || [];
      cache.setAssignments(assignments);
    }

    if (!departments) {
      const { data } = await supabase.from('departments').select('id,name');
      departments = data || [];
      cache.setDepartments(departments);
    }

    const assignmentMap = new Map(assignments.map(a => [a.user_email, a.department_id]));
    const departmentMap = new Map(departments.map(d => [d.id, d.name]));

    let enrichedTasks = tasks.map(task => ({
      ...task,
      department: departmentMap.get(assignmentMap.get(task.assigned_to_email)) || null,
    }));

    // Filter by department name (done after enrichment since dept is resolved from assignment)
    if (department) {
      const deptLower = department.toLowerCase().trim();
      enrichedTasks = enrichedTasks.filter(t => t.department?.toLowerCase().trim() === deptLower);
    }

    const result = {
      data: enrichedTasks,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit),
        hasMore: page < Math.ceil(count / limit),
      },
    };

    // Only cache unfiltered page 1
    if (page === 1 && isUnfiltered) cache.setManagerTasks(result);

    res.json(result);

  } catch (err) {
    console.error('Manager tasks crash:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/manager/update-task-status
router.patch('/update-task-status', auth, async (req, res) => {
  const { taskId, status, assignedToEmail } = req.body;

  if (!taskId || !status)
    return res.status(400).json({ error: 'taskId and status required' });

  const { error } = await supabase
    .from('tasks')
    .update({ status })
    .eq('id', taskId);

  if (error) return res.status(500).json({ error: error.message });

  cache.delManagerTasks();
  if (assignedToEmail) cache.delTasks(assignedToEmail);

  res.json({ success: true });
});

module.exports = router;