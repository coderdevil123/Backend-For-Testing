// const express = require('express');
// const router = express.Router();
// const { supabase } = require('../lib/supabase');
// const auth = require('../middlewares/auth');

// /**
//  * GET /api/manager/tasks
//  * Manager can see ALL tasks (filter frontend handles)
//  */
// // router.get('/tasks', auth, async (req, res) => {
// //   try {
// //     // 1️⃣ Get all tasks
// //     const { data: tasks, error: tErr } = await supabase
// //       .from('tasks')
// //       .select(`
// //         id,
// //         title,
// //         status,
// //         priority,
// //         created_at,
// //         assigned_to_email
// //       `)
// //       .order('created_at', { ascending: false });

// //     if (tErr) {
// //       console.error('Tasks error:', tErr);
// //       return res.status(500).json({ error: tErr.message });
// //     }

// //     // 2️⃣ Get active admin assignments
// //     const { data: assignments, error: aErr } = await supabase
// //       .from('admin_assignments')
// //       .select('user_email, department_id')
// //       .eq('is_active', true);

// //     if (aErr) {
// //       console.error('Assignments error:', aErr);
// //       return res.status(500).json({ error: aErr.message });
// //     }

// //     // 3️⃣ Get departments table
// //     const { data: departments, error: dErr } = await supabase
// //       .from('departments')
// //       .select('id, name');

// //     if (dErr) {
// //       console.error('Departments error:', dErr);
// //       return res.status(500).json({ error: dErr.message });
// //     }

// //     // 4️⃣ Create maps
// //     const assignmentMap = new Map(
// //       assignments.map(a => [a.user_email, a.department_id])
// //     );

// //     const departmentMap = new Map(
// //       departments.map(d => [d.id, d.name])
// //     );

// //     // 5️⃣ Merge department into tasks
// //     const result = tasks.map(task => {
// //       const deptId = assignmentMap.get(task.assigned_to_email);
// //       const deptName = deptId ? departmentMap.get(deptId) : null;

// //       return {
// //         ...task,
// //         department: deptName || null
// //       };
// //     });

// //     res.json(result);

// //   } catch (err) {
// //     console.error('Manager tasks crash:', err);
// //     res.status(500).json({ error: 'Server error' });
// //   }
// // });
// const cache = require('../services/cache');

// router.get('/tasks', auth, async (req, res) => {
//   try {
//     const cached = cache.get('manager_tasks');
//     if (cached) return res.json(cached);

//     const { data: tasks, error: tErr } = await supabase
//       .from('tasks')
//       .select('id,title,status,priority,created_at,assigned_to_email')
//       .order('created_at', { ascending: false })
//       .limit(200);   // 🔥 IMPORTANT (never unlimited)

//     if (tErr)
//       return res.status(500).json({ error: tErr.message });

//     let assignments = cache.get('assignments');
//     let departments = cache.get('departments');

//     if (!assignments) {
//       const { data } = await supabase
//         .from('admin_assignments')
//         .select('user_email, department_id')
//         .eq('is_active', true);

//       assignments = data;
//       cache.set('assignments', data);
//     }

//     if (!departments) {
//       const { data } = await supabase
//         .from('departments')
//         .select('id, name');

//       departments = data;
//       cache.set('departments', data);
//     }

//     const assignmentMap = new Map(
//       assignments.map(a => [a.user_email, a.department_id])
//     );

//     const departmentMap = new Map(
//       departments.map(d => [d.id, d.name])
//     );

//     const result = tasks.map(task => ({
//       ...task,
//       department: departmentMap.get(
//         assignmentMap.get(task.assigned_to_email)
//       ) || null
//     }));

//     cache.set('manager_tasks', result);

//     res.json(result);

//   } catch (err) {
//     console.error('Manager tasks crash:', err);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// router.patch('/update-task-status', auth, async (req, res) => {
//   const { taskId, status } = req.body;

//   if (!taskId || !status) {
//     return res.status(400).json({ error: 'TaskId and status required' });
//   }

//   const { error } = await supabase
//     .from('tasks')
//     .update({ status })
//     .eq('id', taskId);

//   if (error) {
//     return res.status(500).json({ error: error.message });
//   }
//   cache.del('manager_tasks');
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
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(200, parseInt(req.query.limit || '100'));
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    if (page === 1) {
      const cached = cache.getManagerTasks();
      if (cached) return res.json(cached);
    }

    const { data: tasks, error: tErr, count } = await supabase
      .from('tasks')
      .select('id,title,status,priority,created_at,assigned_to_email', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tErr) return res.status(500).json({ error: tErr.message });

    let assignments = cache.getAssignments();
    let departments = cache.getDepartments();

    if (!assignments) {
      const { data } = await supabase
        .from('admin_assignments')
        .select('user_email,department_id')
        .eq('is_active', true);
      assignments = data;
      cache.setAssignments(data);
    }

    if (!departments) {
      const { data } = await supabase.from('departments').select('id,name');
      departments = data;
      cache.setDepartments(data);
    }

    const assignmentMap = new Map(assignments.map(a => [a.user_email, a.department_id]));
    const departmentMap = new Map(departments.map(d => [d.id, d.name]));

    const result = {
      data: tasks.map(task => ({
        ...task,
        department: departmentMap.get(assignmentMap.get(task.assigned_to_email)) || null,
      })),
      pagination: { page, limit, total: count, pages: Math.ceil(count / limit) },
    };

    if (page === 1) cache.setManagerTasks(result);

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