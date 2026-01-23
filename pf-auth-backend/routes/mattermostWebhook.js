const express = require('express');
const { supabase } = require('../lib/supabase');

const router = express.Router();

/**
 * Mattermost Outgoing Webhook
 * Endpoint: POST /api/mattermost/webhook
 */
router.post('/webhook', async (req, res) => {
  try {
    // 1️⃣ Verify Mattermost webhook token
    const token = req.headers['x-mattermost-token'];
    if (token !== process.env.MATTERMOST_WEBHOOK_TOKEN) {
      console.warn('❌ Invalid Mattermost token');
      return res.status(401).json({ error: 'Invalid Mattermost token' });
    }

    const payload = req.body;

    // 2️⃣ Basic payload sanity check
    if (!payload || !payload.text || !payload.user_name) {
      return res.status(200).json({ ignored: true });
    }

    // 3️⃣ Accept ONLY pf-taskbot messages
    if (payload.user_name !== 'pf-taskbot') {
      return res.status(200).json({ ignored: true });
    }

    const text = payload.text.trim();

    /**
     * Expected format:
     * @pf-taskbot @user@pristineforests.com [IN-PROGRESS] Task title
     */
    const regex =
      /@pf-taskbot\s+@([\w.+-]+@[\w.-]+)\s+\[(PENDING|IN-PROGRESS|COMPLETED|WRONG|BLOCKED|ON-HOLD)\]\s+(.+)/i;

    const match = text.match(regex);

    if (!match) {
      console.warn('⚠️ Ignored message (format mismatch):', text);
      return res.status(200).json({ ignored: true });
    }

    const [, email, rawStatus, title] = match;

    // 4️⃣ Normalize status
    const statusMap = {
      PENDING: 'pending',
      'IN-PROGRESS': 'in-progress',
      COMPLETED: 'completed',
      WRONG: 'wrong',
      BLOCKED: 'blocked',
      'ON-HOLD': 'on-hold',
    };

    const status = statusMap[rawStatus.toUpperCase()];

    // 5️⃣ Insert task (idempotent via unique mattermost_post_id)
    const { error: taskError } = await supabase
      .from('tasks')
      .insert({
        mattermost_post_id: payload.post_id,
        title,
        assigned_to_email: email,
        status,
        source: 'mattermost',
        created_at: new Date(payload.create_at),
      });

    // Ignore duplicate webhook retries
    if (taskError && taskError.code !== '23505') {
      console.error('❌ Task insert error:', taskError);
      throw taskError;
    }

    // 6️⃣ Insert audit event (best-effort, don’t fail webhook)
    await supabase.from('task_events').insert({
      event_type: 'created',
      new_status: status,
      triggered_by_email: email,
      source: 'mattermost',
    });

    console.log('✅ Task created from Mattermost:', title);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('🔥 Mattermost webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
