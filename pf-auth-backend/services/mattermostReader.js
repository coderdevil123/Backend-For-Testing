const { supabase } = require('../lib/supabase');

const BASE_URL = process.env.MATTERMOST_BASE_URL;
const BOT_TOKEN = process.env.MATTERMOST_BOT_TOKEN;
const TASKBOT_USER_ID = process.env.MATTERMOST_TASKBOT_USER_ID; // pf-taskbot ID

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

// ✅ Get ALL DM channels where taskbot is a member
async function getTaskbotDMChannels() {
  try {
    // Get all channels for the taskbot user
    const channels = await mmFetch(
      `${BASE_URL}/api/v4/users/${TASKBOT_USER_ID}/channels`
    );

    // Filter for DM channels only
    const dmChannels = channels.filter(c => c.type === 'D');
    console.log(`📬 Found ${dmChannels.length} DM channels for taskbot`);
    
    return dmChannels;
  } catch (error) {
    console.error('❌ Error fetching taskbot channels:', error.message);
    // Fallback: get channels accessible by backend bot
    const channels = await mmFetch(`${BASE_URL}/api/v4/users/me/channels`);
    return channels.filter(c => c.type === 'D');
  }
}

function normalizeText(text) {
  return text
    .replace(/^[=\-]{3,}$/gm, '')
    .replace(/_{3,}/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function extractActionItems(text) {
  console.log('🔍 Processing text, length:', text.length);

  const cleanText = normalizeText(text.replace(/\*\*|__/g, ''));

  // Match "Your Action Items" section - be more flexible
  const actionMatch = cleanText.match(
    /✅\s*Your Action Items[\s\S]*?(🔴\s*High Priority[\s\S]*?)(?=⚙️|💬|➡️|$)/i
  );

  if (!actionMatch) {
    console.log('❌ No action items section found');
    return [];
  }

  const actionBlock = actionMatch[1];
  const items = [];

  // Extract High Priority items
  const highMatch = actionBlock.match(/🔴\s*High Priority([\s\S]*?)(?=🟡\s*Medium Priority|$)/i);
  if (highMatch) {
    const lines = highMatch[1].split('\n');
    lines.forEach(line => {
      if (line.includes('🔴')) {
        // Extract title before date/time markers
        const title = line
          .replace(/🔴/g, '')
          .split(/📅|🕐/)[0]
          .trim();
        
        if (title && title.length > 3) {
          items.push({ title, priority: 'high' });
        }
      }
    });
  }

  // Extract Medium Priority items
  const mediumMatch = actionBlock.match(/🟡\s*Medium Priority([\s\S]*?)(?=⚙️|💬|➡️|$)/i);
  if (mediumMatch) {
    const lines = mediumMatch[1].split('\n');
    lines.forEach(line => {
      if (line.includes('🟡')) {
        const title = line
          .replace(/🟡/g, '')
          .split(/📅|🕐/)[0]
          .trim();
        
        if (title && title.length > 3) {
          items.push({ title, priority: 'medium' });
        }
      }
    });
  }

  console.log(`📋 Extracted ${items.length} items:`, items.map(i => i.title.substring(0, 50)));
  return items;
}

// Extract email from the message header
function extractAssigneeEmail(text) {
  // Look for "Hi [Name]!" pattern and email in the message
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.\w+/);
  return emailMatch ? emailMatch[0] : null;
}

// Get the actual user's email from the DM channel
async function getUserEmailFromChannel(channelId) {
  try {
    const members = await mmFetch(
      `${BASE_URL}/api/v4/channels/${channelId}/members`
    );
    
    // Find the member who is NOT the taskbot
    const userMember = members.find(m => m.user_id !== TASKBOT_USER_ID);
    
    if (!userMember) {
      console.log('⚠️ No user member found in channel');
      return null;
    }

    const user = await mmFetch(
      `${BASE_URL}/api/v4/users/${userMember.user_id}`
    );
    
    return user.email;
  } catch (error) {
    console.error('❌ Error getting user email:', error.message);
    return null;
  }
}

async function processChannel(channel) {
  console.log(`\n🔍 Processing channel: ${channel.id}`);

  // Get cursor
  const { data: cursor } = await supabase
    .from('mattermost_cursors')
    .select('*')
    .eq('channel_id', channel.id)
    .maybeSingle();
  
  const lastCreateAt = cursor?.last_create_at || 0;
  console.log('📍 Last processed timestamp:', lastCreateAt);

  // Fetch posts from this channel
  const data = await mmFetch(
    `${BASE_URL}/api/v4/channels/${channel.id}/posts`
  );
  
  const posts = Object.values(data.posts || {})
    .sort((a, b) => a.create_at - b.create_at);

  console.log(`📝 Total posts: ${posts.length}`);

  let newPostsProcessed = 0;

  for (const post of posts) {
    // Skip already processed posts
    if (post.create_at <= lastCreateAt) continue;

    console.log(`\n📬 Post from user: ${post.user_id}`);
    
    // Only process posts from taskbot
    if (post.user_id !== TASKBOT_USER_ID) {
      console.log('⏭️ Skipping - not from taskbot');
      continue;
    }

    const text = (post.message || '').trim();
    console.log('📩 Message preview:', text.substring(0, 150) + '...');

    // Extract action items
    const items = extractActionItems(text);
    
    if (items.length === 0) {
      console.log('⚠️ No action items found');
      continue;
    }

    // Get the user's email from the DM channel
    const assignedEmail = await getUserEmailFromChannel(channel.id);
    
    if (!assignedEmail) {
      console.log('❌ Could not determine user email for this channel');
      continue;
    }

    console.log(`👤 Assigning ${items.length} tasks to: ${assignedEmail}`);

    // Insert tasks into Supabase
    for (const item of items) {
      const taskId = `${post.id}:${item.title.substring(0, 50)}`;
      
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('mattermost_post_id', taskId)
        .maybeSingle();

      if (existingTask) {
        console.log(`⏭️ Task already exists: ${item.title.substring(0, 40)}...`);
        continue;
      }

      const { error } = await supabase
        .from('tasks')
        .insert({
          mattermost_post_id: taskId,
          title: item.title,
          assigned_to_email: assignedEmail,
          status: 'pending',
          priority: item.priority,
          source: 'mattermost',
          created_at: new Date(post.create_at).toISOString(),
        });
      
      if (error) {
        console.error(`❌ Error inserting task: ${error.message}`);
      } else {
        console.log(`✅ Task created: ${item.title.substring(0, 50)}...`);
      }
    }

    newPostsProcessed++;
  }

  // Update cursor to latest post
  if (posts.length > 0) {
    const maxCreateAt = Math.max(...posts.map(p => p.create_at));
    await supabase
      .from('mattermost_cursors')
      .upsert({
        channel_id: channel.id,
        last_create_at: maxCreateAt,
      });
    console.log(`📍 Cursor updated to: ${maxCreateAt} (${new Date(maxCreateAt).toISOString()})`);
  }

  return newPostsProcessed;
}

async function runMattermostReader() {
  try {
    if (!BOT_TOKEN || !BASE_URL || !TASKBOT_USER_ID) {
      console.error('❌ Missing environment variables!');
      console.error('Required: MATTERMOST_BASE_URL, MATTERMOST_BOT_TOKEN, MATTERMOST_TASKBOT_USER_ID');
      return;
    }

    console.log('\n🚀 Starting Mattermost Reader...');
    console.log(`📡 Base URL: ${BASE_URL}`);
    console.log(`🤖 Taskbot ID: ${TASKBOT_USER_ID}`);

    const channels = await getTaskbotDMChannels();

    console.log(`\n📬 Found ${channels.length} DM channels to process`);

    let totalProcessed = 0;

    for (const channel of channels) {
      const processed = await processChannel(channel);
      totalProcessed += processed;
    }

    console.log(`\n✅ Completed! Processed ${totalProcessed} new posts`);

  } catch (err) {
    console.error('\n🔥 Mattermost reader error:', err.message);
    console.error(err.stack);
  }
}

module.exports = {
  runMattermostReader,
};