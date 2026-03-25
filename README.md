# U2 Day Live Wall

A real-time web app for student events where posts appear instantly on a shared on-screen wall.

## What it does

- Lets students submit a short post with a name and bubble colour
- Broadcasts new posts to every open browser in real time using Server-Sent Events
- Shows posts as colourful bubbles on the wall
- Expands any bubble into a full-screen style focus card when clicked
- Runs as a small Node app that can be deployed on Render

## Important note

Posts are currently stored in server memory. That means:

- it works well for a live event while the service stays running
- posts will reset if the Render service restarts or redeploys

If you want, the next step can be adding permanent storage or a moderation queue.

## Run locally

```sh
cd /Users/tomlandy/Documents/Playground
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Render

1. Push this project to GitHub.
2. In Render, create a new `Web Service`.
3. Connect the repo.
4. Use these settings:

```text
Environment: Node
Build Command: npm install
Start Command: npm start
```

5. Deploy and open the site URL on the big screen.

## Suggested event setup

- Open the app on the projector screen to show the wall.
- Let students visit the same URL on their own devices to submit posts.
- Click any bubble on the wall to expand it for discussion.

## Main files

- `index.html`: page structure for posting and the live wall
- `styles.css`: visual design, bubble styling, and responsive layout
- `app.js`: front-end submission logic, live updates, and expanded post dialog
- `server.js`: static server, JSON API, and real-time event stream
- `render.yaml`: Render Blueprint config
