const MAX_POSTS = 60;
const STUDENT_NAME_KEY = "u2day-livewall-student-name";

const page = document.body.dataset.page || "dashboard";

const state = {
  posts: [],
  stream: null,
  selectedPostId: null,
  lockedName: loadLockedName(),
};

const els = {
  form: document.querySelector("#post-form"),
  authorInput: document.querySelector("#author-input"),
  messageInput: document.querySelector("#message-input"),
  themeInput: document.querySelector("#theme-input"),
  submitButton: document.querySelector("#submit-button"),
  formFeedback: document.querySelector("#form-feedback"),
  lockNameInput: document.querySelector("#lock-name-input"),
  lockNameButton: document.querySelector("#lock-name-button"),
  lockHeading: document.querySelector("#lock-heading"),
  lockFeedback: document.querySelector("#lock-feedback"),
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
  dialogDelete: document.querySelector("#dialog-delete"),
};

initialise();

async function initialise() {
  bindEvents();
  renderLockedName();
  await loadPosts();
  connectStream();
}

function bindEvents() {
  els.form?.addEventListener("submit", handleSubmit);
  els.refreshButton?.addEventListener("click", loadPosts);
  els.lockNameButton?.addEventListener("click", handleLockName);
  els.dialogDelete?.addEventListener("click", handleDialogDelete);
}

function handleLockName() {
  const candidate = sanitiseText(els.lockNameInput?.value || "", 40);
  if (!candidate) {
    setLockFeedback("Enter the student name before locking it.", true);
    return;
  }

  state.lockedName = candidate;
  localStorage.setItem(STUDENT_NAME_KEY, candidate);
  renderLockedName();
  setLockFeedback(`This device is now locked to ${candidate}.`, false);
  setFeedback("Student name locked. Posts will use this name.", false);
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.lockedName) {
    setFeedback("Lock this device to a student name before posting.", true);
    return;
  }

  const payload = {
    author: state.lockedName,
    message: (els.messageInput?.value || "").trim(),
    theme: els.themeInput?.value || "sunrise",
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

    if (els.messageInput) {
      els.messageInput.value = "";
    }
    setFeedback("Posted to the live wall.");
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

  stream.addEventListener("delete", (event) => {
    const deleted = parseJson(event.data);
    if (!deleted?.id) {
      return;
    }

    state.posts = state.posts.filter((item) => item.id !== deleted.id);
    if (state.selectedPostId === deleted.id) {
      state.selectedPostId = null;
      if (els.dialog?.open) {
        els.dialog.close();
      }
    }
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
  if (state.selectedPostId && !state.posts.some((post) => post.id === state.selectedPostId)) {
    state.selectedPostId = null;
    if (els.dialog?.open) {
      els.dialog.close();
    }
  }
  renderPosts();
}

function renderLockedName() {
  const hasLockedName = Boolean(state.lockedName);

  if (els.authorInput) {
    els.authorInput.value = state.lockedName || "";
    els.authorInput.readOnly = true;
  }

  if (els.lockNameInput) {
    els.lockNameInput.value = state.lockedName || "";
    els.lockNameInput.readOnly = hasLockedName;
  }

  if (els.lockNameButton) {
    els.lockNameButton.textContent = hasLockedName ? "Name locked" : "Lock name";
    els.lockNameButton.disabled = hasLockedName;
  }

  if (els.lockHeading) {
    els.lockHeading.textContent = hasLockedName
      ? "This device is locked to one student"
      : "Lock this device to a student name";
  }
}

function renderPosts() {
  if (els.postCount) {
    els.postCount.textContent = String(state.posts.length);
  }

  if (els.emptyState) {
    els.emptyState.classList.toggle("is-hidden", state.posts.length > 0);
  }

  if (!els.bubbleGrid || !els.bubbleTemplate) {
    return;
  }

  const nodes = state.posts.map((post) => renderBubbleCard(post));
  els.bubbleGrid.replaceChildren(...nodes);
}

function renderBubbleCard(post) {
  const node = els.bubbleTemplate.content.firstElementChild.cloneNode(true);
  const bubble = node.querySelector(".bubble");
  const deleteButton = node.querySelector(".bubble-delete");

  if (bubble) {
    bubble.dataset.theme = post.theme;
    bubble.querySelector(".bubble-author").textContent = post.author;
    bubble.querySelector(".bubble-message").textContent = post.message;
    bubble.querySelector(".bubble-time").textContent = formatTime(post.createdAt);
    bubble.addEventListener("click", () => openDialog(post));
  }

  if (deleteButton) {
    deleteButton.classList.toggle("is-hidden", page !== "dashboard");
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deletePost(post.id);
    });
  }

  return node;
}

function openDialog(post) {
  if (!els.dialog || !els.dialogAuthor || !els.dialogMessage || !els.dialogMeta) {
    return;
  }

  state.selectedPostId = post.id;
  els.dialogAuthor.textContent = post.author;
  els.dialogMessage.textContent = post.message;
  els.dialogMeta.textContent = `Posted ${formatDateTime(post.createdAt)} · Theme: ${capitalise(post.theme)}`;

  if (els.dialogDelete) {
    els.dialogDelete.dataset.postId = post.id;
    els.dialogDelete.classList.toggle("is-hidden", page !== "dashboard");
  }

  els.dialog.showModal();
}

async function handleDialogDelete() {
  const postId = els.dialogDelete?.dataset.postId;
  if (!postId) {
    return;
  }

  await deletePost(postId);
}

async function deletePost(postId) {
  try {
    const response = await fetch(`/api/posts/${postId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Unable to delete that post.");
    }

    state.posts = state.posts.filter((item) => item.id !== postId);
    if (state.selectedPostId === postId) {
      state.selectedPostId = null;
      if (els.dialog?.open) {
        els.dialog.close();
      }
    }
    renderPosts();
  } catch (error) {
    setFeedback(error.message || "Unable to delete that post.", true);
  }
}

function setSubmitting(isSubmitting) {
  if (!els.submitButton) {
    return;
  }

  els.submitButton.disabled = isSubmitting;
  els.submitButton.textContent = isSubmitting ? "Posting..." : "Post to live wall";
}

function setFeedback(message, isError = false) {
  if (!els.formFeedback) {
    return;
  }

  els.formFeedback.textContent = message;
  els.formFeedback.classList.toggle("status-offline", isError);
  els.formFeedback.classList.toggle("status-live", !isError);
}

function setLockFeedback(message, isError = false) {
  if (!els.lockFeedback) {
    return;
  }

  els.lockFeedback.textContent = message;
  els.lockFeedback.classList.toggle("status-offline", isError);
  els.lockFeedback.classList.toggle("status-live", !isError);
}

function setConnectionStatus(isLive) {
  if (!els.connectionStatus) {
    return;
  }

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

function loadLockedName() {
  try {
    return sanitiseText(localStorage.getItem(STUDENT_NAME_KEY) || "", 40);
  } catch {
    return "";
  }
}

function sanitiseText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
