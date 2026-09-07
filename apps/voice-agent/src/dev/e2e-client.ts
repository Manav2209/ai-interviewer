import "dotenv/config";
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  TrackKind,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "@livekit/rtc-node";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { readFileSync } from "node:fs";

const ROOM = process.env.ROOM_NAME ?? "realtime-test-001";

interface BackendSession {
  interviewId: string;
  sessionId: string;
  roomName: string;
  serverUrl: string;
  token: string;
}

async function fetchBackendSession(): Promise<BackendSession | null> {
  const base = process.env.E2E_BACKEND_URL;
  const interviewId = process.env.E2E_INTERVIEW_ID;
  if (!base || !interviewId) return null;
  const res = await fetch(`${base}/api/v1/interviews/${interviewId}/session`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`backend session create failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as BackendSession;
}

async function resolveConnection(
  backendSession: BackendSession | null,
  livekitUrl: string,
): Promise<{ jwt: string; roomName: string; serverUrl: string }> {
  if (backendSession) {
    console.log(
      `[e2e] using backend session ${backendSession.sessionId} room=${backendSession.roomName} interview=${backendSession.interviewId}`,
    );
    return {
      jwt: backendSession.token,
      roomName: backendSession.roomName,
      serverUrl: backendSession.serverUrl,
    };
  }

  // Legacy self-serve path (Phase 0 style): create our own token + dispatch.
  const accessToken = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: "candidate", name: "Candidate" },
  );
  accessToken.addGrant({ roomJoin: true, room: ROOM, canSubscribe: true, canPublish: true });
  const token = await accessToken.toJwt();

  const dispatcher = new AgentDispatchClient(
    livekitUrl,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  );
  try {
    const dispatch = await dispatcher.createDispatch(ROOM, "ai-interviewer");
    console.log("[e2e] dispatch created id=" + dispatch.id);
  } catch (err) {
    console.log("[e2e] dispatch create failed (may already exist): " + String(err));
  }

  return { jwt: token, roomName: ROOM, serverUrl: livekitUrl };
}

function wavToPcm16(filePath: string): { pcm: Int16Array; sampleRate: number; channels: number } {
  const buf = readFileSync(filePath);
  const fmtOffset = 20;
  const audioFormat = buf.readUInt16LE(fmtOffset);
  const channels = buf.readUInt16LE(fmtOffset + 2);
  const sampleRate = buf.readUInt32LE(fmtOffset + 4);
  const bitsPerSample = buf.readUInt16LE(fmtOffset + 14);
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error(`Unsupported wav: format=${audioFormat} bits=${bitsPerSample}`);
  }
  let offset = 12;
  let dataOffset = -1;
  while (offset < buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const len = buf.readUInt32LE(offset + 4);
    if (id === "data") {
      dataOffset = offset + 8;
      break;
    }
    offset += 8 + len;
  }
  if (dataOffset < 0) throw new Error("no data chunk");
  const dataBytes = buf.length - dataOffset;
  const samples = new Int16Array(dataBytes / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buf.readInt16LE(dataOffset + i * 2);
  }
  return { pcm: samples, sampleRate, channels };
}

async function main() {
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!livekitUrl) throw new Error("LIVEKIT_URL not set");

  const backendSession = await fetchBackendSession();

  const { jwt, roomName, serverUrl } = await resolveConnection(backendSession, livekitUrl);

  const room = new Room();
  await room.connect(serverUrl, jwt);

  room.on(RoomEvent.ParticipantConnected, (p) => {
    console.log(`[e2e] participant connected: ${p.identity} (${p.name})`);
  });
  room.on(RoomEvent.ParticipantDisconnected, (p) => {
    console.log(`[e2e] participant disconnected: ${p.identity}`);
  });

  const responseFrames: Int16Array[] = [];
  room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, pub: RemoteTrackPublication, participant) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    console.log(
      `[e2e] audio track subscribed from ${participant.identity}: ${pub.sid} source=${pub.source} name=${pub.name}`,
    );
    const stream = new AudioStream(track);
    void (async () => {
      try {
        //@ts-ignore
        for await (const frame of stream) {
          responseFrames.push(new Int16Array(frame.data));
        }
      } catch (err) {
        console.log("[e2e] audio stream ended: " + String(err));
      }
    })();
  });

  const audio = wavToPcm16(process.argv[2] ?? "candidate-input-48k.wav");
  console.log(
    `[e2e] loaded candidate wav: ${audio.sampleRate}Hz ${audio.channels}ch ${audio.pcm.length} samples`,
  );

  const source = new AudioSource(48000, 1);
  const track = LocalAudioTrack.createAudioTrack("candidate.microphone", source);
  const opts = new TrackPublishOptions();
  opts.source = TrackSource.SOURCE_MICROPHONE;
  opts.stream = "candidate.microphone";
  const local = room.localParticipant;
  if (local === undefined) throw new Error("local participant unavailable");
  const pub = await local.publishTrack(track, opts);
  await pub.waitForSubscription();
  console.log("[e2e] mic track published");

  const targetRate = 48000;
  const targetChannels = 1;
  const framesPerChunk = 1600; // ~33ms @ 48k
  const chunkMs = (framesPerChunk / targetRate) * 1000;

  const feed = async (until: number): Promise<void> => {
    let pos = 0;
    while (pos < until) {
      const end = Math.min(pos + framesPerChunk, until);
      const s16 = new Int16Array(framesPerChunk);
      for (let i = 0; i < framesPerChunk; i++) {
        const p = pos + i;
        const sample = audio.pcm[p];
        s16[i] = p < end ? (sample ?? 0) : 0;
      }
      const frame = new AudioFrame(s16, targetRate, targetChannels, framesPerChunk);
      await source.captureFrame(frame);
      pos = end;
      if (pos < until) {
        await new Promise((r) => setTimeout(r, chunkMs * 0.3));
      }
    }
  };

  console.log("[e2e] feeding candidate utterance (turn 1)...");
  const total = Math.ceil((audio.pcm.length / audio.sampleRate) * targetRate);
  await feed(total);
  console.log("[e2e] turn 1 speech done, waiting for agent response...");

  await new Promise((r) => setTimeout(r, 20000));

  if (responseFrames.length === 0) {
    console.log("[e2e] WARNING: no agent audio captured for turn 1");
  } else {
    const first = responseFrames[0];
    const totalMs = ((first?.length ?? 0) / targetRate) * 1000 * responseFrames.length;
    console.log(
      `[e2e] captured ${responseFrames.length} agent frames for turn 1 (approx ${Math.round(totalMs)}ms audio)`,
    );
  }

  await room.disconnect();
  console.log("[e2e] client disconnected, done");
}

main().catch((err) => {
  console.error("[e2e] FAILED: " + (err instanceof Error ? err.stack : String(err)));
  process.exit(1);
});