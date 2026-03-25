const MAX_POSTS = 60;

const state = {
  posts: [],
  stream: null,
};

const els = {
  form: document.querySelector("#post-form"),
  authorInput: document.querySelector("#author-input"),
  messageInput: document.querySelector("#message-input"),
  themeInput: document.querySelector("#theme-input"),
  submitButton: document.querySelector("#submit-button"),
  formFeedback: document.querySelector("#form-feedback"),
  connectionStatus: document.querySelector("#connection-status"),
  postCount: document.querySelector("#post-count"),
  refreshButton: document.querySelector("#refresh-button"),
  bubbleGrid: document.querySelector("#bubble-grid"),
  emptyState: document.querySelector("#empty-state"),
  bubbleTemplate: document.querySelector("#bubble-template"),
  dialog: document.querySelector("#message-dialog"),
  dialogAuthor: document.querySelector("#dialog-author"),
  dialogMessage: document.querySelector("#dialog-message"),
  dialogMeta: document.querySelector("#dialog-meta"),
};

initialise();

async function initialise() {
  bindEvents();
  await loadPosts();
  connectStream();
}

function bindEvents() {
  els.form.addEventListener("submit", handleSubmit);
  els.refreshButton.addEventListener("click", loadPosts);
}

async function handleSubmit(event) {
  event.preventDefault();

  const payload = {
    author: els.authorInput.value.trim(),
    message: els.messageInput.value.trim(),
    theme: els.themeInput.value,
  };

  if (!payload.message) {
    setFeedback("Write a message before posting.", true);
    return;
  }

  setSubmitting(true);

  try {
    const response = await fetch("/api/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Unable to post right now.");
    }

    els.messageInput.value = "";
    setFeedback("Posted to the live wall.");
    await loadPosts();
  } catch (error) {
    setFeedback(error.message || "Something went wrong while posting.", true);
  } finally {
    setSubmitting(false);
  }
}

async function loadPosts() {
  try {
    const response = await fetch("/api/posts", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Unable to load posts.");
    }

    const data = await response.json();
    state.posts = Array.isArray(data.posts) ? data.posts.slice(0, MAX_POSTS) : [];
    renderPosts();
    setConnectionStatus(true);
  } catch {
    setConnectionStatus(false);
  }
}

function connectStream() {
  if (!window.EventSource) {
    setConnectionStatus(false);
    return;
  }

  state.stream?.close();
  const stream = new EventSource("/api/stream");
  state.stream = stream;

  stream.addEventListener("open", () => {
    setConnectionStatus(true);
  });

  stream.addEventListener("snapshot", (event) => {
    updatePosts(event.data);
  });

  stream.addEventListener("post", (event) => {
    const nextPost = parseJson(event.data);
    if (!nextPost) {
      return;
    }

    state.posts = [nextPost, ...state.posts.filter((item) => item.id !== nextPost.id)].slice(0, MAX_POSTS);
    renderPosts();
  });

  stream.addEventListener("error", () => {
    setConnectionStatus(false);
  });
}

function updatePosts(raw) {
  const data = parseJson(raw);
  if (!data || !Array.isArray(data.posts)) {
    return;
  }

  state.posts = data.posts.slice(0, MAX_POSTS);
  renderPosts();
}

function renderPosts() {
  els.postCount.textContent = String(state.posts.length);
  els.emptyState.classList.toggle("is-hidden", state.posts.length > 0);

  const nodes = state.posts.map((post) => renderBubble(post));
  els.bubbleGrid.replaceChildren(...nodes);
}

function renderBubble(post) {
  const node = els.bubbleTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.theme = post.theme;
  node.querySelector(".bubble-author").textContent = post.author || "Anonymous";
  node.querySelector(".bubble-message").textContent = post.message;
  node.querySelector(".bubble-time").textContent = formatTime(post.createdAt);
  node.addEventListener("click", () => openDialog(post));
  return node;
}

function openDialog(post) {
  els.dialogAuthor.textContent = post.author || "Anonymous";
  els.dialogMessage.textContent = post.message;
  els.dialogMeta.textContent = `Posted ${formatDateTime(post.createdAt)} · Theme: ${capitalise(post.theme)}`;
  els.dialog.showModal();
}

function setSubmitting(isSubmitting) {
  els.submitButton.disabled = isSubmitting;
  els.submitButton.textContent = isSubmitting ? "Posting..." : "Post to live wall";
}

function setFeedback(message, isError = false) {
  els.formFeedback.textContent = message;
  els.formFeedback.classList.toggle("status-offline", isError);
  els.formFeedback.classList.toggle("status-live", !isError);
}

function setConnectionStatus(isLive) {
  els.connectionStatus.textContent = isLive ? "Live" : "Reconnecting";
  els.connectionStatus.classList.toggle("status-live", isLive);
  els.connectionStatus.classList.toggle("status-offline", !isLive);
}

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function capitalise(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
