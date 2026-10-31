
// ==========================================
// FRIENDCHAT – SCRIPT.JS
// ==========================================

// Supabase
const SUPABASE_URL = "https://uiqbzbcftzzabuztezul.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QOxPaKV0JYbOtNV_bbRukg_0OcCewUM";

const db = window.supabase?.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

const $ = id => document.getElementById(id);

// App state
const S = {
  user: null,
  profile: null,
  mode: "dm",
  peer: null,
  server: null,
  channel: null,
  channels: [],
  servers: [],
  friends: [],
  cropKind: null,
  cropFile: null,
  cropScale: 1,
  cropX: 0,
  cropY: 0,
  drag: null
};

const statusNames = {
  online: "Online",
  idle: "Abwesend",
  dnd: "Bitte nicht stören",
  offline: "Offline"
};

// ==========================================
// HELPERS
// ==========================================

function toast(message) {
  const element = $("toast");
  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  setTimeout(() => {
    element.classList.remove("show");
  }, 2300);
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function avatar(url) {
  return url
    ? `<img src="${esc(url)}" alt="">`
    : "?";
}

function authView() {
  $("auth").classList.remove("hidden");
  $("app").classList.add("hidden");
}

// ==========================================
// LOGIN / PROFILE
// ==========================================

async function enter(user) {
  S.user = user;

  let { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    toast(error.message);
    return;
  }

  if (!data) {
    const result = await db
      .from("profiles")
      .insert({
        id: user.id,
        username:
          user.user_metadata?.display_name ||
          user.email.split("@")[0]
      })
      .select()
      .single();

    if (result.error) {
      toast("Profil konnte nicht erstellt werden: " + result.error.message);
      return;
    }

    data = result.data;
  }

  S.profile = data;

  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");

  renderMe();

  await loadFriends();
  await loadServers();

  $("presence").value = data.status || "online";
}

function renderMe() {
  const profile = S.profile;
  if (!profile) return;

  $("user-name").textContent = profile.username;
  $("user-status-label").textContent =
    statusNames[profile.status] || "Online";

  $("user-avatar").innerHTML = avatar(profile.avatar_url);
  $("my-avatar").innerHTML = avatar(profile.avatar_url);
}

async function init() {
  if (!db || SUPABASE_URL.startsWith("YOUR_")) {
    $("auth-hint").textContent =
      "Trage zuerst deine Supabase-Daten ein und führe schema.sql aus.";

    authView();
    return;
  }

  const {
    data: { session }
  } = await db.auth.getSession();

  if (session) {
    await enter(session.user);
  } else {
    authView();
  }

  db.auth.onAuthStateChange(async (_event, session) => {
    if (session && !S.user) {
      await enter(session.user);
    }

    if (!session) {
      S.user = null;
      S.profile = null;
      authView();
    }
  });
}

// ==========================================
// AUTH FORM
// ==========================================

$("auth-form").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("auth-submit");
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!db) {
    toast("Supabase wurde nicht geladen.");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    toast("Supabase-Daten fehlen.");
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
        options: {
          data: {
            display_name:
              $("display-name").value.trim() ||
              email.split("@")[0]
          }
        }
      });
    } else {
      result = await db.auth.signInWithPassword({
        email,
        password
      });
    }

    if (result.error) {
      toast("Supabase: " + result.error.message);
    } else if (result.data.session) {
      await enter(result.data.user);
    } else {
      toast("Konto erstellt. Bitte bestätige deine E-Mail-Adresse.");
    }
  } catch (error) {
    console.error("Login-Fehler:", error);
    toast("Login fehlgeschlagen: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
});

$("auth-toggle").onclick = () => {
  const on = $("auth-submit").dataset.signup !== "1";

  $("auth-submit").dataset.signup = on ? "1" : "0";
  $("auth-submit").textContent = on
    ? "Konto erstellen"
    : "Anmelden";

  $("name-wrap").classList.toggle("hidden", !on);

  $("auth-toggle").textContent = on
    ? "Zurück zur Anmeldung"
    : "Noch kein Konto? Registrieren";
};

$("logout").onclick = () => db.auth.signOut();

// ==========================================
// THEME
// ==========================================

$("theme-toggle").onclick = () => {
  document.body.classList.toggle("light");

  localStorage.setItem(
    "fc-theme",
    document.body.classList.contains("light")
      ? "light"
      : "dark"
  );
};

if (localStorage.getItem("fc-theme") === "light") {
  document.body.classList.add("light");
}

// ==========================================
// STATUS
// ==========================================

$("presence").onchange = async () => {
  const status = $("presence").value;

  const { error } = await db
    .from("profiles")
    .update({ status })
    .eq("id", S.user.id);

  if (error) {
    toast(error.message);
  } else {
    S.profile.status = status;
    renderMe();
  }
};

// ==========================================
// FRIENDS
// Datenbankspalten:
// requester_id
// addressee_id
// status
// ==========================================

async function loadFriends() {
  const { data: relations, error } = await db
    .from("friendships")
    .select("*")
    .or(
      `requester_id.eq.${S.user.id},addressee_id.eq.${S.user.id}`
    )
    .eq("status", "accepted");

  if (error) {
    toast("Freunde konnten nicht geladen werden: " + error.message);
    return;
  }

  const ids = (relations || []).map(relation =>
    relation.requester_id === S.user.id
      ? relation.addressee_id
      : relation.requester_id
  );

  const { data: profiles, error: profileError } = ids.length
    ? await db
        .from("profiles")
        .select("*")
        .in("id", ids)
    : { data: [], error: null };

  if (profileError) {
    toast(profileError.message);
    return;
  }

  S.friends = profiles || [];

  $("dm-list").innerHTML = S.friends
    .map(profile => `
      <div class="nav-item" data-peer="${profile.id}">
        <div class="avatar-small">
          ${avatar(profile.avatar_url)}
        </div>

        <span>${esc(profile.username)}</span>

        <small>
          ${statusNames[profile.status] || "Offline"}
        </small>
      </div>
    `)
    .join("") || '<p class="hint">Noch keine Freunde. Suche oben nach Nutzern.</p>';

  $("dm-list")
    .querySelectorAll("[data-peer]")
    .forEach(element => {
      element.onclick = () => {
        const peer = S.friends.find(
          profile => profile.id === element.dataset.peer
        );

        openDM(peer);
      };
    });

  // Eingehende Freundschaftsanfragen
  const { data: requests, error: requestError } = await db
    .from("friendships")
    .select("id, requester_id")
    .eq("addressee_id", S.user.id)
    .eq("status", "pending");

  if (requestError) {
    toast(requestError.message);
    return;
  }

  const requesterIds = (requests || []).map(
    request => request.requester_id
  );

  const { data: requestProfiles } = requesterIds.length
    ? await db
        .from("profiles")
        .select("id, username")
        .in("id", requesterIds)
    : { data: [] };

  $("requests-list").innerHTML = (requests || [])
    .map(request => {
      const profile = requestProfiles?.find(
        item => item.id === request.requester_id
      );

      return `
        <div class="nav-item">
          <span>${esc(profile?.username || "Anfrage")}</span>

          <button data-accept="${request.id}">
            ✓
          </button>

          <button data-reject="${request.id}">
            ×
          </button>
        </div>
      `;
    })
    .join("") || '<p class="hint">Keine offenen Anfragen.</p>';

  $("requests-list")
    .querySelectorAll("[data-accept]")
    .forEach(button => {
      button.onclick = () =>
        answerRequest(button.dataset.accept, "accepted");
    });

  $("requests-list")
    .querySelectorAll("[data-reject]")
    .forEach(button => {
      button.onclick = () =>
        answerRequest(button.dataset.reject, "rejected");
    });
}

async function answerRequest(id, status) {
  const { error } = await db
    .from("friendships")
    .update({ status })
    .eq("id", id)
    .eq("addressee_id", S.user.id);

  if (error) {
    toast(error.message);
  } else {
    toast(
      status === "accepted"
        ? "Freundschaftsanfrage angenommen!"
        : "Anfrage abgelehnt."
    );

    await loadFriends();
  }
}

// ==========================================
// USER SEARCH / ADD FRIEND
// ==========================================

$("search-btn").onclick = searchUsers;

$("friend-search").onkeydown = event => {
  if (event.key === "Enter") {
    searchUsers();
  }
};

async function searchUsers() {
  const query = $("friend-search").value.trim();

  if (query.length < 2) return;

  const { data, error } = await db
    .from("profiles")
    .select("id, username")
    .ilike("username", `%${query}%`)
    .neq("id", S.user.id)
    .limit(10);

  if (error) {
    toast(error.message);
    return;
  }

  $("search-results").innerHTML = (data || [])
    .map(profile => `
      <div class="nav-item">
        <span>${esc(profile.username)}</span>
        <button data-add="${profile.id}">＋</button>
      </div>
    `)
    .join("") || '<p class="hint">Keine Nutzer gefunden.</p>';

  $("search-results")
    .querySelectorAll("[data-add]")
    .forEach(button => {
      button.onclick = async () => {
        const targetId = button.dataset.add;

        if (!S.user?.id || !targetId) {
          toast("Nutzer konnte nicht gefunden werden.");
          return;
        }

        // Prüfen, ob bereits eine Beziehung besteht
        const { data: existing, error: checkError } = await db
          .from("friendships")
          .select("id, status")
          .or(
            `and(requester_id.eq.${S.user.id},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${S.user.id})`
          );

        if (checkError) {
          toast(checkError.message);
          return;
        }

        if (existing?.length) {
          toast("Für diese Nutzer besteht bereits eine Anfrage oder Freundschaft.");
          return;
        }

        // Freundschaftsanfrage erstellen
        const { error } = await db
          .from("friendships")
          .insert({
            requester_id: S.user.id,
            addressee_id: targetId,
            status: "pending"
          });

        if (error) {
          toast("Anfrage fehlgeschlagen: " + error.message);
        } else {
          toast("Freundschaftsanfrage gesendet!");

          button.disabled = true;
          button.textContent = "✓";
        }
      };
    });
}

// ==========================================
// DIRECT MESSAGES
// ==========================================

async function openDM(peer) {
  if (!peer) return;

  S.mode = "dm";
  S.peer = peer;
  S.channel = null;
  S.server = null;

  showChat(
    peer.username,
    `Direktnachricht · ${statusNames[peer.status] || "Offline"}`
  );

  await loadMessages();
}

function showChat(title, subtitle) {
  $("welcome").classList.add("hidden");
  $("messages").classList.remove("hidden");
  $("message-form").classList.remove("hidden");

  $("chat-title").textContent = title;
  $("chat-subtitle").textContent = subtitle;

  $("chat-context").textContent =
    S.mode === "dm"
      ? "DIREKTNACHRICHT"
      : "SERVERKANAL";

  $("app").classList.add("chat-open");
}

async function loadMessages() {
  let query = db
    .from("messages")
    .select("*,profiles(username,avatar_url)")
    .order("created_at")
    .limit(100);

  if (S.mode === "dm") {
    if (!S.peer) return;

    query = query
      .eq("kind", "dm")
      .or(
        `and(sender_id.eq.${S.user.id},recipient_id.eq.${S.peer.id}),and(sender_id.eq.${S.peer.id},recipient_id.eq.${S.user.id})`
      );
  } else {
    if (!S.channel) return;

    query = query.eq("channel_id", S.channel.id);
  }

  const { data, error } = await query;

  if (error) {
    toast(error.message);
    return;
  }

  renderMessages(data || []);
}

function renderMessages(rows) {
  $("messages").innerHTML = rows
    .map(message => `
      <article class="message">
        <div class="avatar-small">
          ${avatar(message.profiles?.avatar_url)}
        </div>

        <div class="message-body">
          <div class="message-top">
            <b>${esc(message.profiles?.username || "Nutzer")}</b>

            <time>
              ${new Date(message.created_at).toLocaleString("de-DE")}
            </time>

            ${
              message.sender_id === S.user.id
                ? `
                  <span class="message-actions">
                    <button
                      data-edit="${message.id}"
                      data-text="${esc(message.content)}"
                    >
                      Bearbeiten
                    </button>

                    <button data-del="${message.id}">
                      Löschen
                    </button>
                  </span>
                `
                : ""
            }
          </div>

          <div class="message-text">
            ${esc(message.content)}
          </div>
        </div>
      </article>
    `)
    .join("");

  $("messages").scrollTop = $("messages").scrollHeight;

  $("messages")
    .querySelectorAll("[data-del]")
    .forEach(button => {
      button.onclick = () =>
        deleteMessage(button.dataset.del);
    });

  $("messages")
    .querySelectorAll("[data-edit]")
    .forEach(button => {
      button.onclick = () =>
        editMessage(
          button.dataset.edit,
          button.dataset.text
        );
    });
}

// ==========================================
// SEND MESSAGE
// ==========================================

$("message-form").onsubmit = async event => {
  event.preventDefault();

  const content = $("message-input").value.trim();

  if (!content) return;

  const row = {
    sender_id: S.user.id,
    content,
    kind: S.mode
  };

  if (S.mode === "dm") {
    if (!S.peer) return;

    row.recipient_id = S.peer.id;
  } else {
    if (!S.channel) return;

    row.channel_id = S.channel.id;
  }

  const { error } = await db
    .from("messages")
    .insert(row);

  if (error) {
    toast(error.message);
  } else {
    $("message-input").value = "";
    await loadMessages();
  }
};

$("emoji-btn").onclick = () => {
  $("message-input").value += " 😊";
  $("message-input").focus();
};

async function deleteMessage(id) {
  if (!confirm("Nachricht wirklich löschen?")) return;

  const { error } = await db
    .from("messages")
    .delete()
    .eq("id", id);

  if (error) {
    toast(error.message);
  } else {
    await loadMessages();
  }
}

async function editMessage(id, oldText) {
  const next = prompt("Nachricht bearbeiten:", oldText);

  if (next === null || !next.trim()) return;

  const { error } = await db
    .from("messages")
    .update({
      content: next.trim(),
      edited_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    toast(error.message);
  } else {
    await loadMessages();
  }
}

// ==========================================
// SERVERS
// ==========================================

async function loadServers() {
  const { data, error } = await db
    .from("server_members")
    .select("server_id,servers(id,name,icon_url,invite_code)")
    .eq("user_id", S.user.id);

  if (error) {
    toast(error.message);
    return;
  }

  S.servers = (data || [])
    .map(item => item.servers)
    .filter(Boolean);

  $("server-list").innerHTML = S.servers
    .map(server => `
      <button
        class="server-icon"
        data-server="${server.id}"
        title="${esc(server.name)}"
      >
        ${
          server.icon_url
            ? avatar(server.icon_url)
            : esc(server.name.slice(0, 2).toUpperCase())
        }
      </button>
    `)
    .join("");

  $("server-list")
    .querySelectorAll("[data-server]")
    .forEach(button => {
      button.onclick = () => {
        const server = S.servers.find(
          item => item.id === button.dataset.server
        );

        openServer(server);
      };
    });
}

async function openServer(server) {
  if (!server) return;

  S.server = server;
  S.mode = "server";
  S.peer = null;
  S.channel = null;

  $("friends-panel").classList.add("hidden");
  $("server-panel").classList.remove("hidden");

  $("side-title").textContent = server.name;
  $("server-name").textContent = server.name;

  const { data, error } = await db
    .from("channels")
    .select("*")
    .eq("server_id", server.id)
    .order("created_at");

  if (error) {
    toast(error.message);
    return;
  }

  S.channels = data || [];

  $("channel-list").innerHTML = S.channels
    .map(channel => `
      <div class="nav-item" data-channel="${channel.id}">
        # <span>${esc(channel.name)}</span>
      </div>
    `)
    .join("") || '<p class="hint">Noch keine Kanäle.</p>';

  $("channel-list")
    .querySelectorAll("[data-channel]")
    .forEach(element => {
      element.onclick = () => {
        const channel = S.channels.find(
          item => item.id === element.dataset.channel
        );

        openChannel(channel);
      };
    });
}

async function openChannel(channel) {
  if (!channel) return;

  S.channel = channel;
  S.mode = "server";

  showChat("# " + channel.name, S.server.name);

  await loadMessages();
}

// ==========================================
// HOME BUTTON
// ==========================================

$("home-btn").onclick = () => {
  $("friends-panel").classList.remove("hidden");
  $("server-panel").classList.add("hidden");

  $("side-title").textContent = "Freunde";

  $("app").classList.remove("chat-open");

  $("welcome").classList.remove("hidden");
  $("messages").classList.add("hidden");
  $("message-form").classList.add("hidden");

  S.mode = "dm";
  S.peer = null;
  S.server = null;
  S.channel = null;
};

// ==========================================
// DIALOGS
// ==========================================

function simpleDialog(title, fields, confirmText, callback) {
  $("simple-title").textContent = title;
  $("simple-confirm").textContent = confirmText;

  $("simple-body").innerHTML = fields
    .map(field => `
      <label>
        ${field.label}

        <input
          id="field-${field.id}"
          placeholder="${field.placeholder || ""}"
          maxlength="${field.max || 100}"
          required
        >
      </label>
    `)
    .join("");

  $("simple-dialog").showModal();

  $("simple-form").onsubmit = async event => {
    event.preventDefault();

    const values = Object.fromEntries(
      fields.map(field => [
        field.id,
        $("field-" + field.id).value.trim()
      ])
    );

    await callback(values);

    $("simple-dialog").close();
  };
}

// ==========================================
// CREATE SERVER
// ==========================================

$("create-server").onclick = () => {
  simpleDialog(
    "Server erstellen",
    [
      {
        id: "name",
        label: "Servername",
        max: 40
      }
    ],
    "Erstellen",
    createServer
  );
};

async function createServer(values) {
  const code = crypto.randomUUID()
    .slice(0, 8)
    .toUpperCase();

  const { data, error } = await db
    .from("servers")
    .insert({
      name: values.name,
      owner_id: S.user.id,
      invite_code: code
    })
    .select()
    .single();

  if (error) {
    toast(error.message);
    return;
  }

  const result = await db
    .from("server_members")
    .insert({
      server_id: data.id,
      user_id: S.user.id
    });

  if (result.error) {
    toast(result.error.message);
  } else {
    toast("Server erstellt!");

    await loadServers();
    await openServer(data);
  }
}

// ==========================================
// JOIN SERVER
// ==========================================

$("join-server").onclick = () => {
  simpleDialog(
    "Server beitreten",
    [
      {
        id: "code",
        label: "Einladungscode",
        max: 20
      }
    ],
    "Beitreten",
    async values => {
      const { error } = await db.rpc(
        "join_server_by_code",
        {
          invite_code_input: values.code
        }
      );

      if (error) {
        toast(error.message);
      } else {
        toast("Server beigetreten!");
        await loadServers();
      }
    }
  );
};

// ==========================================
// CREATE CHANNEL
// ==========================================

$("create-channel").onclick = () => {
  if (!S.server) return;

  simpleDialog(
    "Textkanal erstellen",
    [
      {
        id: "name",
        label: "Kanalname",
        max: 40
      }
    ],
    "Erstellen",
    async values => {
      const { error } = await db
        .from("channels")
        .insert({
          server_id: S.server.id,
          name: values.name,
          created_by: S.user.id
        });

      if (error) {
        toast(error.message);
      } else {
        await openServer(S.server);
      }
    }
  );
};

// ==========================================
// INVITE COPY
// ==========================================

$("invite-copy").onclick = () => {
  if (!S.server?.invite_code) return;

  navigator.clipboard
    .writeText(S.server.invite_code)
    .then(() => {
      toast("Einladungscode kopiert: " + S.server.invite_code);
    })
    .catch(() => {
      toast("Einladungscode konnte nicht kopiert werden.");
    });
};

// ==========================================
// PROFILE
// ==========================================

$("profile-open").onclick = () => {
  const profile = S.profile;

  $("profile-name").value = profile.username || "";
  $("profile-bio").value = profile.bio || "";

  $("avatar-preview").innerHTML = avatar(profile.avatar_url);

  $("banner-preview").style.backgroundImage =
    profile.banner_url
      ? `url("${profile.banner_url}")`
      : "";

  $("profile-dialog").showModal();
};

$("avatar-upload").onclick = () => pickImage("avatar");
$("banner-upload").onclick = () => pickImage("banner");

function pickImage(kind) {
  S.cropKind = kind;
  $("image-file").click();
}

// ==========================================
// IMAGE UPLOAD / CROP
// ==========================================

$("image-file").onchange = event => {
  const file = event.target.files[0];

  if (!file) return;

  if (
    !file.type.startsWith("image/") ||
    file.size > 8 * 1024 * 1024
  ) {
    toast("Bitte ein Bild unter 8 MB wählen.");
    return;
  }

  S.cropFile = file;

  const url = URL.createObjectURL(file);

  $("crop-image").src = url;

  S.cropImage = new Image();
  S.cropImage.src = url;

  S.cropScale = 1;
  S.cropX = 0;
  S.cropY = 0;

  $("crop-zoom").value = 1;

  S.cropImage.onload = updateCrop;

  $("crop-dialog").showModal();

  event.target.value = "";
};

function updateCrop() {
  const stage = $("crop-stage");
  const image = $("crop-image");

  if (!S.cropImage?.width || !stage.clientWidth) return;

  const width = stage.clientWidth;
  const height = stage.clientHeight;

  const base = Math.max(
    width / S.cropImage.width,
    height / S.cropImage.height
  );

  const scale = base * S.cropScale;

  image.style.width = S.cropImage.width * scale + "px";
  image.style.height = S.cropImage.height * scale + "px";

  image.style.left =
    ((width - S.cropImage.width * scale) / 2 + S.cropX) + "px";

  image.style.top =
    ((height - S.cropImage.height * scale) / 2 + S.cropY) + "px";
}

$("crop-zoom").oninput = event => {
  S.cropScale = Number(event.target.value);
  updateCrop();
};

$("crop-stage").onpointerdown = event => {
  S.drag = {
    x: event.clientX - S.cropX,
    y: event.clientY - S.cropY
  };

  $("crop-stage").setPointerCapture(event.pointerId);
};

$("crop-stage").onpointermove = event => {
  if (!S.drag) return;

  S.cropX = event.clientX - S.drag.x;
  S.cropY = event.clientY - S.drag.y;

  updateCrop();
};

$("crop-stage").onpointerup = () => {
  S.drag = null;
};

$("crop-save").onclick = async event => {
  event.preventDefault();

  const kind = S.cropKind;
  const stage = $("crop-stage");
  const image = $("crop-image");

  const canvas = document.createElement("canvas");

  canvas.width = kind === "avatar" ? 512 : 1200;
  canvas.height = kind === "avatar" ? 512 : 400;

  const context = canvas.getContext("2d");

  const stageRect = stage.getBoundingClientRect();
  const imageRect = image.getBoundingClientRect();

  const sx =
    (stageRect.left - imageRect.left) /
    imageRect.width *
    S.cropImage.width;

  const sy =
    (stageRect.top - imageRect.top) /
    imageRect.height *
    S.cropImage.height;

  const sw =
    stageRect.width /
    imageRect.width *
    S.cropImage.width;

  const sh =
    stageRect.height /
    imageRect.height *
    S.cropImage.height;

  context.drawImage(
    S.cropImage,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, "image/webp", 0.88);
  });

  if (!blob) {
    toast("Bild konnte nicht verarbeitet werden.");
    return;
  }

  const path =
    `${S.user.id}/${kind}-${Date.now()}.webp`;

  const { error } = await db.storage
    .from("profile-media")
    .upload(path, blob, {
      contentType: "image/webp"
    });

  if (error) {
    toast(error.message);
    return;
  }

  const { data } = db.storage
    .from("profile-media")
    .getPublicUrl(path);

  S[kind + "Pending"] = data.publicUrl;

  if (kind === "avatar") {
    $("avatar-preview").innerHTML = avatar(data.publicUrl);
  } else {
    $("banner-preview").style.backgroundImage =
      `url("${data.publicUrl}")`;
  }

  $("crop-dialog").close();
};

// ==========================================
// SAVE PROFILE
// ==========================================

$("profile-save").onclick = async event => {
  event.preventDefault();

  const updates = {
    username: $("profile-name").value.trim(),
    bio: $("profile-bio").value.trim()
  };

  if (S.avatarPending) {
    updates.avatar_url = S.avatarPending;
  }

  if (S.bannerPending) {
    updates.banner_url = S.bannerPending;
  }

  const { data, error } = await db
    .from("profiles")
    .update(updates)
    .eq("id", S.user.id)
    .select()
    .single();

  if (error) {
    toast(error.message);
  } else {
    S.profile = data;

    S.avatarPending = null;
    S.bannerPending = null;

    renderMe();

    $("profile-dialog").close();

    toast("Profil gespeichert!");
  }
};

// ==========================================
// ERROR HANDLING
// ==========================================

window.addEventListener("error", event => {
  console.error(
    "FriendChat JavaScript-Fehler:",
    event.error || event.message
  );

  const hint = $("auth-hint");

  if (hint) {
    hint.textContent =
      "JavaScript-Fehler: " +
      (event.message || "Unbekannter Fehler") +
      " – Details findest du in der Browser-Konsole (F12).";
  }
});

window.addEventListener("unhandledrejection", event => {
  console.error(
    "FriendChat Promise-Fehler:",
    event.reason
  );

  const hint = $("auth-hint");

  if (hint) {
    hint.textContent =
      "Fehler: " +
      (event.reason?.message || String(event.reason));
  }
});

// ==========================================
// START
// ==========================================

init();
