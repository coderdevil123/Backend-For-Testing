const express = require('express');
const multer = require('multer');
const { Resend } = require('resend');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/report-issue', upload.single('file'), async (req, res) => {
  try {
    const { tool, name, email, title, description, priority } = req.body;

    await resend.emails.send({
      from: 'PF Reports <onboarding@resend.dev>', // works without domain
      to: 'shubhangmishra094@gmail.com',
      subject: `🚨 New Issue Reported: ${title}`,
      reply_to: email,
      html: `
        <h3>New Issue Reported</h3>
        <p><b>Tool:</b> ${tool}</p>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Priority:</b> ${priority}</p>
        <p><b>Description:</b><br/>${description}</p>
      `,
      attachments: req.file
        ? [
            {
              filename: req.file.originalname,
              content: req.file.buffer.toString('base64'),
            },
          ]
        : [],
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Resend error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
