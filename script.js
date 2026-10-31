// FriendChat starter: set your Supabase project URL and anon key.
const SUPABASE_URL="https://uiqbzbcftzzabuztezul.supabase.co",SUPABASE_ANON_KEY="sb_publishable_QOxPaKV0JYbOtNV_bbRukg_0OcCewUM";
const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_ANON_KEY),$=id=>document.getElementById(id);
const S={user:null,profile:null,mode:"dm",peer:null,server:null,channel:null,servers:[],friends:[],cropKind:null,cropFile:null,cropScale:1,cropX:0,cropY:0,drag:null};
const statusNames={online:"Online",idle:"Abwesend",dnd:"Bitte nicht stören",offline:"Offline"};
function toast(t){const x=$("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),2300)}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function avatar(url){return url?`<img src="${esc(url)}" alt="">`:"?"}
function authView(){$("auth").classList.remove("hidden");$("app").classList.add("hidden")}
async function enter(user){S.user=user;let {data,error}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();if(error){toast(error.message);return}if(!data){let r=await db.from("profiles").insert({id:user.id,username:user.user_metadata?.display_name||user.email.split("@")[0]}).select().single();data=r.data}S.profile=data;$("auth").classList.add("hidden");$("app").classList.remove("hidden");renderMe();await loadFriends();await loadServers();$("presence").value=data.status||"online"}
function renderMe(){const p=S.profile;$("user-name").textContent=p.username;$("user-status-label").textContent=statusNames[p.status]||"Online";$("user-avatar").innerHTML=avatar(p.avatar_url);$("my-avatar").innerHTML=avatar(p.avatar_url)}
async function init(){if(!db||SUPABASE_URL.startsWith("YOUR_")){$("auth-hint").textContent="Trage zuerst Supabase-URL und Anon-Key in script.js ein und führe schema.sql aus.";authView();return}const {data:{session}}=await db.auth.getSession();if(session)await enter(session.user);else authView();db.auth.onAuthStateChange(async(_e,s)=>{if(s&&!S.user)await enter(s.user);if(!s){S.user=null;authView()}})}
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = $("auth-submit");
  const email = $("email").value.trim();
  const password = $("password").value;
  if (!db) {
    toast("Supabase wurde nicht geladen. Prüfe deine Internetverbindung und den Supabase-CDN-Link.");
    return;
  }
  if (!SUPABASE_URL || SUPABASE_URL.includes("YOUR_") ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("YOUR_")) {
    toast("Bitte zuerst SUPABASE_URL und SUPABASE_ANON_KEY in script.js eintragen.");
    return;
  }
  button.disabled = true;
  const oldText = button.textContent;
  button.textContent = "Bitte warten …";
  try {
    let result;
    if (button.dataset.signup === "1") {
      result = await db.auth.signUp({
        email,
        password,
        options: { data: { display_name: $("display-name").value.trim() || email.split("@")[0] } }
      });
    } else {
      result = await db.auth.signInWithPassword({ email, password });
    }
    if (result.error) {
      toast("Supabase: " + result.error.message);
    } else if (result.data.session) {
      await enter(result.data.user);
    } else {
      toast("Konto erstellt. Bitte bestätige zuerst deine E-Mail-Adresse.");
    }
  } catch (error) {
    console.error("FriendChat Login-Fehler:", error);
    toast("Login fehlgeschlagen: " + (error?.message || "Unbekannter Fehler"));
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
});
$("auth-toggle").onclick=()=>{let on=$("auth-submit").dataset.signup!=="1";$("auth-submit").dataset.signup=on?"1":"0";$("auth-submit").textContent=on?"Konto erstellen":"Anmelden";$("name-wrap").classList.toggle("hidden",!on);$("auth-toggle").textContent=on?"Zurück zur Anmeldung":"Noch kein Konto? Registrieren"};
$("logout").onclick=()=>db.auth.signOut();$("theme-toggle").onclick=()=>{document.body.classList.toggle("light");localStorage.setItem("fc-theme",document.body.classList.contains("light")?"light":"dark")};if(localStorage.getItem("fc-theme")==="light")document.body.classList.add("light");
$("presence").onchange=async()=>{let status=$("presence").value,{error}=await db.from("profiles").update({status}).eq("id",S.user.id);if(error)toast(error.message);else{S.profile.status=status;renderMe()}};
async function loadFriends(){let {data:rels}=await db.from("friendships").select("*").or(`user_id.eq.${S.user.id},friend_id.eq.${S.user.id}`).eq("status","accepted");let ids=(rels||[]).map(x=>x.user_id===S.user.id?x.friend_id:x.user_id);let {data}=ids.length?await db.from("profiles").select("*").in("id",ids):{data:[]};S.friends=data||[];$("dm-list").innerHTML=S.friends.map(p=>`<div class="nav-item" data-peer="${p.id}"><div class="avatar-small">${avatar(p.avatar_url)}</div><span>${esc(p.username)}</span><small>${statusNames[p.status]||"Offline"}</small></div>`).join("")||'<p class="hint">Noch keine Freunde. Suche oben nach Nutzern.</p>';$("dm-list").querySelectorAll("[data-peer]").forEach(el=>el.onclick=()=>openDM(S.friends.find(p=>p.id===el.dataset.peer)));
let {data:req}=await db.from("friendships").select("id,user_id").eq("friend_id",S.user.id).eq("status","pending");let ids2=(req||[]).map(x=>x.user_id);let names=ids2.length?await db.from("profiles").select("id,username").in("id",ids2):{data:[]};$("requests-list").innerHTML=(req||[]).map(x=>`<div class="nav-item"><span>${esc(names.data?.find(p=>p.id===x.user_id)?.username||"Anfrage")}</span><button data-accept="${x.id}">✓</button><button data-reject="${x.id}">×</button></div>`).join("")||'<p class="hint">Keine offenen Anfragen.</p>';$("requests-list").querySelectorAll("[data-accept]").forEach(b=>b.onclick=()=>answerRequest(b.dataset.accept,"accepted"));$("requests-list").querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>answerRequest(b.dataset.reject,"rejected"))}
async function answerRequest(id,status){let {error}=await db.from("friendships").update({status}).eq("id",id);if(error)toast(error.message);else loadFriends()}
$("search-btn").onclick=searchUsers;$("friend-search").onkeydown=e=>{if(e.key==="Enter")searchUsers()};
async function searchUsers(){let q=$("friend-search").value.trim();if(q.length<2)return;let {data,error}=await db.from("profiles").select("id,username").ilike("username",`%${q}%`).neq("id",S.user.id).limit(10);if(error){toast(error.message);return}$("search-results").innerHTML=(data||[]).map(p=>`<div class="nav-item"><span>${esc(p.username)}</span><button data-add="${p.id}">＋</button></div>`).join("")||'<p class="hint">Keine Nutzer gefunden.</p>';$("search-results").querySelectorAll("[data-add]").forEach(b=>b.onclick=async()=>{let {error}=await db.from("friendships").insert({user_id:S.user.id,friend_id:b.dataset.add});toast(error?error.message:"Anfrage gesendet")})}
async function openDM(peer){if(!peer)return;S.mode="dm";S.peer=peer;S.channel=null;S.server=null;showChat(peer.username,`Direktnachricht · ${statusNames[peer.status]||"Offline"}`);loadMessages()}
function showChat(title,sub){$("welcome").classList.add("hidden");$("messages").classList.remove("hidden");$("message-form").classList.remove("hidden");$("chat-title").textContent=title;$("chat-subtitle").textContent=sub;$("chat-context").textContent=S.mode==="dm"?"DIREKTNACHRICHT":"SERVERKANAL";$("app").classList.add("chat-open")}
async function loadMessages(){let q=db.from("messages").select("*,profiles(username,avatar_url)").order("created_at").limit(100);q=S.mode==="dm"?q.eq("kind","dm").or(`and(sender_id.eq.${S.user.id},recipient_id.eq.${S.peer.id}),and(sender_id.eq.${S.peer.id},recipient_id.eq.${S.user.id})`):q.eq("channel_id",S.channel.id);let {data,error}=await q;if(error){toast(error.message);return}renderMessages(data||[])}
function renderMessages(rows){$("messages").innerHTML=rows.map(m=>`<article class="message"><div class="avatar-small">${avatar(m.profiles?.avatar_url)}</div><div class="message-body"><div class="message-top"><b>${esc(m.profiles?.username||"Nutzer")}</b><time>${new Date(m.created_at).toLocaleString("de-DE")}</time>${m.sender_id===S.user.id?`<span class="message-actions"><button data-edit="${m.id}" data-text="${esc(m.content)}">Bearbeiten</button><button data-del="${m.id}">Löschen</button></span>`:""}</div><div class="message-text">${esc(m.content)}</div></div></article>`).join("");$("messages").scrollTop=$("messages").scrollHeight;$("messages").querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>deleteMessage(b.dataset.del));$("messages").querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>editMessage(b.dataset.edit,b.dataset.text))}
$("message-form").onsubmit=async e=>{e.preventDefault();let content=$("message-input").value.trim();if(!content)return;let row={sender_id:S.user.id,content,kind:S.mode};if(S.mode==="dm")row.recipient_id=S.peer.id;else row.channel_id=S.channel.id;let {error}=await db.from("messages").insert(row);if(error)toast(error.message);else{$("message-input").value="";loadMessages()}};
$("emoji-btn").onclick=()=>{$("message-input").value+=" 😊";$("message-input").focus()};
async function deleteMessage(id){if(!confirm("Nachricht wirklich löschen?"))return;let {error}=await db.from("messages").delete().eq("id",id);if(error)toast(error.message);else loadMessages()}
async function editMessage(id,old){let next=prompt("Nachricht bearbeiten:",old);if(next===null||!next.trim())return;let {error}=await db.from("messages").update({content:next.trim(),edited_at:new Date().toISOString()}).eq("id",id);if(error)toast(error.message);else loadMessages()}
async function loadServers(){let {data}=await db.from("server_members").select("server_id,servers(id,name,icon_url,invite_code)").eq("user_id",S.user.id);S.servers=(data||[]).map(x=>x.servers).filter(Boolean);$("server-list").innerHTML=S.servers.map(s=>`<button class="server-icon" data-server="${s.id}" title="${esc(s.name)}">${s.icon_url?avatar(s.icon_url):esc(s.name.slice(0,2).toUpperCase())}</button>`).join("");$("server-list").querySelectorAll("[data-server]").forEach(b=>b.onclick=()=>openServer(S.servers.find(s=>s.id===b.dataset.server)))}
async function openServer(server){S.server=server;S.mode="server";$("friends-panel").classList.add("hidden");$("server-panel").classList.remove("hidden");$("side-title").textContent=server.name;$("server-name").textContent=server.name;let {data}=await db.from("channels").select("*").eq("server_id",server.id).order("created_at");S.channels=data||[];$("channel-list").innerHTML=S.channels.map(c=>`<div class="nav-item" data-channel="${c.id}"># <span>${esc(c.name)}</span></div>`).join("")||'<p class="hint">Noch keine Kanäle.</p>';$("channel-list").querySelectorAll("[data-channel]").forEach(el=>el.onclick=()=>openChannel(S.channels.find(c=>c.id===el.dataset.channel)))}
async function openChannel(ch){S.channel=ch;S.mode="server";showChat("# "+ch.name,S.server.name);await loadMessages()}
$("home-btn").onclick=()=>{$("friends-panel").classList.remove("hidden");$("server-panel").classList.add("hidden");$("side-title").textContent="Freunde";$("app").classList.remove("chat-open");$("welcome").classList.remove("hidden");$("messages").classList.add("hidden");$("message-form").classList.add("hidden");S.mode="dm"};
function simpleDialog(title,fields,confirmText,callback){$("simple-title").textContent=title;$("simple-confirm").textContent=confirmText;$("simple-body").innerHTML=fields.map(f=>`<label>${f.label}<input id="field-${f.id}" placeholder="${f.placeholder||""}" maxlength="${f.max||100}" required></label>`).join("");$("simple-dialog").showModal();$("simple-form").onsubmit=async e=>{e.preventDefault();let vals=Object.fromEntries(fields.map(f=>[f.id,$("field-"+f.id).value.trim()]));await callback(vals);$("simple-dialog").close()}}
$("create-server").onclick=()=>simpleDialog("Server erstellen",[{id:"name",label:"Servername",max:40}],"Erstellen",createServer);
async function createServer(v){let code=crypto.randomUUID().slice(0,8).toUpperCase();let {data,error}=await db.from("servers").insert({name:v.name,owner_id:S.user.id,invite_code:code}).select().single();if(error){toast(error.message);return}let r=await db.from("server_members").insert({server_id:data.id,user_id:S.user.id});if(r.error)toast(r.error.message);else{toast("Server erstellt");await loadServers();openServer(data)}}
$("join-server").onclick=()=>simpleDialog("Server beitreten",[{id:"code",label:"Einladungscode",max:20}],"Beitreten",async v=>{let {error}=await db.rpc("join_server_by_code",{invite_code_input:v.code});if(error)toast(error.message);else{toast("Server beigetreten");await loadServers()}});
$("create-channel").onclick=()=>{if(S.server)simpleDialog("Textkanal erstellen",[{id:"name",label:"Kanalname",max:40}],"Erstellen",async v=>{let {error}=await db.from("channels").insert({server_id:S.server.id,name:v.name,created_by:S.user.id});if(error)toast(error.message);else openServer(S.server)})};
$("invite-copy").onclick=()=>{if(S.server?.invite_code)navigator.clipboard.writeText(S.server.invite_code).then(()=>toast("Einladungscode kopiert: "+S.server.invite_code))};
$("profile-open").onclick=()=>{let p=S.profile;$("profile-name").value=p.username||"";$("profile-bio").value=p.bio||"";$("avatar-preview").innerHTML=avatar(p.avatar_url);$("banner-preview").style.backgroundImage=p.banner_url?`url("${p.banner_url}")`:"";$("profile-dialog").showModal()};
$("avatar-upload").onclick=()=>pickImage("avatar");$("banner-upload").onclick=()=>pickImage("banner");
function pickImage(kind){S.cropKind=kind;$("image-file").click()}
$("image-file").onchange=e=>{let file=e.target.files[0];if(!file)return;if(!file.type.startsWith("image/")||file.size>8*1024*1024){toast("Bitte ein Bild unter 8 MB wählen.");return}S.cropFile=file;let url=URL.createObjectURL(file);$("crop-image").src=url;S.cropImage=new Image();S.cropImage.src=url;S.cropScale=1;S.cropX=0;S.cropY=0;$("crop-zoom").value=1;S.cropImage.onload=updateCrop;$("crop-dialog").showModal();e.target.value=""};
function updateCrop(){let stage=$("crop-stage"),im=$("crop-image"),w=stage.clientWidth,h=stage.clientHeight,base=Math.max(w/S.cropImage.width,h/S.cropImage.height),scale=base*S.cropScale;im.style.width=S.cropImage.width*scale+"px";im.style.height=S.cropImage.height*scale+"px";im.style.left=((w-S.cropImage.width*scale)/2+S.cropX)+"px";im.style.top=((h-S.cropImage.height*scale)/2+S.cropY)+"px"}
$("crop-zoom").oninput=e=>{S.cropScale=+e.target.value;updateCrop()};
$("crop-stage").onpointerdown=e=>{S.drag={x:e.clientX-S.cropX,y:e.clientY-S.cropY};$("crop-stage").setPointerCapture(e.pointerId)};
$("crop-stage").onpointermove=e=>{if(S.drag){S.cropX=e.clientX-S.drag.x;S.cropY=e.clientY-S.drag.y;updateCrop()}};$("crop-stage").onpointerup=()=>S.drag=null;
$("crop-save").onclick=async e=>{e.preventDefault();let kind=S.cropKind,stage=$("crop-stage"),im=$("crop-image"),canvas=document.createElement("canvas");canvas.width=kind==="avatar"?512:1200;canvas.height=kind==="avatar"?512:400;let ctx=canvas.getContext("2d"),r=stage.getBoundingClientRect(),ir=im.getBoundingClientRect(),sx=(r.left-ir.left)/ir.width*S.cropImage.width,sy=(r.top-ir.top)/ir.height*S.cropImage.height,sw=r.width/ir.width*S.cropImage.width,sh=r.height/ir.height*S.cropImage.height;ctx.drawImage(S.cropImage,sx,sy,sw,sh,0,0,canvas.width,canvas.height);let blob=await new Promise(res=>canvas.toBlob(res,"image/webp",.88)),path=`${S.user.id}/${kind}-${Date.now()}.webp`,{error}=await db.storage.from("profile-media").upload(path,blob,{contentType:"image/webp"});if(error){toast(error.message);return}let {data}=db.storage.from("profile-media").getPublicUrl(path);S[kind+"Pending"]=data.publicUrl;if(kind==="avatar")$("avatar-preview").innerHTML=avatar(data.publicUrl);else $("banner-preview").style.backgroundImage=`url("${data.publicUrl}")`;$("crop-dialog").close()};
$("profile-save").onclick=async e=>{e.preventDefault();let updates={username:$("profile-name").value.trim(),bio:$("profile-bio").value.trim()};if(S.avatarPending)updates.avatar_url=S.avatarPending;if(S.bannerPending)updates.banner_url=S.bannerPending;let {data,error}=await db.from("profiles").update(updates).eq("id",S.user.id).select().single();if(error)toast(error.message);else{S.profile=data;S.avatarPending=S.bannerPending=null;renderMe();$("profile-dialog").close();toast("Profil gespeichert")}};
init();

window.addEventListener("error", (event) => {
  console.error("FriendChat JavaScript-Fehler:", event.error || event.message);
  const hint = document.getElementById("auth-hint");
  if (hint) hint.textContent = "Ein JavaScript-Fehler ist aufgetreten: " + (event.message || "Unbekannter Fehler") + " (Details: Browser-Konsole mit F12 öffnen).";
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("FriendChat Promise-Fehler:", event.reason);
  const hint = document.getElementById("auth-hint");
  if (hint) hint.textContent = "Ein Fehler ist aufgetreten: " + (event.reason?.message || String(event.reason));
});
