# ytdl-node

A [NodeLink](https://github.com/PerformanC/NodeLink) plugin that uses **yt-dlp** to resolve audio tracks from **1000+ websites**.

No more broken YouTube sources or missing sites — yt-dlp handles everything.

## Features

- **1000+ supported sites** — YouTube, Spotify, SoundCloud, Bandcamp, Vimeo, Twitch, and more
- **Direct streaming** — Extracts best audio URL via yt-dlp
- **Search support** — Use `ytdl:<query>` to search YouTube
- **Playlist support** — Auto-detects playlists and albums
- **Zero config** — Just have yt-dlp installed

## Requirements

- [NodeLink](https://github.com/PerformanC/NodeLink) v3+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on the system

```bash
# Install yt-dlp
pipx install yt-dlp
# or
brew install yt-dlp
# or
winget install yt-dlp
```

## Installation

Install via npm or clone the repo.

### npm

Create a `.npmrc` in your NodeLink folder:

```
@freepinkg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=seu_token_do_github
```

Then:

```bash
npm install @freepinkg/ytdl-node
```

Add to `config.js`:

```js
{
  name: 'ytdl-node',
  source: 'npm',
  package: '@freepinkg/ytdl-node'
}
```

### git clone

```bash
cd plugins
git clone https://github.com/freepinkg/ytdl-node.git
```

Add to `config.js`:

```js
{
  name: 'ytdl-node',
  source: 'local',
  path: 'plugins/ytdl-node'
}
```

## Usage

Prefix any URL or search query with `ytdl:` or `ytdlp:`:

```
ytdl:https://www.youtube.com/watch?v=dQw4w9WgXcQ
ytdlp:https://open.spotify.com/track/...
ytdl:never gonna give you up
ytdl:https://bandcamp.com/track/...
```

The plugin will:
1. Call yt-dlp to extract the best audio stream URL
2. Return the track with metadata (title, artist, duration, thumbnail)
3. Stream the audio directly through NodeLink

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v4/ytdl/status` | Plugin status and yt-dlp version |
| POST | `/v4/ytdl/resolve` | Resolve a URL via yt-dlp |

### POST `/v4/ytdl/resolve`

```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
```

## How it works

1. NodeLink loads the plugin and registers a custom audio source called `ytdl`
2. When a track request comes with the `ytdl:` prefix, the plugin calls `yt-dlp --print` to extract metadata
3. For playback, it calls `yt-dlp --get-url --format bestaudio/best` to get a direct stream URL
4. NodeLink streams the audio directly to Discord — no re-encoding needed

## Why yt-dlp?

yt-dlp is the most reliable tool for extracting media from the web. It handles:
- YouTube cipher and rate limiting
- Geo-restricted content (with proper cookies)
- Age-restricted videos
- Live streams
- Playlists and mixed content

NodeLink's built-in sources are great, but yt-dlp is the ultimate fallback for anything they can't handle.

## License

MIT
