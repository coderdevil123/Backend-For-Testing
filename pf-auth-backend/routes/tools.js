// const express = require('express');
// const jwt = require('jsonwebtoken');
// const { supabase } = require('../lib/supabase');
// const auth = require('../middlewares/auth');

// const router = express.Router();
// const multer = require('multer');
// const upload = multer({ storage: multer.memoryStorage() });

// /* 🔐 Auth middleware */
// // function requireAuth(req, res, next) {
// //   const token = req.headers.authorization?.split(' ')[1];
// //   if (!token) return res.status(401).json({ error: 'No token' });

// //   try {
// //     req.user = jwt.verify(token, process.env.JWT_SECRET);
// //     next();
// //   } catch {
// //     res.status(401).json({ error: 'Invalid token' });
// //   }
// // }

// /* ✅ GET all tools */
// router.get('/', async (req, res) => {
//   const { data, error } = await supabase
//     .from('tools')
//     .select('*')
//     .order('created_at', { ascending: false });

//   if (error) return res.status(500).json(error);
//   res.json(data);
// });

// /* ✅ ADD tool */
// router.post(
//   '/',
//   auth,
//   upload.single('image'),
//   async (req, res) => {
//     const {
//       name,
//       description,
//       url,
//       category,
//       tutorial_video,
//     } = req.body;

//     if (!name || !url || !category) {
//       return res.status(400).json({ error: 'Missing required fields' });
//     }

//     let imageUrl = null;

//     if (req.file) {
//       const filePath = `tools/${Date.now()}-${req.file.originalname}`;

//       const { error: uploadError } = await supabase.storage
//         .from('tool-images')
//         .upload(filePath, req.file.buffer, {
//           contentType: req.file.mimetype,
//           upsert: true,
//         });

//       if (uploadError) {
//         return res.status(500).json(uploadError);
//       }

//       imageUrl = supabase.storage
//         .from('tool-images')
//         .getPublicUrl(filePath).data.publicUrl;
//     }

//     const { error } = await supabase.from('tools').insert({
//       name,
//       description,
//       url,
//       category,
//       tutorial_video,
//       image: imageUrl,
//       image_light: imageUrl,
//       image_dark: imageUrl,
//       created_by: req.user.email,
//     });

//     if (error) return res.status(500).json(error);

//     res.json({ success: true });
//   }
// );

// router.put('/:id', auth, upload.single('image'), async (req, res) => {
//   const { id } = req.params;
//   const {
//     name,
//     description,
//     url,
//     tutorial_video,
//     category,
//   } = req.body;

//   let imageUrl = null;

//   if (req.file) {
//     const filePath = `tools/${Date.now()}-${req.file.originalname}`;

//     const { error: uploadError } = await supabase.storage
//       .from('tool-images')
//       .upload(filePath, req.file.buffer, {
//         contentType: req.file.mimetype,
//         upsert: true,
//       });

//     if (uploadError) {
//       return res.status(500).json(uploadError);
//     }

//     imageUrl = supabase.storage
//       .from('tool-images')
//       .getPublicUrl(filePath).data.publicUrl;
//   }

//   const updatePayload = {
//     name,
//     description,
//     url,
//     tutorial_video,
//     category,
//   };

//   // only overwrite image if a new one is uploaded
//   if (imageUrl) {
//     updatePayload.image = imageUrl;
//     updatePayload.image_light = imageUrl;
//     updatePayload.image_dark = imageUrl;
//   }

//   const { error } = await supabase
//     .from('tools')
//     .update(updatePayload)
//     .eq('id', id);

//   if (error) return res.status(500).json(error);

//   res.json({ success: true });
// });

// router.delete('/:id', auth, async (req, res) => {
//   const { id } = req.params;

//   const { error } = await supabase
//     .from('tools')
//     .delete()
//     .eq('id', id);

//   if (error) return res.status(500).json(error);
//   res.json({ success: true });
// });

// module.exports = router;

const express = require('express');
const { supabase } = require('../lib/supabase');
const auth   = require('../middlewares/auth');
const cache  = require('../services/cache');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// GET /api/tools
router.get('/', async (req, res) => {
  const cached = cache.getTools();
  if (cached) return res.json(cached);

  const { data, error } = await supabase
    .from('tools')
    .select('id,name,description,url,category,image,image_light,image_dark,tutorial_video,created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json(error);

  cache.setTools(data);
  res.json(data);
});

// POST /api/tools
router.post('/', auth, upload.single('image'), async (req, res) => {
  const { name, description, url, category, tutorial_video } = req.body;

  if (!name || !url || !category)
    return res.status(400).json({ error: 'Missing required fields' });

  let imageUrl = null;
  if (req.file) {
    const filePath = `tools/${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from('tool-images')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadError) return res.status(500).json(uploadError);
    imageUrl = supabase.storage.from('tool-images').getPublicUrl(filePath).data.publicUrl;
  }

  const { error } = await supabase.from('tools').insert({
    name, description, url, category, tutorial_video,
    image: imageUrl, image_light: imageUrl, image_dark: imageUrl,
    created_by: req.user.email,
  });

  if (error) return res.status(500).json(error);

  cache.delTools();
  res.json({ success: true });
});

// PUT /api/tools/:id
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, url, tutorial_video, category } = req.body;

  let imageUrl = null;
  if (req.file) {
    const filePath = `tools/${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from('tool-images')
      .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (uploadError) return res.status(500).json(uploadError);
    imageUrl = supabase.storage.from('tool-images').getPublicUrl(filePath).data.publicUrl;
  }

  const updatePayload = { name, description, url, tutorial_video, category };
  if (imageUrl) {
    updatePayload.image = imageUrl;
    updatePayload.image_light = imageUrl;
    updatePayload.image_dark = imageUrl;
  }

  const { error } = await supabase.from('tools').update(updatePayload).eq('id', id);
  if (error) return res.status(500).json(error);

  cache.delTools();
  res.json({ success: true });
});

// DELETE /api/tools/:id
router.delete('/:id', auth, async (req, res) => {
  const { error } = await supabase.from('tools').delete().eq('id', req.params.id);
  if (error) return res.status(500).json(error);

  cache.delTools();
  res.json({ success: true });
});

module.exports = router;