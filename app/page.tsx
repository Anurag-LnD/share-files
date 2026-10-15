'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Laptop,
  Smartphone,
  RefreshCw,
  LogIn,
  Share2,
  X,
  Download,
  Zap,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  Radio,
  FileUp,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  useP2PRoom,
  generateNickname,
  generateRoomCode,
  detectDeviceType,
  MAX_FILE_SIZE,
  type PeerMeta,
  type TransferState,
  type ReceivedFile,
} from '@/hooks/useP2PRoom';

// ─── Utility ─────────────────────────────────────────────────────────────────

function cn(...args: Parameters<typeof clsx>) {
  return twMerge(clsx(...args));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// ─── Progress Ring SVG Component ─────────────────────────────────────────────

function ProgressRing({
  progress,
  size = 64,
  stroke = 4,
  color = '#a78bfa',
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255, 255, 255, 0.1)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.25s ease' }}
      />
    </svg>
  );
}

// ─── Peer Avatar Card ─────────────────────────────────────────────────────────

function PeerCard({
  peer,
  transfer,
  onClick,
  style,
}: {
  peer: PeerMeta;
  transfer?: TransferState;
  onClick: (peer: PeerMeta) => void;
  style?: React.CSSProperties;
}) {
  const isMobile = peer.deviceType === 'Mobile';
  const isTransferring = transfer && !transfer.done;
  const isDone = transfer?.done;

  return (
    <div
      className="absolute flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
      style={style}
    >
      <div className="relative group">
        {/* Active transfer ping aura */}
        {isTransferring && (
          <div className="absolute inset-0 rounded-full bg-violet-500 opacity-40 animate-ping" />
        )}

        <button
          onClick={() => onClick(peer)}
          disabled={!!isTransferring}
          className={cn(
            'relative flex items-center justify-center rounded-full border-2 transition-all duration-200 cursor-pointer',
            'w-[68px] h-[68px] shadow-lg',
            isTransferring
              ? 'border-violet-400 bg-violet-950/60 cursor-not-allowed ring-glow'
              : 'border-violet-500/50 bg-[#16161e] hover:border-violet-400 hover:ring-glow hover:scale-110 active:scale-95'
          )}
          title={`Click to send a file to ${peer.nickname}`}
        >
          {isTransferring ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <ProgressRing progress={transfer.progress} size={68} stroke={3.5} />
              <span className="absolute text-[11px] font-bold text-violet-300">
                {transfer.progress}%
              </span>
            </div>
          ) : isDone ? (
            <Zap className="w-7 h-7 text-green-400" />
          ) : isMobile ? (
            <Smartphone className="w-7 h-7 text-violet-300 transition-transform group-hover:scale-110" />
          ) : (
            <Laptop className="w-7 h-7 text-violet-300 transition-transform group-hover:scale-110" />
          )}
        </button>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-xs font-semibold text-slate-200 truncate max-w-[100px] text-center">
          {peer.nickname}
        </span>
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full mt-0.5 font-medium',
            isMobile
              ? 'bg-pink-500/20 text-pink-300'
              : 'bg-blue-500/20 text-blue-300'
          )}
        >
          {peer.deviceType}
        </span>
      </div>
    </div>
  );
}

// ─── Radar Visual Background ──────────────────────────────────────────────────

function RadarBackground({ size }: { size: number }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
      {/* Concentric stationary radar guide rings */}
      {[0.32, 0.58, 0.88].map((scale, i) => (
        <div
          key={i}
          className="absolute rounded-full border border-violet-500/15"
          style={{ width: size * scale, height: size * scale }}
        />
      ))}

      {/* Animated continuous radar pulse waves */}
      <div
        className="absolute rounded-full border border-violet-500/30 radar-ring"
        style={{ width: size * 0.88, height: size * 0.88 }}
      />
      <div
        className="absolute rounded-full border border-violet-500/25 radar-ring-2"
        style={{ width: size * 0.88, height: size * 0.88 }}
      />
      <div
        className="absolute rounded-full border border-violet-500/20 radar-ring-3"
        style={{ width: size * 0.88, height: size * 0.88 }}
      />

      {/* Center radar emitter dot */}
      <div className="w-3 h-3 rounded-full bg-violet-400 opacity-60 animate-ping" />
      <div className="w-2 h-2 rounded-full bg-violet-400 absolute" />
    </div>
  );
}

// ─── Toast Notification ───────────────────────────────────────────────────────

function Toast({
  message,
  type,
  onDismiss,
}: {
  message: string;
  type: 'error' | 'info';
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl z-50 text-sm font-medium backdrop-blur-md',
        type === 'error'
          ? 'bg-red-900/90 text-red-200 border border-red-700'
          : 'bg-violet-900/90 text-violet-200 border border-violet-700'
      )}
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100 cursor-pointer">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Received File Confirmation Modal ─────────────────────────────────────────

function DownloadModal({
  file,
  onAccept,
  onDismiss,
}: {
  file: ReceivedFile;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#16161e] border border-violet-500/30 rounded-3xl p-6 max-w-sm w-full glow-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-500/20 flex items-center justify-center">
            <Download className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-base">File Received</h3>
            <p className="text-xs text-slate-400">Ready to save to your device</p>
          </div>
        </div>

        <div className="bg-[#1e1e2a] rounded-2xl p-4 mb-5 border border-white/8">
          <p className="text-sm font-semibold text-slate-200 truncate">{file.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-violet-300 font-mono">{formatBytes(file.size)}</span>
            <span className="text-[10px] text-slate-500 uppercase">· {file.type || 'binary'}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-medium hover:border-slate-500 hover:text-white transition-colors cursor-pointer"
          >
            Dismiss
          </button>
          <button
            onClick={onAccept}
            className="flex-1 py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-violet-900/40"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Landing / Room Entry View ────────────────────────────────────────────────

function LandingView({
  defaultNickname,
  defaultDeviceType,
  onJoin,
}: {
  defaultNickname: string;
  defaultDeviceType: 'Mobile' | 'Desktop';
  onJoin: (roomId: string, nickname: string) => void;
}) {
  const [roomInput, setRoomInput] = useState('');
  const [nickname, setNickname] = useState(defaultNickname);

  useEffect(() => {
    if (defaultNickname) setNickname(defaultNickname);
  }, [defaultNickname]);

  const handleJoin = () => {
    const code = roomInput.trim().toLowerCase() || generateRoomCode();
    onJoin(code, nickname);
  };

  const handleRerollNickname = () => {
    setNickname(generateNickname());
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-8">
      {/* Brand Header */}
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-violet-500/30 blur-xl animate-pulse" />
          <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-xl shadow-violet-900/50 border border-violet-400/30">
            <Share2 className="w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-300 via-violet-400 to-indigo-300 bg-clip-text text-transparent mt-2">
          FastDrop
        </h1>
        <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
          Zero-login Peer-to-Peer file sharing powered by WebRTC & Nostr. Instant, direct, and private.
        </p>
      </div>

      {/* Main Action Card */}
      <div className="w-full max-w-sm bg-[#12121a] border border-white/10 rounded-3xl p-6 glow-card">
        {/* Device Identity Badge */}
        <div className="mb-5 p-3.5 rounded-2xl bg-[#1a1a26] border border-white/8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-300">
              {defaultDeviceType === 'Mobile' ? (
                <Smartphone className="w-5 h-5" />
              ) : (
                <Laptop className="w-5 h-5" />
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                Your Device
              </p>
              <p className="text-sm font-semibold text-slate-200 truncate max-w-[160px]">
                {nickname || 'Assigning...'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRerollNickname}
            title="Randomize Nickname"
            className="p-2 rounded-xl text-slate-400 hover:text-violet-300 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Room Code Input */}
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Room Code
        </label>
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 bg-[#1a1a26] border border-white/10 rounded-xl px-4 py-3 text-slate-100 text-sm placeholder-slate-600 outline-none focus:border-violet-500 transition-colors font-mono"
            placeholder="e.g. 4827 or custom"
            value={roomInput}
            onChange={(e) => setRoomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            maxLength={32}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            autoComplete="off"
            autoFocus
          />
          <button
            onClick={() => setRoomInput(generateRoomCode())}
            title="Generate Random 4-Digit Code"
            className="w-12 h-12 rounded-xl bg-[#1a1a26] border border-white/10 flex items-center justify-center text-slate-400 hover:text-violet-300 hover:border-violet-500 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Join Button */}
        <button
          onClick={handleJoin}
          className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-150 shadow-lg shadow-violet-900/40 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          Join Room
        </button>

        <p className="text-center text-xs text-slate-500 mt-4">
          Enter the same code on both devices to link them
        </p>
      </div>

      {/* Feature Badges */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
          <span>Zero Server Storage</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-violet-400" />
          <span>P2P WebRTC Direct</span>
        </div>
        <div className="flex items-center gap-1.5">
          <FileUp className="w-3.5 h-3.5 text-violet-400" />
          <span>Max 10 MB / File</span>
        </div>
      </div>
    </div>
  );
}

// ─── Room View (Radar & Center Stage) ─────────────────────────────────────────

function RoomView({
  roomId,
  nickname,
  onLeave,
}: {
  roomId: string;
  nickname: string;
  onLeave: () => void;
}) {
  const {
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
  } = useP2PRoom(roomId, nickname);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPeer, setSelectedPeer] = useState<PeerMeta | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'info' } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Responsive arena size
  const [arenaSize, setArenaSize] = useState(360);
  useEffect(() => {
    const update = () => {
      const s = Math.min(window.innerWidth * 0.88, 440);
      setArenaSize(Math.max(s, 280));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Compute circular layout around center
  const getPeerPosition = (index: number, total: number) => {
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    const r = arenaSize * 0.32;
    return {
      left: arenaSize / 2 + r * Math.cos(angle),
      top: arenaSize / 2 + r * Math.sin(angle),
    };
  };

  const handlePeerClick = (peer: PeerMeta) => {
    setSelectedPeer(peer);
    // Programmatically click the accessible hidden file input
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(roomId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedPeer) return;
    e.target.value = ''; // Reset input so same file can be selected again

    if (file.size > MAX_FILE_SIZE) {
      setToast({
        message: `"${file.name}" is ${formatBytes(file.size)}. Strict limit is 10 MB.`,
        type: 'error',
      });
      return;
    }

    try {
      setToast({ message: `Sending "${file.name}" to ${selectedPeer.nickname}…`, type: 'info' });
      await sendFile(selectedPeer.peerId, file);
      setToast({ message: `"${file.name}" sent successfully!`, type: 'info' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transfer failed';
      setToast({ message: msg, type: 'error' });
    } finally {
      setSelectedPeer(null);
    }
  };

  const handleDownload = (file: ReceivedFile) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    dismissReceivedFile(file.url);
  };

  const localDeviceType = localMeta?.deviceType ?? detectDeviceType();
  const localName = localMeta?.nickname ?? nickname;

  return (
    <div className="flex flex-col items-center justify-between min-h-screen px-4 py-6 max-w-xl mx-auto">
      {/* Top Bar */}
      <div className="w-full flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-slate-100 text-sm">FastDrop</span>
            {/* Live Signaling Status */}
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  signalingStatus === 'connected'
                    ? 'bg-green-400 animate-pulse'
                    : signalingStatus === 'connecting'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-red-500'
                )}
              />
              <span className="text-[10px] text-slate-400 font-mono">
                {relayCount > 0 ? `${relayCount} relays · ` : ''}
                {peers.length} peer{peers.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Diagnostics toggle */}
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="p-2 rounded-xl bg-[#16161e] border border-white/10 text-slate-400 hover:text-violet-300 transition-colors cursor-pointer"
            title="Connection Diagnostics"
          >
            <Terminal className="w-3.5 h-3.5" />
          </button>

          {/* Room Code Badge with Copy button */}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16161e] border border-white/10 text-xs text-violet-300 font-mono hover:border-violet-500 transition-colors cursor-pointer"
            title="Click to copy Room Code"
          >
            <span>{roomId}</span>
            {copiedCode ? (
              <Check className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>

          {/* Leave Button */}
          <button
            onClick={onLeave}
            className="w-8 h-8 rounded-xl bg-[#16161e] border border-white/10 flex items-center justify-center text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors cursor-pointer"
            title="Leave room"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Diagnostics Drawer (Optional drop-down for mobile/desktop troubleshooting) */}
      {showLogs && (
        <div className="w-full bg-[#12121a] border border-violet-500/30 rounded-2xl p-3 mb-3 text-[11px] font-mono text-slate-400 max-h-36 overflow-y-auto glow-card">
          <div className="flex items-center justify-between mb-1 pb-1 border-b border-white/10">
            <span className="text-violet-300 font-semibold">Live Diagnostics</span>
            <span className="text-[10px] text-slate-500">Room: {roomId}</span>
          </div>
          {logs.length === 0 ? (
            <p className="text-slate-600">No events yet...</p>
          ) : (
            logs.map((l, i) => (
              <p key={i} className="truncate">
                {l}
              </p>
            ))
          )}
        </div>
      )}

      {/* Radar Center Stage */}
      <div className="relative my-auto flex items-center justify-center" style={{ width: arenaSize, height: arenaSize }}>
        <RadarBackground size={arenaSize} />

        {/* Connected Peers Avatars */}
        {peers.map((peer, i) => {
          const pos = getPeerPosition(i, peers.length);
          const sendTransfer = transfers.find(
            (t) => t.peerId === peer.peerId && t.direction === 'send'
          );
          const recvTransfer = transfers.find(
            (t) => t.peerId === peer.peerId && t.direction === 'receive'
          );
          const activeTransfer = sendTransfer ?? recvTransfer;

          return (
            <PeerCard
              key={peer.peerId}
              peer={peer}
              transfer={activeTransfer}
              onClick={handlePeerClick}
              style={{ left: pos.left, top: pos.top }}
            />
          );
        })}

        {/* Empty Radar State */}
        {peers.length === 0 && isJoined && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6 pointer-events-none">
            <div className="w-10 h-10 rounded-2xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-1">
              <Radio className="w-5 h-5 text-violet-400 animate-pulse" />
            </div>
            <p className="text-slate-300 text-sm font-semibold">Scanning for Peers</p>
            <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
              Open FastDrop on your other device and join code{' '}
              <span className="text-violet-300 font-mono font-bold">{roomId}</span>
            </p>
          </div>
        )}
      </div>

      {/* Bottom Area: Active Transfers & Local Badge */}
      <div className="w-full flex flex-col items-center gap-3">
        {/* Active Transfer Banners */}
        {transfers.filter((t) => !t.done).length > 0 && (
          <div className="w-full space-y-2 mb-2">
            {transfers
              .filter((t) => !t.done)
              .map((t, i) => {
                const peerName =
                  peers.find((p) => p.peerId === t.peerId)?.nickname ?? 'Peer';
                return (
                  <div
                    key={`${t.peerId}-${t.direction}-${i}`}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#16161e] border border-violet-500/30 glow-card"
                  >
                    <ProgressRing progress={t.progress} size={38} stroke={3} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">
                        {t.fileName}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {t.direction === 'send' ? `Uploading to ${peerName}` : `Receiving from ${peerName}`} · {t.progress}%
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Local Device Badge */}
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#12121a] border border-violet-500/30 glow-card">
          <div className="w-9 h-9 rounded-xl bg-violet-900/40 border border-violet-500/50 flex items-center justify-center">
            {localDeviceType === 'Mobile' ? (
              <Smartphone className="w-4 h-4 text-violet-300" />
            ) : (
              <Laptop className="w-4 h-4 text-violet-300" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200 truncate max-w-[180px]">
              {localName}
            </p>
            <p className="text-[10px] text-slate-500">You · {localDeviceType}</p>
          </div>
          <div className="ml-2 w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>

        <p className="text-[11px] text-slate-600 text-center">
          Tap a device above to send a file (max 10 MB)
        </p>
      </div>

      {/* Accessible hidden file input - NOT display:none so iOS Safari & Android allow synthetic click */}
      <input
        ref={fileInputRef}
        type="file"
        className="absolute opacity-0 pointer-events-none w-0 h-0 overflow-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* Received File Confirmation Modal */}
      {receivedFiles.length > 0 && (
        <DownloadModal
          file={receivedFiles[0]}
          onAccept={() => handleDownload(receivedFiles[0])}
          onDismiss={() => dismissReceivedFile(receivedFiles[0].url)}
        />
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [deviceType, setDeviceType] = useState<'Mobile' | 'Desktop'>('Desktop');

  // Client-only initialization to eliminate hydration mismatch
  useEffect(() => {
    setNickname(generateNickname());
    setDeviceType(detectDeviceType());
  }, []);

  const handleJoin = useCallback((id: string, customNick: string) => {
    setNickname(customNick);
    setRoomId(id);
  }, []);

  const handleLeave = useCallback(() => {
    setRoomId(null);
  }, []);

  if (roomId) {
    return <RoomView roomId={roomId} nickname={nickname} onLeave={handleLeave} />;
  }

  return (
    <LandingView
      defaultNickname={nickname}
      defaultDeviceType={deviceType}
      onJoin={handleJoin}
    />
  );
}
