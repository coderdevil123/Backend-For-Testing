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

function extractActionItems(text) {
  // 1️⃣ Find "Your Action Items" section
  const split = text.split('✅ Your Action Items');
  if (split.length < 2) return [];

  const actionBlock = split[1];

  const items = [];

  // 2️⃣ High priority
  const high = actionBlock.split('🔴 High Priority')[1]?.split('🟡 Medium Priority')[0];
  if (high) {
    const matches = high.match(/🔴\s+(.*?)(?:\n|$)/g) || [];
    matches.forEach(m =>
      items.push({ title: m.replace('🔴', '').trim(), priority: 'high' })
    );
  }

  // 3️⃣ Medium priority
  const medium = actionBlock.split('🟡 Medium Priority')[1];
  if (medium) {
    const matches = medium.match(/🟡\s+(.*?)(?:\n|$)/g) || [];
    matches.forEach(m =>
      items.push({ title: m.replace('🟡', '').trim(), priority: 'medium' })
    );
  }

  return items;
}

const TASKBOT_USER_ID = process.env.MATTERMOST_TASKBOT_USER_ID;

async function processChannel(channel) {
  // 1️⃣ Cursor
  const { data: cursor } = await supabase
    .from('mattermost_cursors')
    .select('*')
    .eq('channel_id', channel.id)
    .maybeSingle();
  const lastCreateAt = cursor?.last_create_at || 0;

  // 2️⃣ Fetch posts
  const data = await mmFetch(
    `${BASE_URL}/api/v4/channels/${channel.id}/posts`
  );
  const posts = Object.values(data.posts)
    .sort((a, b) => a.create_at - b.create_at);

  for (const post of posts) {
    if (post.create_at <= lastCreateAt) continue;

    // ✅ FIXED: Check user_id instead of user_username
    console.log('🧾 POST USER ID:', post.user_id, 'Expected:', TASKBOT_USER_ID);
    
    if (post.user_id !== TASKBOT_USER_ID) {
      console.log('⏭️ Skipping - not from taskbot');
      continue;
    }

    const text = (post.message || '').trim();
    console.log('📩 RAW DM TEXT:', text.substring(0, 200)); // Log first 200 chars

    // 3️⃣ Extract action items
    const items = extractActionItems(text);
    console.log('📋 Extracted items:', items.length);
    
    if (items.length === 0) {
      console.log('⚠️ No action items found in message');
      continue;
    }

    // 4️⃣ Get the user this DM is with
    const members = await mmFetch(
      `${BASE_URL}/api/v4/channels/${channel.id}/members`
    );
    const userMember = members.find(
      m => m.user_id !== TASKBOT_USER_ID // exclude pf-taskbot
    );
    
    if (!userMember) {
      console.log('⚠️ No user member found');
      continue;
    }

    const user = await mmFetch(
      `${BASE_URL}/api/v4/users/${userMember.user_id}`
    );
    const assignedEmail = user.email;
    console.log('👤 Assigning to:', assignedEmail);

    // 5️⃣ Insert tasks
    for (const item of items) {
      const { error } = await supabase
        .from('tasks')
        .insert({
          mattermost_post_id: `${post.id}:${item.title}`,
          title: item.title,
          assigned_to_email: assignedEmail,
          status: 'pending',
          priority: item.priority,
          source: 'mattermost',
          created_at: new Date(post.create_at),
        });
      
      if (error) {
        console.error('❌ Error inserting task:', error.message);
      } else {
        console.log(`✅ Task created for ${assignedEmail}: ${item.title}`);
      }
    }
  }

  if (posts.length > 0) {
    const maxCreateAt = Math.max(...posts.map(p => p.create_at));
    await supabase
      .from('mattermost_cursors')
      .upsert({
        channel_id: channel.id,
        last_create_at: maxCreateAt,
      });
    console.log('📍 Cursor updated to:', maxCreateAt);
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
