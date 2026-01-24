const axios = require('axios');
const { supabase } = require('../lib/supabase');

const BASE_URL = process.env.MATTERMOST_BASE_URL;
const BOT_TOKEN = process.env.MATTERMOST_BOT_TOKEN;

const headers = {
  Authorization: `Bearer ${BOT_TOKEN}`,
};

const STATUS_MAP = {
  PENDING: 'pending',
  'IN-PROGRESS': 'in-progress',
  COMPLETED: 'completed',
  WRONG: 'wrong',
  BLOCKED: 'blocked',
  'ON-HOLD': 'on-hold',
};

/**
 * Fetch DM channels for the bot
 */
async function getDMChannels() {
  const res = await axios.get(
    `${BASE_URL}/api/v4/users/me/channels`,
    { headers }
  );

  return res.data.filter(c => c.type === 'D');
}

/**
 * Process new posts in a channel
 */
async function processChannel(channel) {
  // Get cursor
  const { data: cursor } = await supabase
    .from('mattermost_cursors')
    .select('*')
    .eq('channel_id', channel.id)
    .single();

  const since = cursor?.last_post_id;

  const res = await axios.get(
    `${BASE_URL}/api/v4/channels/${channel.id}/posts`,
    { headers }
  );

  const posts = Object.values(res.data.posts)
    .sort((a, b) => a.create_at - b.create_at);

  for (const post of posts) {
    if (since && post.id <= since) continue;

    const text = post.message || '';

    // TASK format
    const match = text.match(
      /@([\w.+-]+@[\w.-]+)\s+\[(PENDING|IN-PROGRESS|COMPLETED|WRONG|BLOCKED|ON-HOLD)\]\s+(.+)/i
    );

    if (!match) continue;

    const [, email, rawStatus, title] = match;
    const status = STATUS_MAP[rawStatus.toUpperCase()];

    // Insert task (idempotent)
    const { error } = await supabase
      .from('tasks')
      .insert({
        mattermost_post_id: post.id,
        title,
        assigned_to_email: email,
        status,
        source: 'mattermost',
        created_at: new Date(post.create_at),
      });

    if (error && error.code !== '23505') {
      console.error('Task insert error:', error);
    }

    await supabase.from('task_events').insert({
      event_type: 'created',
      new_status: status,
      triggered_by_email: email,
      source: 'mattermost',
    });
  }

  // Update cursor
  if (posts.length > 0) {
    const last = posts[posts.length - 1].id;

    await supabase
      .from('mattermost_cursors')
      .upsert({
        channel_id: channel.id,
        last_post_id: last,
      });
  }
}

/**
 * Main runner
 */
async function runMattermostReader() {
  try {
    const channels = await getDMChannels();
    for (const channel of channels) {
      await processChannel(channel);
    }
  } catch (err) {
    console.error('Mattermost reader error:', err.message);
  }
}

module.exports = {
  runMattermostReader,
};
