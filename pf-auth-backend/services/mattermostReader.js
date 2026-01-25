const { supabase } = require('../lib/supabase');

const BASE_URL = process.env.MATTERMOST_BASE_URL;
const BOT_TOKEN = process.env.MATTERMOST_BOT_TOKEN;

const STATUS_MAP = {
  PENDING: 'pending',
  'IN-PROGRESS': 'in-progress',
  COMPLETED: 'completed',
  WRONG: 'wrong',
  BLOCKED: 'blocked',
  'ON-HOLD': 'on-hold',
};

async function mmFetch(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${BOT_TOKEN}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mattermost API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function getDMChannels() {
  const channels = await mmFetch(
    `${BASE_URL}/api/v4/users/me/channels`
  );

  // DM channels have type === 'D'
  return channels.filter(c => c.type === 'D');
}

async function processChannel(channel) {
  // Get cursor for this channel
  const { data: cursor } = await supabase
  .from('mattermost_cursors')
  .select('*')
  .eq('channel_id', channel.id)
  .maybeSingle();
  
  const lastCreateAt = cursor?.last_create_at || 0;
  
  // Fetch posts for this channel
  const data = await mmFetch(
    `${BASE_URL}/api/v4/channels/${channel.id}/posts`
  );
  
  // Mattermost returns posts as object map
  const posts = Object.values(data.posts)
  .sort((a, b) => a.create_at - b.create_at);
  
  for (const post of posts) {
    if (post.create_at <= lastCreateAt) continue;
    
    const text = (post.message || '').trim();
    console.log('📩 RAW DM TEXT:', text);

    const match = text.match(
      /(?:@)?([\w.+-]+@[\w.-]+).*?\[(PENDING|IN-PROGRESS|COMPLETED|WRONG|BLOCKED|ON-HOLD)\]\s+(.+)/i
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
      console.error('❌ Task insert error:', error);
    }
    if (!error) {
      console.log('✅ Task created:', title);
    }

    // Audit event (best effort)
    await supabase.from('task_events').insert({
      event_type: 'created',
      new_status: status,
      triggered_by_email: email,
      source: 'mattermost',
    });
  }

  // Update cursor
  if (posts.length > 0) {
    const newestCreateAt = posts[posts.length - 1].create_at;

    await supabase
      .from('mattermost_cursors')
      .upsert({
        channel_id: channel.id,
        last_create_at: newestCreateAt,
      });
  }
}

async function runMattermostReader() {
  try {
    if (!BOT_TOKEN || !BASE_URL) {
    console.error('❌ Mattermost env vars missing');
    return;
  }
    console.log('🔄 Checking Mattermost DMs...');
    const channels = await getDMChannels();

    console.log(
      '📬 DM channels found:',
      channels.map(c => ({
        id: c.id,
        name: c.display_name || c.name || '(dm)',
      }))
    );

    for (const channel of channels) {
      await processChannel(channel);
    }
  } catch (err) {
    console.error('🔥 Mattermost reader error:', err.message);
  }
}


module.exports = {
  runMattermostReader,
};
