# 🦆 Inverted Duck Race (PATOS) — Real-Time Multiplayer (Express + Socket.IO)

> Built for the course **“Tópicos de Calidad y Software”**.

A fast, local-network multiplayer game where **the last duck wins** — players move their ducks on a shared track, and the host can import a class list from Excel to auto-name participants.  
Real-time sync is powered by **Socket.IO** with an **Express** server and a vanilla HTML/CSS/JS client.

## ✨ Features
- 🧩 **Rooms with join codes** (host creates, others join).
- 👥 **Up to 35 players per room** (configurable in `server.js`).
- 🖥️ **LAN-friendly**: play across devices on the same Wi-Fi.
- 📚 **Excel import (.xlsx)** to preload student names (via `xlsx` CDN).
- 🎨 **Customization**: color palettes, unique colors per duck, optional accessories (👑🕶️🎧).
- 🏁 **Game flow**: create → join → (optional) import students → start → live updates → end with ranking.

## 🛠️ Tech Stack
- **Node.js** with **Express ^5.1.0**
- **Socket.IO ^4.8.1** for real-time communication
- **Vanilla HTML/CSS/JS** client served from `/public`
- **xlsx** (CDN) for Excel parsing in the browser

## 📦 Requirements
- Node.js 18+ and npm
- A shared local network (for multiplayer across devices)

## 🚀 Getting Started
```bash
# 1) Install dependencies
npm install

# 2) Run the server
node server.js
# (optional) add a start script in package.json:  "start": "node server.js"

# 3) Open the client
# Browser: http://localhost:3000
