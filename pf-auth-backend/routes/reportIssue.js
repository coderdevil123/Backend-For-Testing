const express = require('express');
const nodemailer = require('nodemailer');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/report-issue', upload.single('file'), async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'No form data received' });
    }

    const { tool, name, email, title, description, priority } = req.body;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.NOTIFY_EMAIL,
        pass: process.env.NOTIFY_EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: `"Issue Reporter" <${process.env.NOTIFY_EMAIL}>`,
      to: 'shubhang.mishra@pristineforests.com',
      subject: `🚨 New Issue Reported: ${title}`,
      html: `
        <h3>New Issue Reported</h3>
        <p><b>Tool:</b> ${tool}</p>
        <p><b>Name:</b> ${name}</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Priority:</b> ${priority}</p>
        <p><b>Description:</b><br/>${description}</p>
      `,
      attachments: req.file
        ? [{
            filename: req.file.originalname,
            content: req.file.buffer,
          }]
        : [],
    };

    await transporter.sendMail(mailOptions);

    res.json({ success: true });
  } catch (err) {
    console.error('Report issue error:', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});
