import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import process from "node:process";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.RENDER ? "0.0.0.0" : process.env.HOST || "127.0.0.1";
const ROOT = process.cwd();
const MAX_POSTS = 60;
const MAX_HEADING_LENGTH = 60;
const MAX_BODY_LENGTH = 280;
const MAX_AUTHOR_LENGTH = 40;
const THEMES = new Set(["sunrise", "lagoon", "meadow", "berry", "gold"]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const posts = [];
const clients = new Set();

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/posts") {
    sendJson(res, 200, { posts });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/posts") {
    const body = await readJsonBody(req, res);
    if (!body) {
      return;
    }

    const author = sanitiseText(body.author, MAX_AUTHOR_LENGTH) || "Anonymous";
    const heading = sanitiseText(body.heading, MAX_HEADING_LENGTH);
    const bodyText = sanitiseText(body.body, MAX_BODY_LENGTH);
    const theme = THEMES.has(body.theme) ? body.theme : "sunrise";

    if (!heading) {
      sendJson(res, 400, { error: "Please enter a heading before posting." });
      return;
    }

    if (!bodyText) {
      sendJson(res, 400, { error: "Please enter a body message before posting." });
      return;
    }

    const post = {
      id: crypto.randomUUID(),
      author,
      heading,
      body: bodyText,
      theme,
      createdAt: new Date().toISOString(),
    };

    posts.unshift(post);
    posts.splice(MAX_POSTS);
    broadcast("post", post);
    sendJson(res, 201, { post });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/posts/")) {
    const postId = decodeURIComponent(url.pathname.slice("/api/posts/".length));
    const index = posts.findIndex((post) => post.id === postId);

    if (index === -1) {
      sendJson(res, 404, { error: "Post not found." });
      return;
    }

    posts.splice(index, 1);
    broadcast("delete", { id: postId });
    sendJson(res, 200, { ok: true, id: postId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/stream") {
    openEventStream(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method not allowed");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = safePath(requestedPath);

  if (!filePath) {
    sendText(res, 400, "Bad request");
    return;
  }

  const fallbackPath = join(ROOT, "index.html");
  const targetPath = existsSync(filePath) && statSync(filePath).isFile() ? filePath : fallbackPath;
  const extension = extname(targetPath);

  res.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(targetPath).pipe(res);
}).listen(PORT, HOST, () => {
  console.log(`U2 Day Live Wall is running on http://${HOST}:${PORT}`);
});

function openEventStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  res.write(encodeEvent("snapshot", { posts }));
  clients.add(res);

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

function broadcast(eventName, payload) {
  const message = encodeEvent(eventName, payload);
  clients.forEach((client) => client.write(message));
}

function encodeEvent(eventName, payload) {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function safePath(requestedPath) {
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = join(ROOT, normalizedPath);
  return absolutePath.startsWith(ROOT) ? absolutePath : null;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sanitiseText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function readJsonBody(req, res) {
  return new Promise((resolve) => {
    let rawBody = "";

    req.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 20000) {
        sendJson(res, 413, { error: "Request body is too large." });
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch {
        sendJson(res, 400, { error: "Invalid JSON payload." });
        resolve(null);
      }
    });

    req.on("error", () => {
      sendJson(res, 400, { error: "Unable to read the request." });
      resolve(null);
    });
  });
}
