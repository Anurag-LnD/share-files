'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PeerMeta {
  peerId: string;
  nickname: string;
  deviceType: 'Mobile' | 'Desktop';
}

export interface TransferState {
  peerId: string;
  fileName: string;
  fileSize: number;
  progress: number; // 0–100
  direction: 'send' | 'receive';
  done: boolean;
}

export interface ReceivedFile {
  name: string;
  size: number;
  type: string;
  blob: Blob;
  url: string;
}

interface PeerMetaPayload {
  [key: string]: string;
  nickname: string;
  deviceType: string;
}

interface FileMeta {
  [key: string]: string | number;
  name: string;
  size: number;
  type: string;
}

type SendFileFn = (peerId: string, file: File) => Promise<void>;

interface UseP2PRoomReturn {
  isJoined: boolean;
  signalingStatus: 'connecting' | 'connected' | 'error';
  relayCount: number;
  localMeta: PeerMeta | null;
  peers: PeerMeta[];
  transfers: TransferState[];
  receivedFiles: ReceivedFile[];
  sendFile: SendFileFn;
  dismissReceivedFile: (url: string) => void;
  logs: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const APP_ID = 'p2p-fast-drop-v1';
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB strict limit

// ICE servers for WebRTC NAT traversal
// STUN discovers public IPs; TURN relays data when direct P2P is blocked by NAT/firewalls.
// Without TURN, cross-network transfers (e.g. mobile data ↔ laptop WiFi) will fail.
const ICE_SERVERS: RTCIceServer[] = [
  // STUN
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  // TURN (Metered Open Relay — free tier, 20 GB/month)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ADJECTIVES = [
  'Cosmic', 'Neon', 'Stellar', 'Quantum', 'Solar', 'Lunar', 'Vivid',
  'Crystal', 'Turbo', 'Atomic', 'Hyper', 'Ultra', 'Prism', 'Nova',
  'Echo', 'Flash', 'Swift', 'Ghost', 'Pixel', 'Cyber', 'Astral',
];

const NOUNS = [
  'MacBook', 'Galaxy', 'Comet', 'Phoenix', 'Falcon', 'Titan', 'Vortex',
  'Nebula', 'Quasar', 'Pulse', 'Spark', 'Aurora', 'Horizon', 'Zenith',
  'Apex', 'Blaze', 'Storm', 'Orbit', 'Vector', 'Matrix', 'Nexus',
];

export function generateNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

export function detectDeviceType(): 'Mobile' | 'Desktop' {
  if (typeof navigator === 'undefined') return 'Desktop';
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )
    ? 'Mobile'
    : 'Desktop';
}

export function generateRoomCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useP2PRoom(
  roomId: string | null,
  initialNickname?: string
): UseP2PRoomReturn {
  const [isJoined, setIsJoined] = useState(false);
  const [signalingStatus, setSignalingStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [relayCount, setRelayCount] = useState(0);
  const [localMeta, setLocalMeta] = useState<PeerMeta | null>(null);
  const [peers, setPeers] = useState<PeerMeta[]>([]);
  const [transfers, setTransfers] = useState<TransferState[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 20)]);
    console.log(`[FastDrop] ${msg}`);
  }, []);

  // Stable refs so callbacks don't capture stale closures
  const roomRef = useRef<import('@trystero-p2p/core').Room | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const metaActionRef = useRef<import('@trystero-p2p/core').MessageAction<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileActionRef = useRef<import('@trystero-p2p/core').MessageAction<any> | null>(null);
  const localMetaRef = useRef<PeerMetaPayload | null>(null);

  // ── Update transfer helper ────────────────────────────────────────────────
  const upsertTransfer = useCallback(
    (
      peerId: string,
      direction: 'send' | 'receive',
      patch: Partial<Omit<TransferState, 'peerId' | 'direction'>>
    ) => {
      setTransfers((prev) => {
        const idx = prev.findIndex(
          (t) => t.peerId === peerId && t.direction === direction
        );
        if (idx === -1) {
          return [
            ...prev,
            {
              peerId,
              direction,
              fileName: patch.fileName ?? '',
              fileSize: patch.fileSize ?? 0,
              progress: patch.progress ?? 0,
              done: patch.done ?? false,
            },
          ];
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...patch };
        return updated;
      });
    },
    []
  );

  // ── Main effect: join room ────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const sanitizedRoomId = roomId.trim().toLowerCase();

    const init = async () => {
      addLog(`Joining room "${sanitizedRoomId}"...`);
      setSignalingStatus('connecting');

      // Dynamic import prevents SSR bundling issues
      const { joinRoom, getRelaySockets } = await import('trystero/nostr');

      const room = joinRoom(
        {
          appId: APP_ID,
          relayConfig: {
            // Let trystero use its built-in curated relay list (29 relays,
            // shuffled by appId). Overriding urls bypasses maintenance updates.
            redundancy: 5,
          },
          rtcConfig: {
            iceServers: ICE_SERVERS,
          },
        },
        sanitizedRoomId
      );

      roomRef.current = room;

      // ── Local identity ──────────────────────────────────────────────────
      const nickname = initialNickname?.trim() || generateNickname();
      const deviceType = detectDeviceType();
      const myMeta: PeerMetaPayload = { nickname, deviceType };
      localMetaRef.current = myMeta;

      if (isMounted) {
        setLocalMeta({ peerId: 'local', nickname, deviceType });
        setIsJoined(true);
      }

      // Monitor relay WebSocket connection health
      pollInterval = setInterval(() => {
        if (!isMounted) return;
        try {
          const sockets = getRelaySockets() as Record<string, { readyState?: number }>;
          const openCount = Object.values(sockets).filter(
            (s: { readyState?: number }) => s?.readyState === 1
          ).length;
          setRelayCount(openCount);
          if (openCount > 0) {
            setSignalingStatus('connected');
          }
        } catch {
          // ignore
        }
      }, 1500);

      // ── Metadata action ─────────────────────────────────────────────────
      const metaAction = room.makeAction<PeerMetaPayload>('peer-meta');
      metaActionRef.current = metaAction;

      metaAction.onMessage = (data: PeerMetaPayload, ctx: { peerId: string }) => {
        if (!isMounted) return;
        addLog(`Metadata received from peer: ${data.nickname} (${data.deviceType})`);

        const peerMeta: PeerMeta = {
          peerId: ctx.peerId,
          nickname: data.nickname || 'Anonymous Peer',
          deviceType: (data.deviceType as 'Mobile' | 'Desktop') ?? 'Desktop',
        };

        setPeers((prev) => {
          const exists = prev.find((p) => p.peerId === ctx.peerId);
          return exists
            ? prev.map((p) => (p.peerId === ctx.peerId ? peerMeta : p))
            : [...prev, peerMeta];
        });

        // Reciprocal sync: confirm our identity back to the peer
        if (localMetaRef.current && metaActionRef.current) {
          metaActionRef.current.send(localMetaRef.current, { target: ctx.peerId });
        }
      };

      // ── File transfer action ─────────────────────────────────────────────
      const fileAction = room.makeAction<ArrayBuffer>('file-tx');
      fileActionRef.current = fileAction;

      fileAction.onMessage = (
        data: ArrayBuffer,
        ctx: { peerId: string; metadata?: import('@trystero-p2p/core').JsonValue }
      ) => {
        if (!isMounted) return;
        const meta = ctx.metadata as FileMeta | undefined;
        const name = String(meta?.name ?? 'received-file');
        const size = Number(meta?.size ?? data.byteLength);
        const type = String(meta?.type ?? 'application/octet-stream');
        addLog(`File received: ${name} (${(size / 1024).toFixed(1)} KB)`);

        const blob = new Blob([data], { type });
        const url = URL.createObjectURL(blob);
        const received: ReceivedFile = { name, size, type, blob, url };

        setReceivedFiles((prev) => [...prev, received]);
        upsertTransfer(ctx.peerId, 'receive', {
          progress: 100,
          done: true,
          fileName: name,
          fileSize: size,
        });
      };

      fileAction.onReceiveProgress = (
        progress: number,
        ctx: { peerId: string; metadata?: import('@trystero-p2p/core').JsonValue }
      ) => {
        if (!isMounted) return;
        const meta = ctx.metadata as FileMeta | undefined;
        upsertTransfer(ctx.peerId, 'receive', {
          progress: Math.round(progress * 100),
          fileName: String(meta?.name ?? ''),
          fileSize: Number(meta?.size ?? 0),
          done: false,
        });
      };

      // ── Peer presence ────────────────────────────────────────────────────
      room.onPeerJoin = (peerId: string) => {
        if (!isMounted) return;
        addLog(`WebRTC peer connected: ${peerId.slice(0, 8)}...`);

        // Announce our identity to the newly connected peer
        if (localMetaRef.current && metaActionRef.current) {
          metaActionRef.current.send(localMetaRef.current, { target: peerId });
        }
      };

      room.onPeerLeave = (peerId: string) => {
        if (!isMounted) return;
        addLog(`Peer left: ${peerId.slice(0, 8)}...`);
        setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
        setTransfers((prev) => prev.filter((t) => t.peerId !== peerId));
      };
    };

    init().catch((err) => {
      console.error(err);
      addLog(`Connection error: ${err.message}`);
      setSignalingStatus('error');
    });

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
      if (roomRef.current) {
        roomRef.current.leave();
        roomRef.current = null;
      }
      metaActionRef.current = null;
      fileActionRef.current = null;
      setIsJoined(false);
      setPeers([]);
      setTransfers([]);
      setRelayCount(0);
    };
  }, [roomId, initialNickname, upsertTransfer, addLog]);

  // ── sendFile public API ──────────────────────────────────────────────────
  const sendFile: SendFileFn = useCallback(
    async (peerId: string, file: File) => {
      if (!fileActionRef.current) throw new Error('Not connected to room');
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          `File exceeds 10 MB limit (${(file.size / 1024 / 1024).toFixed(2)} MB)`
        );
      }

      addLog(`Sending "${file.name}" to peer...`);
      const meta: FileMeta = { name: file.name, size: file.size, type: file.type };

      upsertTransfer(peerId, 'send', {
        fileName: file.name,
        fileSize: file.size,
        progress: 0,
        done: false,
      });

      const buffer = await file.arrayBuffer();

      await fileActionRef.current.send(buffer, {
        target: peerId,
        metadata: meta as import('@trystero-p2p/core').JsonValue,
        onProgress: (
          _progress: number,
          _ctx: import('@trystero-p2p/core').ActionProgressContext
        ) => {
          upsertTransfer(peerId, 'send', {
            progress: Math.round(_progress * 100),
            done: false,
          });
        },
      });

      addLog(`"${file.name}" sent successfully.`);
      upsertTransfer(peerId, 'send', { progress: 100, done: true });
    },
    [upsertTransfer, addLog]
  );

  const dismissReceivedFile = useCallback((url: string) => {
    setReceivedFiles((prev) => {
      const file = prev.find((f) => f.url === url);
      if (file) URL.revokeObjectURL(file.url);
      return prev.filter((f) => f.url !== url);
    });
  }, []);

  return {
    isJoined,
    signalingStatus,
    relayCount,
    localMeta,
    peers,
    transfers,
    receivedFiles,
    sendFile,
    dismissReceivedFile,
    logs,
  };
}
