const { supabase } = require('../lib/supabase');

const BASE_URL = process.env.MATTERMOST_BASE_URL;
const BOT_TOKEN = process.env.MATTERMOST_BOT_TOKEN;

/* -------------------- Helpers -------------------- */

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

function normalizeText(text) {
  return text
    .replace(/\*\*|__/g, '')
    .replace(/^[=\-]{3,}$/gm, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function extractAssigneeEmail(text) {
  const match = text.match(/@([\w.+-]+@[\w.-]+)/);
  return match ? match[1] : null;
}

function extractActionItems(text) {
  const clean = normalizeText(text);

  // Must contain Action Items
  if (!clean.includes('Your Action Items')) return [];

  const items = [];

  // High priority
  const highMatch = clean.match(/🔴\s*High Priority([\s\S]*?)(?=🟡|⚙️|💬|➡️|$)/i);
  if (highMatch) {
    highMatch[1]
      .split('\n')
      .filter(l => l.includes('🔴'))
      .forEach(line => {
        const title = line.replace(/🔴/g, '').split(/📅|🕐/)[0].trim();
        if (title) items.push({ title, priority: 'high' });
      });
  }

  // Medium priority
  const medMatch = clean.match(/🟡\s*Medium Priority([\s\S]*?)(?=⚙️|💬|➡️|$)/i);
  if (medMatch) {
    medMatch[1]
      .split('\n')
      .filter(l => l.includes('🟡'))
      .forEach(line => {
        const title = line.replace(/🟡/g, '').split(/📅|🕐/)[0].trim();
        if (title) items.push({ title, priority: 'medium' });
      });
  }

  // Low priority
  const lowMatch = clean.match(/🟢\s*Low Priority([\s\S]*?)(?=⚙️|💬|➡️|$)/i);
  if (lowMatch) {
    lowMatch[1]
      .split('\n')
      .filter(l => l.includes('🟢'))
      .forEach(line => {
        const title = line.replace(/🟢/g, '').split(/📅|🕐|💬/)[0].trim();
        if (title) items.push({ title, priority: 'low' });
      });
  }

  return items;
}

/* -------------------- Core Logic -------------------- */

async function getBackendBotDMChannels() {
  const channels = await mmFetch(
    `${BASE_URL}/api/v4/users/me/channels`
  );

  return channels.filter(c => c.type === 'D');
}

async function processChannel(channel) {
  const { data: cursor } = await supabase
    .from('mattermost_cursors')
    .select('*')
    .eq('channel_id', channel.id)
    .maybeSingle();

  const lastCreateAt = cursor?.last_create_at || 0;

  const data = await mmFetch(
    `${BASE_URL}/api/v4/channels/${channel.id}/posts`
  );

  const posts = Object.values(data.posts || {})
    .sort((a, b) => a.create_at - b.create_at);

  for (const post of posts) {
    if (post.create_at <= lastCreateAt) continue;

    const text = (post.message || '').trim();
    console.log('📩 RAW DM TEXT:', text.substring(0, 120));

    // 🔒 CONTENT FILTER (THIS IS THE KEY)
    if (!text.includes('Your Action Items')) {
      console.log('⏭️ Skipping – not a task summary');
      continue;
    }

    const items = extractActionItems(text);
    if (items.length === 0) {
      console.log('⚠️ No action items found');
      continue;
    }

    const assignedEmail = await resolveAssigneeEmail(text);
    if (!assignedEmail) {
      console.log('⚠️ No assignee email found');
      continue;
    }

    console.log(`👤 Assigning ${items.length} tasks to ${assignedEmail}`);

    for (const item of items) {
      const taskKey = `${post.id}:${item.title}`;

      const { data: exists } = await supabase
        .from('tasks')
        .select('id')
        .eq('mattermost_post_id', taskKey)
        .maybeSingle();

      if (exists) continue;

      const { error } = await supabase
        .from('tasks')
        .insert({
          mattermost_post_id: taskKey,
          title: item.title,
          assigned_to_email: assignedEmail,
          status: 'pending',
          priority: item.priority,
          source: 'mattermost',
          created_at: new Date(post.create_at).toISOString(),
        });

      if (error) {
        console.error('❌ Task insert error:', error.message);
      } else {
        console.log(`✅ Task created: ${item.title}`);
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
  }
}

async function resolveAssigneeEmail(text) {
  const direct = extractAssigneeEmail(text);
  if (direct) return direct;

  const nameMatch = text.match(/Hi\s+([A-Za-z\s]+)!/i);
  if (!nameMatch) return null;

  const name = nameMatch[1].trim();

  const { data } = await supabase
    .from('profiles')
    .select('email')
    .ilike('name', `%${name}%`)
    .maybeSingle();

  return data?.email || null;
}


async function runMattermostReader() {
  try {
    if (!BOT_TOKEN || !BASE_URL) {
      console.error('❌ Missing Mattermost env vars');
      return;
    }

    console.log('🔄 Checking pf-backend-bot DMs...');
    const channels = await getBackendBotDMChannels();

    for (const channel of channels) {
      await processChannel(channel);
    }

    console.log('✅ Mattermost scan complete');
  } catch (err) {
    console.error('🔥 Mattermost reader error:', err.message);
  }
}

module.exports = { runMattermostReader };
