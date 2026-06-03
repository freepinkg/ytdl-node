import { execa } from "execa";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const YTDLP_BIN = process.env.YTDLP_PATH || "yt-dlp";
const CACHE_DIR = join(tmpdir(), "ytdl-node-cache");

interface TrackInfo {
  identifier: string;
  isSeekable: boolean;
  author: string;
  length: number;
  isStream: boolean;
  title: string;
  uri: string;
  artworkUrl: string;
  isrc: string | null;
  sourceName: string;
}

interface Track {
  encoded: string;
  info: TrackInfo;
  pluginInfo: Record<string, unknown>;
}

interface LoadResult {
  loadType: "track" | "search" | "playlist" | "empty" | "error";
  data: Record<string, unknown>;
}

export default async function (
  nodelink: any,
  _config: Record<string, unknown>,
  context: { type: string; pluginName: string; meta: { version: string } },
): Promise<void> {
  const logger = (msg: string, level = "info") =>
    nodelink.logger(level, `Plugin:${context.pluginName}`, msg);

  logger(`Initializing in ${context.type.toUpperCase()} mode`);

  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }

  async function checkYtdlp(): Promise<boolean> {
    try {
      const { stdout } = await execa(YTDLP_BIN, ["--version"]);
      logger(`yt-dlp v${stdout.trim()} found`);
      return true;
    } catch {
      logger(
        "yt-dlp not found! Install: pipx install yt-dlp or brew install yt-dlp",
        "error",
      );
      return false;
    }
  }

  function parseLine(line: string): Record<string, string> | null {
    const parts = line.split("\t");
    if (parts.length < 7) return null;

    const [
      originalUrl,
      title,
      duration,
      webpageUrl,
      extractor,
      id,
      thumbnail,
      channel,
      playlistTitle,
      playlistId,
      playlistIndex,
    ] = parts;

    return {
      originalUrl,
      title: title || "Unknown Title",
      duration,
      webpageUrl,
      extractor,
      id,
      thumbnail: thumbnail || "",
      channel: channel || extractor || "Unknown",
      playlistTitle: playlistTitle || "",
      playlistId: playlistId || "",
      playlistIndex: playlistIndex || "0",
    };
  }

  function buildTrack(data: Record<string, string>): Track {
    const durationMs = parseInt(data.duration || "0") * 1000;
    return {
      encoded: randomUUID(),
      info: {
        identifier: data.id,
        isSeekable: true,
        author: data.channel,
        length: durationMs,
        isStream: durationMs === 0,
        title: data.title,
        uri: data.originalUrl || data.webpageUrl,
        artworkUrl: data.thumbnail,
        isrc: null,
        sourceName: "ytdl",
      },
      pluginInfo: {
        extractor: data.extractor,
        resolvedBy: "ytdl-node",
      },
    };
  }

  function buildResult(lines: string[]): LoadResult {
    const tracks: Track[] = [];
    let playlistName = "";

    for (const line of lines) {
      const data = parseLine(line);
      if (!data) continue;

      const track = buildTrack(data);
      tracks.push(track);

      if (data.playlistTitle && !playlistName) {
        playlistName = data.playlistTitle;
      }
    }

    if (tracks.length === 0) {
      return { loadType: "empty", data: {} };
    }

    if (tracks.length > 1 || playlistName) {
      return {
        loadType: "playlist",
        data: {
          tracks,
          name: playlistName || "Playlist",
          selectedTrack: 0,
          pluginInfo: { resolvedBy: "ytdl-node" },
        },
      };
    }

    return {
      loadType: "track",
      data: {
        tracks,
        pluginInfo: { resolvedBy: "ytdl-node" },
      },
    };
  }

  class YtdlpSource {
    private nodelink: any;

    public sourceName = "ytdl";
    public searchTerms = ["ytdl", "ytdlp"];

    constructor(nodelink: any) {
      this.nodelink = nodelink;
    }

    async extractInfo(
      identifier: string,
    ): Promise<string | null> {
      const isSearch = identifier.startsWith("ytsearch");
      const args = [
        "--no-warnings",
        "--no-call-home",
        "--flat-playlist",
        "--dump-single-json",
        "--no-download",
        "--skip-download",
        "--print",
        "%(original_url)s\t%(title)s\t%(duration)s\t%(webpage_url)s\t%(extractor)s\t%(id)s\t%(thumbnail)s\t%(channel)s\t%(playlist_title)s\t%(playlist_id)s\t%(playlist_index)s\t%(epoch)s",
        identifier,
      ];

      if (isSearch) {
        args.splice(3, 1);
      }

      try {
        const { stdout } = await execa(YTDLP_BIN, args, {
          timeout: 30000,
          reject: false,
        });
        return stdout || null;
      } catch (err) {
        logger(`yt-dlp error: ${(err as Error).message}`, "error");
        return null;
      }
    }

    async getStreamUrl(url: string): Promise<string | null> {
      try {
        const { stdout } = await execa(
          YTDLP_BIN,
          [
            "--no-warnings",
            "--no-call-home",
            "--get-url",
            "--format",
            "bestaudio/best",
            url,
          ],
          { timeout: 30000, reject: false },
        );
        return stdout?.trim().split("\n")[0] || null;
      } catch {
        return null;
      }
    }

    async search(query: string): Promise<LoadResult> {
      const searchUrl = `ytsearch10:${query}`;
      const result = await this.extractInfo(searchUrl);

      if (!result) {
        return { loadType: "empty", data: {} };
      }

      const lines = result.trim().split("\n");
      const tracks: Track[] = [];

      for (const line of lines) {
        const data = parseLine(line);
        if (!data) continue;
        tracks.push(buildTrack(data));
      }

      if (tracks.length === 0) {
        return { loadType: "empty", data: {} };
      }

      return {
        loadType: "search",
        data: {
          tracks,
          pluginInfo: { query, resolvedBy: "ytdl-node" },
        },
      };
    }

    async resolve(url: string): Promise<LoadResult> {
      const result = await this.extractInfo(url);

      if (!result) {
        return { loadType: "empty", data: {} };
      }

      return buildResult(result.trim().split("\n"));
    }

    async getTrackUrl(trackInfo: {
      uri?: string;
      identifier?: string;
    }): Promise<Record<string, unknown>> {
      const url = trackInfo.uri || trackInfo.identifier;

      if (!url) {
        return {
          exception: {
            message: "No URL available",
            severity: "fault",
          },
        };
      }

      const streamUrl = await this.getStreamUrl(url);

      if (streamUrl) {
        return {
          url: streamUrl,
          pluginInfo: { resolvedBy: "ytdl-node", method: "direct" },
        };
      }

      return {
        exception: {
          message: "Failed to get stream URL",
          severity: "fault",
        },
      };
    }
  }

  const ytdlAvailable = await checkYtdlp();

  if (!ytdlAvailable) {
    logger("Plugin loaded but yt-dlp is not installed", "warn");
    return;
  }

  if (context.type === "master") {
    nodelink.registerRoute(
      "GET",
      "/v4/ytdl/status",
      (_nodelink: any, req: any, res: any, sendResponse: any) => {
        sendResponse(req, res, {
          plugin: "ytdl-node",
          version: context.meta.version,
          ytdlAvailable: true,
        });
      },
    );

    nodelink.registerRoute(
      "POST",
      "/v4/ytdl/resolve",
      async (_nodelink: any, req: any, res: any, sendResponse: any) => {
        try {
          const { url } = req.body || {};
          if (!url) {
            return sendResponse(req, res, { error: "URL is required" }, 400);
          }

          const worker = nodelink.workerManager.getBestWorker();
          if (!worker) {
            return sendResponse(
              req,
              res,
              { error: "No worker available" },
              500,
            );
          }

          const result = await nodelink.workerManager.execute(
            worker,
            "loadTracks",
            { identifier: `ytdl:${url}` },
          );

          sendResponse(req, res, result, 200);
        } catch (e) {
          sendResponse(req, res, { error: (e as Error).message }, 500);
        }
      },
    );
  }

  if (context.type === "worker") {
    const ytdlSrc = new YtdlpSource(nodelink);
    nodelink.registerSource("ytdl", ytdlSrc);

    const searchTermMap = nodelink.sources?.searchTermMap;
    if (searchTermMap) {
      searchTermMap.set("ytdl", "ytdl");
      searchTermMap.set("ytdlp", "ytdl");
    }

    logger('Source registered! Use ytdl:URL or ytdlp:URL prefix');
  }
}
