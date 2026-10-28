/*
  FriendChat vanilla JS + Supabase.
  1) Replace SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
  2) Run supabase/schema.sql in the Supabase SQL Editor.
  Never put a service_role / secret key in this file.
*/
const SUPABASE_URL = 'https://uiqbzbcftzzabuztezul.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_QOxPaKV0JYbOtNV_bbRukg_0OcCewUM';

const $ = (id) => document.getElementById(id);
const EMOJIS = ['😀','😂','🥹','😍','😎','😭','🔥','❤️','👍','🎉','✨','👀','🤔','🙏','💯','🥳'];
const clientConfigured = !SUPABASE_URL.includes('DEIN-PROJEKT') &&
  !SUPABASE_PUBLISHABLE_KEY.includes('DEIN_PUBLISHABLE_KEY') &&
  window.supabase?.createClient;
const db = clientConfigured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

let session = null;
let me = null;
let friends = [];
let requests = [];
let activeFriend = null;
let messages = [];
let realtimeChannel = null;
let authMode = 'login';
let emojiOpen = false;
let theme = localStorage.getItem('friendchat-theme') || 'light';
let noticeTimer = null;

const esc = (value = '') => String(value).replace(/[&<>"']/g, ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[ch]));
const initials = (name = '?') => [...name][0]?.toUpperCase() || '?';
const isValidUsername = name => /^[a-zA-Z0-9_]{3,20}$/.test(name);
const fmtTime = value => new Date(value).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'});

function avatarHTML(profile, size = '') {
  const classes = `avatar ${size}`.trim();
  const content = profile?.avatar_url
    ? `<img src="${esc(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">`
    : esc(initials(profile?.username));
  return `<span class="${classes}">${content}</span>`;
}
function setAlert(el, text, kind = 'error') {
  el.textContent = text;
  el.className = `alert ${kind}`;
}
function clearAlert(el) { el.textContent = ''; el.className = 'alert hidden'; }
function showGlobal(text, kind = 'success') {
  const el = $('global-message');
  setAlert(el, text, kind);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.add('hidden'), 6000);
}
function setTheme(next) {
  theme = next;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('friendchat-theme', theme);
  $('theme-icon').textContent = theme === 'light' ? '☾' : '☀';
  $('theme-label').textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
  $('top-theme-toggle').textContent = theme === 'light' ? '☾' : '☀';
}
function switchAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  $('username-label').classList.toggle('hidden', !registering);
  $('auth-username').required = registering;
  $('auth-username').value = '';
  $('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  $('auth-eyebrow').textContent = registering ? 'SCHÖN, DASS DU DA BIST' : 'WILLKOMMEN ZURÜCK';
  $('auth-title').textContent = registering ? 'Konto erstellen' : 'Melde dich an';
  $('auth-description').textContent = registering ? 'Erstelle dein Konto und finde deine Leute.' : 'Melde dich an und schreib deinen Freunden.';
  $('auth-submit').innerHTML = registering ? 'Registrieren <span>→</span>' : 'Anmelden <span>→</span>';
  $('auth-switch-copy').textContent = registering ? 'Du hast schon ein Konto?' : 'Noch kein Konto?';
  $('auth-switch').textContent = registering ? 'Anmelden' : 'Registrieren';
  $('auth-message').classList.add('hidden');
}
$('auth-switch').addEventListener('click', () => switchAuthMode(authMode === 'login' ? 'register' : 'login'));

$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!db) return setAlert($('auth-message'), 'Bitte trage zuerst deine Supabase-URL und deinen Publishable Key oben in script.js ein.');
  clearAlert($('auth-message'));
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const button = $('auth-submit');
  button.disabled = true;
  try {
    if (authMode === 'register') {
      const username = $('auth-username').value.trim().replace(/^@/, '');
      if (!isValidUsername(username)) throw new Error('Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und Unterstriche.');
      const { data, error } = await db.auth.signUp({
        email, password, options: { data: { username }, emailRedirectTo: location.origin }
      });
      if (error) throw error;
      if (!data.session) setAlert($('auth-message'), 'Registrierung erstellt. Bitte bestätige ggf. deine E-Mail-Adresse und melde dich dann an.', 'success');
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) { setAlert($('auth-message'), error.message || 'Anmeldung fehlgeschlagen.'); }
  finally { button.disabled = false; }
});

async function loadMyProfile() {
  const { data, error } = await db.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Dein Profil fehlt. Prüfe, ob du supabase/schema.sql ausgeführt hast.');
  me = data;
  renderMyProfile();
}
function renderMyProfile() {
  if (!me) return;
  $('sidebar-avatar').innerHTML = me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="">` : esc(initials(me.username));
  $('sidebar-username').textContent = me.username;
  $('profile-username').value = me.username || '';
  $('profile-bio').value = me.bio || '';
  $('bio-count').textContent = `${(me.bio || '').length}/180`;
  $('profile-avatar-preview').innerHTML = me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="">` : esc(initials(me.username));
  $('banner-preview').style.backgroundImage = me.banner_url
    ? `linear-gradient(90deg,#3449a455,#8158cd55),url("${me.banner_url.replace(/["\\\n\r]/g, '')}")`
    : 'linear-gradient(115deg,#5362d8,#a18ae8)';
}
async function loadFriendsAndRequests() {
  const uid = session.user.id;
  const [{ data: relations, error: friendError }, { data: pending, error: requestError }] = await Promise.all([
    db.from('friendships').select('*').eq('status','accepted').or(`requester_id.eq.${uid},addressee_id.eq.${uid}`),
    db.from('friendships').select('*').eq('status','pending').eq('addressee_id',uid)
  ]);
  if (friendError) throw friendError;
  if (requestError) throw requestError;
  const friendIds = (relations || []).map(r => r.requester_id === uid ? r.addressee_id : r.requester_id);
  if (friendIds.length) {
    const { data, error } = await db.from('profiles').select('*').in('id',friendIds).order('username');
    if (error) throw error;
    friends = data || [];
  } else friends = [];
  if (pending?.length) {
    const ids = pending.map(r => r.requester_id);
    const { data, error } = await db.from('profiles').select('*').in('id',ids);
    if (error) throw error;
    requests = pending.map(r => ({...r, profile:(data || []).find(p => p.id === r.requester_id)})).filter(r => r.profile);
  } else requests = [];
  renderFriends();
  renderRequests();
}
function renderFriends() {
  const query = $('friend-search').value.toLowerCase().trim();
  const shown = friends.filter(f => (f.username || '').toLowerCase().includes(query));
  $('friend-list').innerHTML = shown.length ? shown.map(f => `
    <button class="friend-row ${activeFriend?.id === f.id ? 'selected' : ''}" type="button" data-friend-id="${esc(f.id)}">
      ${avatarHTML(f)}
      <span class="friend-info"><b>${esc(f.username)}</b><small>${esc(f.bio || 'Dein Freund')}</small></span>
      <span class="online-dot"></span>
    </button>`).join('') : `<p class="empty-small">${friends.length ? 'Keine Treffer.' : 'Noch keine Freunde. Füge jemanden hinzu!'}</p>`;
  $('friend-list').querySelectorAll('[data-friend-id]').forEach(button => button.addEventListener('click', () => {
    const friend = friends.find(f => f.id === button.dataset.friendId);
    if (friend) openChat(friend);
  }));
}
function renderRequests() {
  $('requests-card').classList.toggle('hidden', !requests.length);
  $('request-count').textContent = requests.length;
  $('request-list').innerHTML = requests.map(r => `
    <div class="request-row">
      ${avatarHTML(r.profile)}
      <span class="request-name"><b>@${esc(r.profile.username)}</b><small>möchte mit dir befreundet sein</small></span>
      <button class="accept-button" type="button" data-accept="${esc(r.id)}" title="Annehmen">✓</button>
      <button class="decline-button" type="button" data-reject="${esc(r.id)}" title="Ablehnen">×</button>
    </div>`).join('');
  $('request-list').querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', () => answerRequest(b.dataset.accept, true)));
  $('request-list').querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => answerRequest(b.dataset.reject, false)));
}
async function answerRequest(id, accept) {
  try {
    const { error } = await db.rpc(accept ? 'accept_friend_request' : 'reject_friend_request', {request_id:id});
    if (error) throw error;
    await loadFriendsAndRequests();
    showGlobal(accept ? 'Freundschaft angenommen.' : 'Anfrage abgelehnt.');
  } catch (error) { showGlobal(error.message); }
}
$('friend-form').addEventListener('submit', async event => {
  event.preventDefault();
  const username = $('friend-username').value.trim().replace(/^@/,'');
  if (!username) return;
  try {
    const { data: target, error } = await db.from('profiles').select('id,username').ilike('username', username).maybeSingle();
    if (error) throw error;
    if (!target) throw new Error('Dieser Benutzername wurde nicht gefunden.');
    if (target.id === session.user.id) throw new Error('Du kannst dich nicht selbst hinzufügen.');
    if (friends.some(f => f.id === target.id)) throw new Error('Ihr seid bereits befreundet.');
    const { error: insertError } = await db.from('friendships').insert({requester_id:session.user.id,addressee_id:target.id,status:'pending'});
    if (insertError) throw new Error(insertError.code === '23505' ? 'Für diese Richtung existiert bereits eine Anfrage.' : insertError.message);
    $('friend-username').value = '';
    showGlobal(`Freundschaftsanfrage an @${target.username} gesendet.`);
  } catch (error) { showGlobal(error.message); }
});
$('focus-friend').addEventListener('click', () => $('friend-username').focus());
$('friend-search').addEventListener('input', renderFriends);

async function openChat(friend) {
  activeFriend = friend;
  $('welcome-panel').classList.add('hidden');
  $('chat-panel').classList.remove('hidden');
  $('page-title').textContent = `Chat mit ${friend.username}`;
  $('chat-username').textContent = friend.username;
  $('chat-bio').textContent = friend.bio || 'Dein Freund auf FriendChat';
  $('chat-avatar').innerHTML = friend.avatar_url ? `<img src="${esc(friend.avatar_url)}" alt="">` : esc(initials(friend.username));
  $('message-input').placeholder = `Nachricht an ${friend.username} …`;
  renderFriends();
  await loadMessages();
  subscribeToMessages();
}
async function loadMessages() {
  if (!activeFriend) return;
  $('message-area').innerHTML = '<p class="loading-note">Nachrichten werden geladen …</p>';
  const uid = session.user.id;
  const friendId = activeFriend.id;
  const { data, error } = await db.from('messages').select('*')
    .or(`and(sender_id.eq.${uid},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${uid})`)
    .order('created_at',{ascending:true}).limit(300);
  if (error) { showGlobal(error.message); return; }
  messages = data || [];
  renderMessages();
}
function subscribeToMessages() {
  if (realtimeChannel) db.removeChannel(realtimeChannel);
  if (!activeFriend) return;
  const pair = [session.user.id,activeFriend.id].sort().join('-');
  realtimeChannel = db.channel(`chat-${pair}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'messages'}, payload => {
      const row = payload.new || payload.old;
      if (row && [row.sender_id,row.recipient_id].includes(session.user.id) &&
          [row.sender_id,row.recipient_id].includes(activeFriend?.id)) loadMessages();
    }).subscribe();
}
function renderMessages() {
  const area = $('message-area');
  const start = `<div class="chat-start"><div class="chat-start-avatar">${avatarHTML(activeFriend,'large')}</div><h2>Du und ${esc(activeFriend.username)}</h2><p>Das ist der Anfang eurer Unterhaltung. 👋</p></div>`;
  const rows = messages.map(m => {
    const mine = m.sender_id === session.user.id;
    const author = mine ? me : activeFriend;
    const tools = mine ? `<div class="message-tools"><button type="button" data-edit="${esc(m.id)}" title="Bearbeiten">✎</button><button type="button" data-delete="${esc(m.id)}" title="Löschen">⌫</button></div>` : '';
    return `<div class="message-line ${mine?'mine':'theirs'}" data-message-row="${esc(m.id)}">
      ${mine ? '' : avatarHTML(author,'small')}
      <div class="message-content">
        <div class="bubble ${mine?'my-bubble':'their-bubble'}"><span>${esc(m.content)}</span>${tools}</div>
        <div class="message-meta">${fmtTime(m.created_at)}${m.edited_at?' · bearbeitet':''}</div>
      </div>
    </div>`;
  }).join('');
  area.innerHTML = start + rows;
  area.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => startEditing(b.dataset.edit)));
  area.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteMessage(b.dataset.delete)));
  area.scrollTop = area.scrollHeight;
}
function startEditing(id) {
  const msg = messages.find(m => m.id === id);
  if (!msg || msg.sender_id !== session.user.id) return;
  const row = document.querySelector(`[data-message-row="${CSS.escape(id)}"] .bubble`);
  if (!row) return;
  row.innerHTML = `<form class="edit-message" data-edit-form="${esc(id)}"><input aria-label="Nachricht bearbeiten" maxlength="4000" required value="${esc(msg.content)}"><button class="icon-button" type="submit" title="Speichern">✓</button><button class="icon-button" type="button" data-cancel-edit="${esc(id)}" title="Abbrechen">×</button></form>`;
  const form = row.querySelector('form');
  const input = form.querySelector('input');
  input.focus(); input.setSelectionRange(input.value.length,input.value.length);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) return showGlobal('Eine Nachricht darf nicht leer sein.','error');
    try {
      const { error } = await db.from('messages').update({content,edited_at:new Date().toISOString()}).eq('id',id).eq('sender_id',session.user.id);
      if (error) throw error;
      await loadMessages();
    } catch (error) { showGlobal(error.message,'error'); }
  });
  row.querySelector('[data-cancel-edit]').addEventListener('click', renderMessages);
}
async function deleteMessage(id) {
  if (!confirm('Diese Nachricht wirklich für beide Seiten löschen?')) return;
  try {
    const { error } = await db.from('messages').delete().eq('id',id).eq('sender_id',session.user.id);
    if (error) throw error;
    await loadMessages();
  } catch (error) { showGlobal(error.message,'error'); }
}
$('composer').addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeFriend) return;
  const content = $('message-input').value.trim();
  if (!content) return;
  $('message-input').value = '';
  $('emoji-tray').classList.add('hidden'); emojiOpen = false;
  try {
    const { error } = await db.from('messages').insert({sender_id:session.user.id,recipient_id:activeFriend.id,content});
    if (error) throw error;
    await loadMessages();
  } catch (error) { $('message-input').value = content; showGlobal(error.message,'error'); }
});
$('emoji-toggle').addEventListener('click', () => {
  emojiOpen = !emojiOpen;
  $('emoji-tray').classList.toggle('hidden',!emojiOpen);
  $('emoji-toggle').classList.toggle('pressed',emojiOpen);
});
$('emoji-tray').innerHTML = EMOJIS.map(emoji => `<button type="button">${emoji}</button>`).join('');
$('emoji-tray').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  const input = $('message-input');
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0,start) + b.textContent + input.value.slice(end);
  input.focus();
  input.setSelectionRange(start+b.textContent.length,start+b.textContent.length);
}));
$('remove-friend').addEventListener('click', async () => {
  if (!activeFriend || !confirm(`Freundschaft mit @${activeFriend.username} wirklich beenden?`)) return;
  const uid = session.user.id, fid = activeFriend.id;
  try {
    const { error } = await db.from('friendships').delete().eq('status','accepted')
      .or(`and(requester_id.eq.${uid},addressee_id.eq.${fid}),and(requester_id.eq.${fid},addressee_id.eq.${uid})`);
    if (error) throw error;
    activeFriend = null;
    $('chat-panel').classList.add('hidden'); $('welcome-panel').classList.remove('hidden');
    $('page-title').textContent = 'Dein Nachrichtenraum';
    await loadFriendsAndRequests();
  } catch (error) { showGlobal(error.message,'error'); }
});

function openProfile() {
  if (!me) return;
  renderMyProfile();
  $('profile-modal').classList.remove('hidden');
}
function closeProfile() { $('profile-modal').classList.add('hidden'); }
$('open-profile').addEventListener('click',openProfile);
$('close-profile').addEventListener('click',closeProfile);
$('cancel-profile').addEventListener('click',closeProfile);
$('profile-modal').addEventListener('mousedown',e => { if(e.target === $('profile-modal')) closeProfile(); });
document.addEventListener('keydown',e => { if(e.key === 'Escape') closeProfile(); });
$('profile-bio').addEventListener('input',() => $('bio-count').textContent = `${$('profile-bio').value.length}/180`);
$('profile-form').addEventListener('submit',async event => {
  event.preventDefault();
  const username = $('profile-username').value.trim().replace(/^@/,'');
  const bio = $('profile-bio').value.trim();
  if (!isValidUsername(username)) return showGlobal('Benutzername: 3–20 Zeichen, Buchstaben, Zahlen und Unterstriche.','error');
  try {
    const { error } = await db.from('profiles').update({username,bio,updated_at:new Date().toISOString()}).eq('id',session.user.id);
    if (error) throw error;
    await loadMyProfile();
    await loadFriendsAndRequests();
    if (activeFriend) {
      const refreshed = friends.find(f => f.id === activeFriend.id);
      if (refreshed) activeFriend = refreshed;
    }
    closeProfile(); showGlobal('Profil gespeichert.');
  } catch (error) { showGlobal(error.code === '23505' ? 'Dieser Benutzername ist bereits vergeben.' : error.message,'error'); }
});
$('avatar-upload-button').addEventListener('click',() => $('avatar-file').click());
$('banner-upload-button').addEventListener('click',() => $('banner-file').click());
$('avatar-file').addEventListener('change',e => uploadProfileImage(e.target.files?.[0],'avatar_url','avatar-file'));
$('banner-file').addEventListener('change',e => uploadProfileImage(e.target.files?.[0],'banner_url','banner-file'));
async function uploadProfileImage(file,field,inputId) {
  if (!file) return;
  $(inputId).value = '';
  if (!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) return showGlobal('Bitte wähle PNG, JPEG, WebP oder GIF.','error');
  if (file.size > 4*1024*1024) return showGlobal('Das Bild darf höchstens 4 MB groß sein.','error');
  try {
    const ext = file.type.split('/')[1].replace('jpeg','jpg');
    const path = `${session.user.id}/${field}-${crypto.randomUUID()}.${ext}`;
    const {error: uploadError} = await db.storage.from('profile-media').upload(path,file,{contentType:file.type,upsert:false});
    if (uploadError) throw uploadError;
    const {data} = db.storage.from('profile-media').getPublicUrl(path);
    const {error} = await db.from('profiles').update({[field]:data.publicUrl,updated_at:new Date().toISOString()}).eq('id',session.user.id);
    if (error) throw error;
    await loadMyProfile();
    await loadFriendsAndRequests();
    showGlobal('Bild aktualisiert.');
  } catch (error) { showGlobal(error.message,'error'); }
}
$('theme-toggle').addEventListener('click',() => setTheme(theme === 'light' ? 'dark' : 'light'));
$('top-theme-toggle').addEventListener('click',() => setTheme(theme === 'light' ? 'dark' : 'light'));
$('logout-button').addEventListener('click',async () => { await db?.auth.signOut(); });

async function showSignedInApp(nextSession) {
  session = nextSession;
  $('auth-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  clearAlert($('global-message'));
  try {
    await loadMyProfile();
    await loadFriendsAndRequests();
  } catch (error) { showGlobal(error.message,'error'); }
}
function showSignedOutApp() {
  session = null; me = null; friends = []; requests = []; activeFriend = null; messages = [];
  if (realtimeChannel && db) db.removeChannel(realtimeChannel);
  realtimeChannel = null;
  $('auth-view').classList.remove('hidden');
  $('app-view').classList.add('hidden');
  $('profile-modal').classList.add('hidden');
  $('chat-panel').classList.add('hidden');
  $('welcome-panel').classList.remove('hidden');
  $('page-title').textContent = 'Dein Nachrichtenraum';
}

setTheme(theme);
if (!db) {
  setAlert($('auth-message'),'Setup nötig: Öffne script.js und trage SUPABASE_URL und SUPABASE_PUBLISHABLE_KEY aus deinem Supabase-Projekt ein.');
} else {
  db.auth.getSession().then(({data,error}) => {
    if (error) setAlert($('auth-message'),error.message);
    if (data.session) showSignedInApp(data.session);
  });
  db.auth.onAuthStateChange((_event,nextSession) => {
    if (nextSession) showSignedInApp(nextSession);
    else showSignedOutApp();
  });
}
