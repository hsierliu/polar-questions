import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import * as DropboxService from "./services.js";
import {
  firebaseConfigurationError,
  getAccessProfile,
  observeAuth,
  signInWithGoogle,
  signOutUser,
} from "./services.js";

const ORDER_DEFS = {
  "1": [
    { book: "busy-babies", question: "a cat?", target: "No" },
    { book: "busy-babies", question: "a horse?", target: "Yes" },
    { book: "busy-babies", question: "a bird?", target: "Yes" },
    { book: "busy-babies", question: "a pig?", target: "No" },
    { book: "busy-babies", question: "a bear?", target: "Yes" },
    { book: "busy-babies", question: "a cow?", target: "Yes" },
    { book: "busy-babies", question: "a dog?", target: "No" },
    { book: "busy-babies", question: "a bunny?", target: "No" },
    { book: "new-house", question: "a ball?", target: "No" },
    { book: "new-house", question: "a block?", target: "Yes" },
    { book: "new-house", question: "a teddy bear?", target: "No" },
    { book: "new-house", question: "a cookie?", target: "No" },
    { book: "new-house", question: "an apple?", target: "Yes" },
    { book: "new-house", question: "a bottle?", target: "No" },
    { book: "new-house", question: "a cup?", target: "Yes" },
    { book: "new-house", question: "a car?", target: "Yes" }
  ],
  "2": [
    { book: "new-house", question: "a ball?", target: "No" },
    { book: "new-house", question: "a block?", target: "Yes" },
    { book: "new-house", question: "a teddy bear?", target: "No" },
    { book: "new-house", question: "a cookie?", target: "No" },
    { book: "new-house", question: "an apple?", target: "Yes" },
    { book: "new-house", question: "a bottle?", target: "No" },
    { book: "new-house", question: "a cup?", target: "Yes" },
    { book: "new-house", question: "a car?", target: "Yes" },
    { book: "busy-babies", question: "a cat?", target: "No" },
    { book: "busy-babies", question: "a horse?", target: "Yes" },
    { book: "busy-babies", question: "a bird?", target: "Yes" },
    { book: "busy-babies", question: "a pig?", target: "No" },
    { book: "busy-babies", question: "a bear?", target: "Yes" },
    { book: "busy-babies", question: "a cow?", target: "Yes" },
    { book: "busy-babies", question: "a dog?", target: "No" },
    { book: "busy-babies", question: "a bunny?", target: "No" }
  ],
  "3": [
    { book: "busy-babies", question: "a bunny?", target: "Yes" },
    { book: "busy-babies", question: "a bear?", target: "No" },
    { book: "busy-babies", question: "a cow?", target: "No" },
    { book: "busy-babies", question: "a dog?", target: "Yes" },
    { book: "busy-babies", question: "a horse?", target: "No" },
    { book: "busy-babies", question: "a bird?", target: "No" },
    { book: "busy-babies", question: "a pig?", target: "Yes" },
    { book: "busy-babies", question: "a cat?", target: "Yes" },
    { book: "new-house", question: "a teddy bear?", target: "Yes" },
    { book: "new-house", question: "a cup?", target: "No" },
    { book: "new-house", question: "a ball?", target: "Yes" },
    { book: "new-house", question: "a bottle?", target: "Yes" },
    { book: "new-house", question: "a car?", target: "No" },
    { book: "new-house", question: "a cookie?", target: "Yes" },
    { book: "new-house", question: "a block?", target: "No" },
    { book: "new-house", question: "an apple?", target: "No" }
  ],
  "4": [
    { book: "new-house", question: "a teddy bear?", target: "Yes" },
    { book: "new-house", question: "a cup?", target: "No" },
    { book: "new-house", question: "a ball?", target: "Yes" },
    { book: "new-house", question: "a bottle?", target: "Yes" },
    { book: "new-house", question: "a car?", target: "No" },
    { book: "new-house", question: "a cookie?", target: "Yes" },
    { book: "new-house", question: "a block?", target: "No" },
    { book: "new-house", question: "an apple?", target: "No" },
    { book: "busy-babies", question: "a bunny?", target: "Yes" },
    { book: "busy-babies", question: "a bear?", target: "No" },
    { book: "busy-babies", question: "a cow?", target: "No" },
    { book: "busy-babies", question: "a dog?", target: "Yes" },
    { book: "busy-babies", question: "a horse?", target: "No" },
    { book: "busy-babies", question: "a bird?", target: "No" },
    { book: "busy-babies", question: "a pig?", target: "Yes" },
    { book: "busy-babies", question: "a cat?", target: "Yes" }
  ],
};

const CHILD_QUESTIONS = [
  {
    id: "q1",
    text: "Did the child respond verbally or non-verbally?",
    options: ["Yes", "No"],
  },
  {
    id: "q1_transcription",
    text: "Transcribe the child's responses:",
    type: "text",
    placeholder: "",
    instruction: 'Please write the child\'s verbal response in "quotations" and nonverbal response in *asterisks.* For example: "nah" *shook head.* Transcription should not be limited to the child\'s first response. Transcribe the whole clip.',
    dependsOn: { q1: "Yes" },
  },
  {
    id: "q2",
    text: "What response did the child provide?",
    options: ["Verbal response", "Non-verbal response", "Both verbal and non-verbal responses"],
    dependsOn: { q1: "Yes" },
  },
  {
    id: "q3",
    text: "What did the child respond with first?",
    options: ["Verbal first", "Nonverbal first", "Same time"],
    dependsOn: { q2: "Both verbal and non-verbal responses" },
  },
  {
    id: "q4",
    text: 'Did the child verbally say a variation of "yes"? (yes, yah, uh huh)',
    options: ["Yes", "No"],
    dependsOn: { q2: ["Verbal response", "Both verbal and non-verbal responses"] },
    hasDropdown: true,
    dropdownOptions: ["Yes", "Yah", "Yuh", "Uh huh", "Other"],
    dropdownLabel: "What variation of 'yes'?",
  },
  {
    id: "q5",
    text: 'Did the child verbally say a variation of "no"? (no, not, nah, nuh uh)',
    options: ["Yes", "No"],
    dependsOn: { q2: ["Verbal response", "Both verbal and non-verbal responses"] },
    hasDropdown: true,
    dropdownOptions: ["No", "Not", "Nah", "Nuh uh", "Other"],
    dropdownLabel: "What variation of 'no'?",
  },
  {
    id: "q6",
    text: "Did the child nod or give other nonverbal indicators of affirmation?",
    options: ["Yes", "No"],
    dependsOn: { q2: ["Non-verbal response", "Both verbal and non-verbal responses"] },
    hasDropdown: true,
    dropdownOptions: ["Nod", "Thumbs up", "Other"],
    dropdownLabel: "What nonverbal indicator?",
  },
  {
    id: "q7",
    text: "Did the child shake their head or give other nonverbal indicators of negation?",
    options: ["Yes", "No"],
    dependsOn: { q2: ["Non-verbal response", "Both verbal and non-verbal responses"] },
    hasDropdown: true,
    dropdownOptions: ["Shook head", "Thumbs down", "Finger wagging", "Other"],
    dropdownLabel: "What nonverbal indicator?",
  },
  {
    id: "q8",
    text: 'Did the child respond with a label affirmatively?',
    options: ["No", "Yes"],
    dependsOn: { q2: ["Verbal response", "Both verbal and non-verbal responses"] },
    hasDropdown: true,
    dropdownOptions: [],
    dropdownLabel: "What was the label?",
    dropdownType: "text",
    dropdownPlaceholder: "Type the label here...",
    instruction: 'Affirmative labels include "an X" or "that/there/it\'s an X". They do NOT include "that/there/it\'s not X."',
  },
];

const PARENT_QUESTIONS = [
  {
    id: "p1",
    text: "Do you think this question is from a true trial (where the correct answer is \"yes\") or a false trial (where the correct answer is \"no\")?",
    options: ["A true trial", "A false trial", "Neither, could go either way"],
  },
];

function timeToStrMs(t) {
  if (Number.isNaN(t) || t == null) return "-";
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${m}:${String(sec).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function formatDate(value, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
}

function reportSessionLoadWarnings(sessions) {
  if (!sessions.loadWarnings?.length) return;
  alert(
    `Some Dropbox sessions could not be loaded:\n\n${sessions.loadWarnings
      .map((warning) => `${warning.id}: ${warning.reason}`)
      .join("\n")}`,
  );
}

async function extractWaveformFromURL(fileURL, targetBars = 1500) {
  try {
    const res = await fetch(fileURL);
    const buf = await res.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const audio = await ctx.decodeAudioData(buf);
    const { length, numberOfChannels, sampleRate } = audio;
    const bars = Math.max(200, Math.min(targetBars, Math.floor(length / (sampleRate * 0.01))));
    const step = Math.max(1, Math.floor(length / bars));
    const out = new Float32Array(bars);
    let max = 0;
    for (let b = 0; b < bars; b++) {
      const i0 = b * step;
      const i1 = b === bars - 1 ? length : (b + 1) * step;
      let sum = 0;
      const N = (i1 - i0) * numberOfChannels || 1;
      for (let ch = 0; ch < numberOfChannels; ch++) {
        const data = audio.getChannelData(ch);
        for (let i = i0; i < i1; i++) {
          const v = data[i] || 0;
          sum += v * v;
        }
      }
      const rms = Math.sqrt(sum / N);
      out[b] = rms;
      if (rms > max) max = rms;
    }
    if (max > 0) for (let i = 0; i < out.length; i++) out[i] /= max;
    ctx.close && ctx.close();
    return out;
  } catch {
    return null;
  }
}

function RangePlayer({ fileURL, start, end }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (end != null && v.currentTime >= end) {
        v.pause();
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [end]);
  
  const handleReplay = () => {
    const v = ref.current;
    if (!v) return;
      if (start != null) v.currentTime = start;
      v.play();
  };
  
  return (
    <div className="space-y-3">
      <video ref={ref} src={fileURL} className="w-full rounded-xl shadow" />
      <button 
        onClick={handleReplay}
        className="w-full bg-blue-600 transition-colors"
      >
        ▶️ Play clip
      </button>
    </div>
  );
}

function SplitTimeline({
  duration,
  current,
  cuts,
  setCuts,
  onSeek,
  viewStart,
  viewEnd,
  setView,
  waveform,
  onSplitAt, // optional override
  onRemoveNearest, // optional override
}) {
  const barRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = barRef.current;
    if (!canvas || !host) return;
    const rect = host.getBoundingClientRect();
    canvas.width = Math.max(300, Math.floor(rect.width));
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#f3f4f6";
    const pad = 8;
    const trackY = canvas.height / 2 - 6;
    const trackW = canvas.width - pad * 2;
    ctx.fillRect(pad, trackY, trackW, 12);

    if (waveform && duration > 0) {
      const startIdx = Math.floor((viewStart / duration) * waveform.length);
      const endIdx = Math.ceil((viewEnd / duration) * waveform.length);
      const span = Math.max(1, endIdx - startIdx);
      const step = span / trackW;
      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      for (let x = 0; x < trackW; x++) {
        const i = Math.floor(startIdx + x * step);
        const amp = waveform[i] ?? 0;
        const half = Math.max(1, Math.floor(amp * (canvas.height * 0.45)));
        const cx = pad + x;
        ctx.moveTo(cx, canvas.height / 2 - half);
        ctx.lineTo(cx, canvas.height / 2 + half);
      }
      ctx.stroke();
    }

    ctx.fillStyle = "#111827";
    for (const c of cuts) {
      if (c < viewStart || c > viewEnd) continue;
      const x = pad + ((c - viewStart) / (viewEnd - viewStart)) * (canvas.width - pad * 2);
      ctx.fillRect(Math.round(x) - 1, 16, 2, canvas.height - 32);
    }

    if (current >= viewStart && current <= viewEnd) {
      const x = pad + ((current - viewStart) / (viewEnd - viewStart)) * (canvas.width - pad * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(Math.round(x) - 1, 8, canvas.height - 16 > 0 ? 2 : 2, canvas.height - 16);
    }
  }, [cuts, current, duration, viewStart, viewEnd, waveform]);

  const timeFromClientX = (clientX) => {
    const rect = barRef.current.getBoundingClientRect();
    const pad = 8;
    const x = Math.max(pad, Math.min(clientX - rect.left, rect.width - pad));
    const t = viewStart + ((x - pad) / (rect.width - pad * 2)) * (viewEnd - viewStart);
    return Math.max(0, Math.min(t, duration));
  };

  const splitAt = (t) => {
    if (onSplitAt) return onSplitAt(t);
    if (!duration) return;
    const EPS = 0.03;
    if (t < EPS || t > duration - EPS) return;
    if (cuts.some((c) => Math.abs(c - t) < EPS)) return;
    setCuts([...cuts, t].sort((a, b) => a - b));
  };

  const removeNearestCut = (t) => {
    if (onRemoveNearest) return onRemoveNearest(t);
    if (!duration || cuts.length <= 2) return;
    const mids = cuts.filter((c) => c !== 0 && c !== duration);
    if (!mids.length) return;
    let best = mids[0],
      bestd = Math.abs(mids[0] - t);
    for (const c of mids) {
      const d = Math.abs(c - t);
      if (d < bestd) {
        best = c;
        bestd = d;
      }
    }
    setCuts(cuts.filter((c) => c !== best));
  };

  const onMouseDown = (e) => onSeek(timeFromClientX(e.clientX));

  const zoomAround = useCallback((factor, centerTime = current) => {
    const span = Math.max(0.05, (viewEnd - viewStart) * factor);
    let start = Math.max(0, centerTime - span / 2);
    let end = Math.min(duration || 0, start + span);
    if (end - start < span) start = Math.max(0, end - span);
    setView({ start, end });
  }, [current, duration, setView, viewEnd, viewStart]);
  const fit = () => setView({ start: 0, end: duration || 0 });

  useEffect(() => {
    const canvas = barRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      e.preventDefault();
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const pad = 8;
      const relativePos = (mouseX - pad) / (rect.width - pad * 2);
      const mouseTime = viewStart + relativePos * (viewEnd - viewStart);

      if (e.ctrlKey || e.metaKey) {
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
        zoomAround(zoomFactor, mouseTime);
      } else {
        const panAmount = (e.deltaX || e.deltaY) * 0.001 * (viewEnd - viewStart);
        let newStart = viewStart + panAmount;
        let newEnd = viewEnd + panAmount;
        
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > duration) {
          newStart -= (newEnd - duration);
          newEnd = duration;
        }
        
        setView({ start: Math.max(0, newStart), end: Math.min(duration, newEnd) });
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [viewStart, viewEnd, duration, current, setView, zoomAround]);

  return (
    <div className="space-y-2">
      <div
        ref={barRef}
        className="w-full rounded-xl border bg-white"
        style={{ height: 64, position: "relative", cursor: "pointer" }}
        onMouseDown={onMouseDown}
      >
        <canvas ref={canvasRef} width={800} height={64} style={{ width: "100%", height: "64px", display: "block", borderRadius: "12px" }} />
      </div>

      <div className="timeline-controls flex items-center gap-2 text-sm">
        <button className="bg-black" onClick={() => splitAt(current)} disabled={!duration}>
          Split at {timeToStrMs(current)}
        </button>
        <button className="bg-black" onClick={() => removeNearestCut(current)} disabled={cuts.length <= 2}>
          Remove Nearest Split
        </button>

        <div className="ml-4 inline-flex gap-2">
          <button className="bg-black" onClick={() => zoomAround(0.5)}>
            Zoom In
          </button>
          <button className="bg-black" onClick={() => zoomAround(2)}>
          Zoom Out
          </button>
          <button className="bg-black" onClick={fit}>
            Fit
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAnswerColumns(questions, segmentId, prefix, answers) {
  const values = answers[segmentId] || {};
  const columns = {};
  for (const question of questions) {
    columns[`${prefix}_${question.id}`] = values[question.id] ?? "";
    if (question.hasDropdown) {
      const dropdown = values[`${question.id}_dropdown`] ?? "";
      columns[`${prefix}_${question.id}_dropdown`] = dropdown === "Other"
        ? values[`${question.id}_dropdown_other`] ?? ""
        : dropdown;
    }
  }
  return columns;
}

function StatusMessage({ status }) {
  if (!status.message) return null;
  const color = { loading: "bg-blue-600", success: "bg-green-600", error: "bg-red-600" }[status.type] || "bg-gray-600";
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-4 rounded-xl shadow-lg max-w-2xl w-auto text-white ${color}`}>
      <div className="flex items-center gap-3">
        {status.type === "loading" && <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />}
        {status.type === "success" && <span className="text-xl">✓</span>}
        {status.type === "error" && <span className="text-xl">✗</span>}
        <span className="font-medium">{status.message}</span>
      </div>
    </div>
  );
}

function Uploader({ onVideoLoaded, onPackageReady }) {
  const videoRef = useRef(null);

  const [videoURL, setVideoURL] = useState("");
  const [videoBlob, setVideoBlob] = useState(null);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [waveform, setWaveform] = useState(null);

  const [view, setView] = useState({ start: 0, end: 0 });

  const [meta, setMeta] = useState({ participant_id: "", age_months: "", order: "" });

  const [pairs, setPairs] = useState([]);
  const pairMap = useMemo(() => Object.fromEntries(pairs.map((p) => [p.pairId, p])), [pairs]);

  useEffect(() => {
    const ord = String(meta.order || "").trim();
    if (ord === "1" || ord === "2" || ord === "3" || ord === "4") {
      setPairs((ORDER_DEFS[ord] || []).map((p, i) => ({ pairId: i + 1, ...p })));
    } else setPairs([]);
  }, [meta.order]);

  const [cuts, setCuts] = useState([0, 0]);
  const [selectedSeg, setSelectedSeg] = useState(0);
  const [assign, setAssign] = useState({});
  
  const [uploadStatus, setUploadStatus] = useState({ message: "", type: "" }); // type: "loading" | "success" | "error" | ""

  const onLoadVideo = async (f) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    setVideoURL(url);
    setVideoBlob(f);
    onVideoLoaded && onVideoLoaded(url);
    const wf = await extractWaveformFromURL(url);
    setWaveform(wf);
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrent(v.currentTime || 0);
    const onMeta = () => {
      const d = v.duration || 0;
      setDuration(d);
      setCuts([0, d]);
      setSelectedSeg(0);
      setAssign({});
      setView({ start: 0, end: d });
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [videoURL]);

  const segments = useMemo(() => {
    if (!duration || cuts.length < 2) return [];
    const out = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const start = cuts[i];
      const end = cuts[i + 1];
      out.push({ index: i, start, end, ...(assign[i] || {}) });
    }
    return out;
  }, [cuts, duration, assign]);

  const setSegAssign = (i, patch) =>
    setAssign((prev) => ({ ...prev, [i]: { ...(prev[i] || {}), ...patch } }));

  const seek = (t) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(duration || 0, t));
  };

  const splitAtCurrent = useCallback(() => {
    if (!duration) return;
    const t = current;
    const EPS = 0.03;
    if (t < EPS || t > duration - EPS) return;
    if (cuts.some((c) => Math.abs(c - t) < EPS)) return;
    setCuts([...cuts, t].sort((a, b) => a - b));
  }, [current, cuts, duration]);

  const removeNearest = useCallback((t) => {
    if (!duration || cuts.length <= 2) return;
    const mids = cuts.filter((c) => c !== 0 && c !== duration);
    if (!mids.length) return;
    let best = mids[0],
      bestd = Math.abs(mids[0] - t);
    for (const c of mids) {
      const d = Math.abs(c - t);
      if (d < bestd) {
        best = c;
        bestd = d;
      }
    }
    setCuts(cuts.filter((c) => c !== best));
  }, [cuts, duration]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        const video = videoRef.current;
        if (video) video.paused ? video.play() : video.pause();
      } else if ((e.key === "s" || e.key === "S") && duration) {
        e.preventDefault();
        splitAtCurrent();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        removeNearest(current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, duration, removeNearest, splitAtCurrent]);

  const buildPackage = () => {
    const segs = segments
      .filter((s) => s.type && s.type !== "other" && s.pairId)
      .map((s) => ({ id: uid(), type: s.type, start: s.start, end: s.end, pairId: s.pairId }));
    return {
      meta: { participant_id: meta.participant_id, age_months: meta.age_months, order: meta.order },
      pairs,
      segments: segs,
    };
  };

  const saveToDropbox = async () => {
    if (!videoBlob) {
      setUploadStatus({ message: "Please choose a video first.", type: "error" });
      setTimeout(() => setUploadStatus({ message: "", type: "" }), 3000);
      return;
    }
    if (!meta.order || !(pairs.length > 0)) {
      setUploadStatus({ message: "Set order (1-4) so pairs are ready.", type: "error" });
      setTimeout(() => setUploadStatus({ message: "", type: "" }), 3000);
      return;
    }
    if (!meta.participant_id) {
      setUploadStatus({ message: "Please enter a participant ID.", type: "error" });
      setTimeout(() => setUploadStatus({ message: "", type: "" }), 3000);
      return;
    }
    
    const pkg = buildPackage();
    try {
      setUploadStatus({ message: "Uploading to dropbox... This may take a (long) while!", type: "loading" });
      const sessionId = await DropboxService.uploadVideo(videoBlob, meta.participant_id);
      await DropboxService.saveSessionData(sessionId, pkg);
      setUploadStatus({ message: "Successfully saved to dropbox! Coders can now access this video.", type: "success" });
      setTimeout(() => setUploadStatus({ message: "", type: "" }), 5000);
      onPackageReady && onPackageReady(pkg);
      await refreshUploaderSessions();
    } catch (e) {
      console.error("Save error:", e);
      setUploadStatus({ message: `Upload failed: ${e.message}`, type: "error" });
      setTimeout(() => setUploadStatus({ message: "", type: "" }), 5000);
    }
  };

  const [uploaderSessions, setUploaderSessions] = useState([]);
  const [loadingUploader, setLoadingUploader] = useState(false);

  const refreshUploaderSessions = async () => {
    setLoadingUploader(true);
    try {
      const sessions = await DropboxService.listSessions();
      setUploaderSessions(sessions);
      reportSessionLoadWarnings(sessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      setLoadingUploader(false);
    }
  };

  useEffect(() => {
    refreshUploaderSessions();
  }, []);

  return (
    <div className="space-y-6">
      {/* Step 1: Two columns - Participant Info (left) and Video Status (right) */}
      <div className="grid grid-cols-2 gap-6 session-panels">
        {/* LEFT: Participant Info */}
        <div className="p-6 surface-panel">
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <span className="text-2xl">①</span> Enter participant information
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-4 items-center">
              <label className="col-span-3 text-sm font-medium text-gray-700 text-right">Participant ID:</label>
              <input 
                className="form-control col-span-9 px-4 py-2.5 "
                value={meta.participant_id} 
                onChange={(e) => setMeta({ ...meta, participant_id: e.target.value })} 
                placeholder="e.g., S001"
              />
            </div>
            <div className="grid grid-cols-12 gap-4 items-center">
              <label className="col-span-3 text-sm font-medium text-gray-700 text-right">Age (months):</label>
              <input 
                className="form-control col-span-9 px-4 py-2.5 "
                type="number"
                value={meta.age_months} 
                onChange={(e) => setMeta({ ...meta, age_months: e.target.value })} 
                placeholder="e.g., 24"
              />
            </div>
            <div className="grid grid-cols-12 gap-4 items-center">
              <label className="col-span-3 text-sm font-medium text-gray-700 text-right">Order:</label>
              <select 
                className={`form-control col-span-9 px-4 py-2.5 bg-white cursor-pointer ${!meta.order ? 'text-gray-400' : 'text-gray-900'}`}
                value={meta.order} 
                onChange={(e) => setMeta({ ...meta, order: e.target.value })}
              >
                <option value="" disabled>— Select order —</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
          </div>
          {pairs.length > 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-sm text-green-700 font-medium">✓ {pairs.length} pairs loaded for order {meta.order}</span>
            </div>
          )}
          </div>

        {/* RIGHT: Video Status */}
        <div className="p-6 bg-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Video status</h3>
            <button 
              onClick={refreshUploaderSessions}
              disabled={loadingUploader}
              className="transition-colors"
            >
              Refresh
            </button>
          </div>
          {uploaderSessions.length === 0 && !loadingUploader && (
            <div className="text-center py-8 text-gray-500 text-sm">
              No videos uploaded yet
            </div>
          )}
          {loadingUploader && (
            <div className="text-center py-8 text-gray-500 text-sm">
              Loading...
            </div>
          )}
          {uploaderSessions.length > 0 && (
            <div className="table-scroll uploader-table-scroll rounded-lg" tabIndex={0} role="region" aria-label="Uploaded videos">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">ID</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Age (months)</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {uploaderSessions.map((s) => {
                    const uploadDate = formatDate(s.savedAt);

                    return (
                      <tr key={s.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium">{s.meta?.participant_id || s.id}</td>
                        <td className="py-2 px-3 text-gray-600">{s.meta?.age_months ?? "—"}</td>
                        <td className="py-2 px-3 text-gray-600">{uploadDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Upload video & split into segments */}
      <div className="p-6 surface-panel">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="text-2xl">②</span> Upload and segment video
        </h3>
        
        {!videoURL && (
          <label className="flex items-center justify-center w-full border-2 border-dashed border-gray-400 bg-gray-100 rounded-xl p-8 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all">
            <div className="text-center">
              <span className="text-base font-medium text-gray-700 py-3 px-4 inline-block">Click here to select video file</span>
            </div>
            <input type="file" accept="video/*" onChange={(e) => onLoadVideo(e.target.files?.[0])} className="hidden" />
          </label>
        )}
        
            {videoURL && (
          <div className="grid grid-cols-2 gap-6 session-panels">
            {/* LEFT: Video & Split Controls */}
            <div>
              <video ref={videoRef} src={videoURL} controls className="w-full rounded-xl shadow-lg" />
              <div className="text-sm mt-3 text-gray-600 bg-gray-50 p-3 rounded-lg flex justify-between">
                <span><span className="font-medium">Current:</span> {timeToStrMs(current)}</span>
                <span><span className="font-medium">Duration:</span> {timeToStrMs(duration)}</span>
                </div>
              
              <div className="mt-4">
                <SplitTimeline
                  duration={duration}
                  current={current}
                  cuts={cuts}
                  setCuts={setCuts}
                  onSeek={seek}
                  viewStart={view.start}
                  viewEnd={view.end}
                  setView={setView}
                  waveform={waveform}
                  onSplitAt={splitAtCurrent}
                  onRemoveNearest={removeNearest}
                />
          </div>
        </div>

            {/* RIGHT: Segments List */}
            <div>
              <div className="space-y-3 overflow-y-auto pr-2" style={{ maxHeight: "500px" }}>
            {segments.map((s) => {
              const pair = s.pairId ? pairMap[s.pairId] : null;
                const pairLabel = pair ? `${pair.book} • ${pair.question}` : "—";
                const isSelected = selectedSeg === s.index;
                
                const usedCombos = segments
                  .filter((seg) => seg.index !== s.index && seg.type && seg.pairId)
                  .map((seg) => `${seg.type}-${seg.pairId}`);
                
              return (
                <div
                  key={s.index}
                    className={`segment-card p-4 rounded-xl border text-sm cursor-pointer transition-all ${
                      isSelected 
                        ? "border-blue-600 bg-blue-50 shadow-md" 
                        : s.type && s.pairId 
                        ? "border-gray-300 bg-gray-100"
                        : "border-gray-300 bg-white"
                    }`}
                  onClick={() => setSelectedSeg(s.index)}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="px-3 py-1 rounded-full bg-gray-700 text-white text-xs font-semibold">#{s.index + 1}</div>
                      <div className="font-mono text-xs bg-gray-100 px-3 py-1 rounded">
                        {timeToStrMs(s.start)} → {timeToStrMs(s.end)}
                    </div>
                      <span className="text-xs text-gray-500">({(s.end - s.start).toFixed(2)}s)</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      <span className="font-medium">{s.type || "No type assigned"}</span>
                      {s.pairId && <span className="ml-2">• {pairLabel}</span>}
                  </div>
                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-gray-300 space-y-3">
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Type:</label>
                        <select
                            className="form-control flex-1 px-3 py-2 text-sm bg-white"
                          value={s.type || ""}
                          onChange={(e) => setSegAssign(s.index, { type: e.target.value })}
                        >
                            <option value="">— select type —</option>
                            <option value="parent_question">Parent question</option>
                            <option value="child_response">Child response</option>
                            <option value="other">Other</option>
                        </select>
                          <button
                            className="bg-blue-600 transition-colors whitespace-nowrap"
                            onClick={(e) => {
                              e.stopPropagation();
                              seek(s.start);
                              videoRef.current?.play();
                            }}
                          >
                            ▶ Play
                          </button>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Pair:</label>
                        <select
                            className="form-control flex-1 px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
                          value={s.pairId || ""}
                          onChange={(e) => setSegAssign(s.index, { pairId: Number(e.target.value) || undefined })}
                          disabled={s.type === "other" || !pairs.length}
                            title={s.type === "other" ? "Not applicable for 'other' type" : !pairs.length ? "Select order first" : ""}
                          >
                            <option value="">— select pair —</option>
                            {pairs.map((p) => {
                              const comboKey = s.type ? `${s.type}-${p.pairId}` : "";
                              const isUsed = comboKey && usedCombos.includes(comboKey);
                              return (
                                <option key={p.pairId} value={p.pairId} disabled={isUsed}>
                                  Pair {p.pairId}: {p.book} • {p.question} {isUsed ? "(already used)" : ""}
                            </option>
                              );
                            })}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
              {!segments.length && (
                <div className="text-center py-12 text-gray-500">
                  <div className="text-3xl mb-2">✂️</div>
                  <p>Split the video to create segments</p>
          </div>
              )}
              </div>
            </div>
          </div>
        )}
        </div>

      {/* Step 3: Upload to Dropbox */}
      {videoURL && segments.length > 0 && (
        <div className="p-6 surface-panel">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="text-2xl">③</span> Save video
          </h3>
            <button
            onClick={saveToDropbox} 
            className="bg-blue-600 transition-colors w-full disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!pairs.length || !meta.participant_id || uploaderSessions.some(s => s.meta?.participant_id === meta.participant_id)}
          >
            Upload to dropbox
            </button>
          <div className="mt-4">
            {!meta.participant_id && (
              <div className="error-message">
                ⚠️ Please enter participant ID first
          </div>
            )}
            {!pairs.length && meta.participant_id && (
              <div className="error-message">
                ⚠️ Please select an order to load pairs
        </div>
            )}
              {pairs.length > 0 && meta.participant_id && (() => {
              const existingSession = uploaderSessions.find(s =>
                s.meta?.participant_id === meta.participant_id
              );
              
              if (existingSession) {
                return (
                  <div className="error-message">
                    ⚠️ This video has already been uploaded before (participant ID: {meta.participant_id}).
                  </div>
                );
              }
              
              return null;
            })()}
          </div>
        </div>
      )}
      
      {/* Upload Status Bar */}
      <StatusMessage status={uploadStatus} />
    </div>
  );
}

function Coder({ videoURL = "", initialPkg = null }) {
  const [vURL, setVURL] = useState(videoURL || "");
  const [pkg, setPkg] = useState(initialPkg || null);
  const [sessionId, setSessionId] = useState("");
  const [phase, setPhase] = useState(0);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [phaseOrders, setPhaseOrders] = useState({});
  const [savedSessions, setSavedSessions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ message: "", type: "" });

  const refreshSessions = async () => {
    setLoading(true);
    try {
      const sessions = await DropboxService.listSessions();
      setSavedSessions(sessions);
      reportSessionLoadWarnings(sessions);
    } catch (error) {
      console.error("Failed to load sessions:", error);
      alert(`Failed to load sessions from Dropbox: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSessions();
  }, []);

  useEffect(() => {
    if (videoURL) setVURL((currentURL) => currentURL || videoURL);
  }, [videoURL]);
  useEffect(() => {
    if (initialPkg) setPkg((currentPkg) => currentPkg || initialPkg);
  }, [initialPkg]);

  const orderedSessions = [...savedSessions].sort((a, b) =>
    String(a.meta?.participant_id || a.label || a.id).localeCompare(
      String(b.meta?.participant_id || b.label || b.id), undefined, { numeric: true, sensitivity: 'base' }
    )
  );
  const uncodedSessions = orderedSessions.filter(s => s.status !== 'completed');
  const completedSessions = orderedSessions.filter(s => s.status === 'completed').reverse();
  const currentSession = savedSessions.find(s => s.id === sessionId);
  const isAlreadySaved = Boolean(currentSession?.progress?.completedAt);
  const isMissingSessionId = !sessionId;

  const buildQueueInOrder = (
    type,
    sessionPackage = pkg,
    savedOrder = phaseOrders[type] || [],
  ) => {
    const segs = (sessionPackage?.segments || []).filter(
      (segment) => segment.type === type,
    );
    const segmentsById = new Map(segs.map((segment) => [segment.id, segment]));
    const savedSegments = savedOrder
      .map((segmentId) => segmentsById.get(segmentId))
      .filter(Boolean);
    const savedIds = new Set(savedSegments.map((segment) => segment.id));
    const newSegments = segs
      .filter((segment) => !savedIds.has(segment.id))
      .map((segment) => ({ ...segment, sortKey: Math.random() }))
      .sort((a, b) => a.sortKey - b.sortKey);
    const orderedSegments =
      savedSegments.length > 0 ? [...savedSegments, ...newSegments] : newSegments;
    const qset = type === "child_response" ? CHILD_QUESTIONS : PARENT_QUESTIONS;
    return {
      queue: orderedSegments.map((segment) => ({
        seg: segment,
        questions: qset,
      })),
      order: orderedSegments.map((segment) => segment.id),
    };
  };

  const startPhase = (p) => {
    if (!pkg) return;
    const type = p === 1 ? "child_response" : "parent_question";
    const result = buildQueueInOrder(type);
    setPhaseOrders((previous) => ({
      ...previous,
      [type]: result.order,
    }));
    setQueue(result.queue);
    setIdx(0);
    setPhase(p);
  };

  const current = queue[idx] || null;
  const setAns = (segId, qId, value) => {
    setAnswers((prev) => {
      const segAnswers = { ...(prev[segId] || {}), [qId]: value };
      
      const questions = current?.questions || [];
      const question = questions.find((q) => q.id === qId);
      if (question?.hasDropdown && value !== "Yes") {
        delete segAnswers[`${qId}_dropdown`];
        delete segAnswers[`${qId}_dropdown_other`];
      }
      
      if (qId.endsWith("_dropdown") && value !== "Other") {
        const baseQId = qId.replace("_dropdown", "");
        delete segAnswers[`${baseQId}_dropdown_other`];
      }
      
      questions.forEach((q) => {
        if (q.dependsOn && q.dependsOn[qId] !== undefined) {
          delete segAnswers[q.id];
          delete segAnswers[`${q.id}_dropdown`];
          delete segAnswers[`${q.id}_dropdown_other`];
          
          questions.forEach((q2) => {
            if (q2.dependsOn && q2.dependsOn[q.id] !== undefined) {
              delete segAnswers[q2.id];
              delete segAnswers[`${q2.id}_dropdown`];
              delete segAnswers[`${q2.id}_dropdown_other`];
            }
          });
        }
      });
      
      return { ...prev, [segId]: segAnswers };
    });
  };
  
  const shouldShowQuestion = (question, segId) => {
    const segAnswers = answers[segId] || {};
    const conditions = [question.dependsOn, question.dependsOnOr].filter(Boolean);

    return conditions.length === 0 || conditions.some(condition =>
      Object.entries(condition).every(([questionId, required]) =>
        Array.isArray(required)
          ? required.includes(segAnswers[questionId])
          : segAnswers[questionId] === required
      )
    );
  };

  const areAllRequiredQuestionsAnswered = () => {
    if (!current) return false;
    
    const segId = current.seg.id;
    const segAnswers = answers[segId] || {};
    const questions = current.questions || [];
    
    for (const q of questions) {
      if (!shouldShowQuestion(q, segId)) continue;
      
      const answer = segAnswers[q.id];
      
      if (!answer || answer === "") {
        return false;
      }
      
      if (q.hasDropdown && answer === "Yes") {
        const dropdownValue = segAnswers[`${q.id}_dropdown`];
        if (!dropdownValue || dropdownValue === "") {
          return false;
        }
        
        if (dropdownValue === "Other") {
          const otherText = segAnswers[`${q.id}_dropdown_other`];
          if (!otherText || otherText.trim() === "") {
            return false;
          }
        }
      }
    }
    
    return true;
  };

  const nextClip = () => {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1);
    } else {
      if (phase === 1) startPhase(2);
      else setPhase(3);
    }
  };

  const saveResponsesToDropbox = async () => {
    if (saveStatus.type === "loading") return;
    if (!pkg) {
      setSaveStatus({ message: "⚠️ Error: Session data is missing. Please reload the video.", type: "error" });
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 5000);
      return;
    }
    
    if (!sessionId) {
      setSaveStatus({ message: "⚠️ Error: Session ID is missing. Please reload the video from the list.", type: "error" });
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 5000);
      return;
    }
    
    if (isAlreadySaved) {
      setSaveStatus({ message: `⚠️ Responses have already been saved for this session.`, type: "error" });
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 5000);
      return;
    }
    

    const pairIds = Array.from(new Set(pkg.pairs.map((p) => p.pairId)));
    const rows = pairIds.map((pid) => {
      const p = pkg.pairs.find((pp) => pp.pairId === pid) || { book: "", question: "", target: "" };
      const base = {
        participant_id: pkg.meta.participant_id || "",
        age_months: pkg.meta.age_months || "",
        order: pkg.meta.order || "",
        book: p.book,
        question: p.question,
        target: p.target,
      };
      const childSeg = pkg.segments.find((s) => s.pairId === pid && s.type === "child_response");
      const parentSeg = pkg.segments.find((s) => s.pairId === pid && s.type === "parent_question");
      return {
        ...base,
        ...formatAnswerColumns(CHILD_QUESTIONS, childSeg?.id, "child", answers),
        ...formatAnswerColumns(PARENT_QUESTIONS, parentSeg?.id, "parent", answers),
      };
    });

    try {
      setSaveStatus({ message: "Saving responses to dropbox...", type: "loading" });
      
      const completion = await DropboxService.saveCompletion(sessionId, {
        phase: 3,
        answers,
        phaseOrders,
      }, rows);
      setSavedSessions((previous) => previous.map((session) => session.id === sessionId
        ? { ...session, status: "completed", progress: { completedAt: completion.completedAt } }
        : session));
      
      setSaveStatus({ message: "Responses saved to dropbox successfully!", type: "success" });
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 5000);
      await refreshSessions();
    } catch (error) {
      console.error("Failed to save responses:", error);
      setSaveStatus({ message: `Failed to save responses: ${error.message}`, type: "error" });
      setTimeout(() => setSaveStatus({ message: "", type: "" }), 5000);
    }
  };

  const loadFromDropbox = async () => {
    if (!selectedId) return;
    
    setLoading(true);
    try {
      const sess = await DropboxService.loadSession(selectedId);
    if (!sess) return alert("Load failed.");
      
      setVURL(sess.videoURL);
    setPkg(sess.pkg);
      setSessionId(selectedId);
      
      setPhase(sess.pendingSubmission ? 3 : 0);
      setIdx(0);
      setAnswers(sess.pendingSubmission?.answers || {});
      setPhaseOrders(sess.pendingSubmission?.phaseOrders || {});
      setQueue([]);
      setSaveStatus(sess.pendingSubmission
        ? { message: "Please try saving your responses again.", type: "error" }
        : { message: "", type: "" });
    } catch (error) {
      alert(`Load failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Video Selection Panel - Two columns */}
      <div className="grid grid-cols-2 gap-6 session-panels" style={{ gridAutoRows: "1fr" }}>
        {/* LEFT: Videos to Code */}
        <div className="p-6 surface-panel flex flex-col" style={{ maxHeight: "420px" }}>
          <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
            <span className="text-2xl">①</span> Select a video to code
            {loading && <span className="text-sm text-gray-500">Loading...</span>}
          </h3>
            
          <div className="table-scroll pr-2 mb-4 flex-1 min-h-0" tabIndex={0} role="region" aria-label="Videos to code">
            {!loading && uncodedSessions.length === 0 && savedSessions.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p>No videos available yet</p>
          </div>
            )}
            {!loading && uncodedSessions.length === 0 && savedSessions.length > 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p>All videos have been coded!</p>
              </div>
            )}
            <div className="space-y-2">
              {uncodedSessions.map((s) => {
                const statusBadge =
                  <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800 border border-gray-300">Uncoded</span>;
                const dateStr = formatDate(s.savedAt, "Recently uploaded");
                
                return (
                  <div
                    key={s.id}
                    className={`session-card p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedId === s.id 
                        ? 'border-gray-500 bg-gray-200' 
                        : 'border-gray-300 bg-white'
                    }`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-sm">{s.meta?.participant_id || s.label}</div>
                      {statusBadge}
                    </div>
                    <div className="text-xs text-gray-600">Uploaded: {dateStr}</div>
                  </div>
                );
              })}
          </div>
        </div>

          <div className="flex gap-3">
            <button 
              className="flex-1 bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              onClick={loadFromDropbox}
              disabled={!selectedId || loading}
            >
              Load selected video
                </button>

              </div>
            </div>

        {/* RIGHT: Completed Videos */}
        <div className="p-6 bg-gray-100 flex flex-col" style={{ maxHeight: "420px" }}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold">Your completed videos</h3>
            <button className="transition-colors" onClick={refreshSessions} disabled={loading}>
              Refresh
            </button>
          </div>
          
          {loading && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <p>Loading completed videos...</p>
            </div>
          )}
          {!loading && completedSessions.length === 0 && (
            <div className="text-center py-8 text-gray-500 text-sm">
              <p>No completed videos yet</p>
            </div>
          )}
          {!loading && completedSessions.length > 0 && (
            <div className="table-scroll rounded-lg flex-1 min-h-0" tabIndex={0} role="region" aria-label="Completed videos">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">ID</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Uploaded</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Coded</th>
                  </tr>
                </thead>
                <tbody>
                  {completedSessions.map((s) => {
                    const uploadDate = formatDate(s.savedAt);
                    const codedDate = formatDate(s.progress?.completedAt);
                    return (
                      <tr key={s.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="py-2 px-3 font-medium">{s.meta?.participant_id || s.id}</td>
                        <td className="py-2 px-3 text-gray-600">{uploadDate}</td>
                        <td className="py-2 px-3 text-gray-600">{codedDate}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Coding Interface */}
      {pkg && vURL && (
        <div>
          {/* Phase 0: Ready to code */}
            {phase === 0 && (
            <div className="p-6 surface-panel">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                 <span className="text-2xl">②</span> Code selected video
            </h3>
              <div className="text-center py-12">
                <div className="text-gray-500 mb-4">
                  <p className="mb-2 text-gray-900"><span className="font-medium">Participant:</span> {pkg.meta.participant_id}</p>
                  <p className="mb-2 text-sm text-gray-600">Please make sure to save your responses after you finish coding. No progress is saved midway, so please do not reload this website until you save your responses.</p>
                  <br/>
                </div>
                <button 
                  className="bg-blue-600 transition-colors"
                  onClick={() => startPhase(1)}
                >
                  ▶ Start coding
                </button>
              </div>
              </div>
            )}

          {/* Phase 1 & 2: Coding interface with video on left, questions on right */}
            {phase > 0 && phase < 3 && current && (
            <div className="p-6 surface-panel">
              <h2 className="text-xl font-semibold mb-6">
                {phase === 1 ? 'Phase 1: Child responses' : 'Phase 2: Parent questions'}
              </h2>
              
              <div className="grid grid-cols-2 gap-6 items-start">
                {/* LEFT: Clip counter + Video + Replay Button */}
                <div>
                  <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg mb-3 inline-block">
                    Clip {idx + 1} of {queue.length}
                  </div>
                  <RangePlayer 
                    fileURL={vURL} 
                    start={current.seg.start} 
                    end={current.seg.end} 
                  />
                </div>
                
                {/* RIGHT: Questions - Scrollable */}
                <div className="flex flex-col justify-between" style={{ minHeight: "620px" }}>
                  <div>
                    <div className="text-sm px-3 py-1.5 rounded-lg mb-3 font-semibold">
                      Questions
                    </div>
                    <div className="space-y-4 pr-2 pb-4" style={{ maxHeight: "515px", overflowY: "auto" }}>
                      {current.questions.map((q) => {
                        if (!shouldShowQuestion(q, current.seg.id)) return null;
                        const currentAnswer = answers[current.seg.id]?.[q.id] || "";
                        const dropdownId = `${q.id}_dropdown`;
                        const dropdownValue = answers[current.seg.id]?.[dropdownId] || "";
                        const otherTextId = `${q.id}_dropdown_other`;
                        const otherTextValue = answers[current.seg.id]?.[otherTextId] || "";
                        const showDropdown = q.hasDropdown && currentAnswer === "Yes";
                        const showOtherText = showDropdown && dropdownValue === "Other";
                        
                        return (
                          <div key={q.id} className="p-4 rounded-xl border bg-gray-50">
                            <div className="text-sm font-medium mb-3">{q.text}</div>
                            {q.instruction && q.type !== "text" && (
                              <p className="text-xs text-gray-500 mb-3">{q.instruction}</p>
                            )}
                            {q.type === "text" ? (
                              <div className="space-y-2">
                                <textarea
                                  value={currentAnswer}
                                  onChange={(e) => setAns(current.seg.id, q.id, e.target.value)}
                                  placeholder={q.placeholder || ""}
                                  className="form-control w-full px-3 py-2 text-sm resize-y"
                                  rows={3}
                                />
                                {q.instruction && (
                                  <p className="text-xs text-gray-500 mt-1">{q.instruction}</p>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {q.options.map((opt) => (
                                  <label key={opt} className="flex items-center gap-2 cursor-pointer hover:bg-white p-2 rounded transition-colors">
                                    <input
                                      type="radio"
                                      name={`q-${current.seg.id}-${q.id}`}
                                      onChange={() => setAns(current.seg.id, q.id, opt)}
                                      checked={currentAnswer === opt}
                                      className="w-4 h-4"
                                    />
                                    <span className="text-sm">{opt}</span>
                                  </label>
                                ))}
                                {showDropdown && (
                                  <div className="mt-3 pt-3 border-t border-gray-300">
                                    <label className="block text-xs font-medium text-gray-700 mb-2">
                                      {q.dropdownLabel}
                                    </label>
                                    {q.dropdownType === "text" ? (
                                      <input
                                        type="text"
                                        value={dropdownValue}
                                        onChange={(e) => setAns(current.seg.id, dropdownId, e.target.value)}
                                        placeholder={q.dropdownPlaceholder || q.dropdownLabel}
                                        className="form-control w-full px-3 py-2 text-sm "
                                      />
                                    ) : (
                                      <>
                                        <select
                                          value={dropdownValue}
                                          onChange={(e) => setAns(current.seg.id, dropdownId, e.target.value)}
                                          className="form-control w-full px-3 py-2 text-sm bg-white"
                                        >
                                          <option value="">— Select —</option>
                                          {q.dropdownOptions?.map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                        {showOtherText && (
                                          <div className="mt-3">
                                            <label className="block text-xs font-medium text-gray-700 mb-2">
                                              Please specify:
                                            </label>
                                            <input
                                              type="text"
                                              value={otherTextValue}
                                              onChange={(e) => setAns(current.seg.id, otherTextId, e.target.value)}
                                              placeholder="Type here..."
                                              className="form-control w-full px-3 py-2 text-sm "
                                            />
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                </div>
                  </div>
                  <button 
                    className="w-full bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={nextClip}
                    disabled={!areAllRequiredQuestionsAnswered()}
                  >
                    Next ▶
                  </button>
                </div>
                </div>
              </div>
            )}

          {/* Phase 3: Completed */}
            {phase === 3 && (
            <div className="p-6 surface-panel">
              <h2 className="text-xl font-semibold mb-6">Coding complete!</h2>
              <div className="text-center py-12">
                <div className="text-4xl mb-4">🎉</div>
                <div className="text-xl font-semibold text-green-600 mb-2">All clips coded!</div>
                <br/>
                
                {(() => {
                  
                  return (
                    <>
                      <button 
                        className="bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={saveResponsesToDropbox}
                        disabled={isAlreadySaved || isMissingSessionId || saveStatus.type === "loading"}
                      >
                        Save responses to dropbox
                      </button>
                      {isMissingSessionId && (
                        <div className="mt-4 error-message">
                          ⚠️ Error: Session ID is missing. Please reload the video from the list above.
                        </div>
                      )}
                      {isAlreadySaved && !isMissingSessionId && (
                        <div className="mt-4 error-message">
                          Your responses have already been saved for this video.
                        </div>
                      )}
                      {!isAlreadySaved && !isMissingSessionId && (
                        <p className="text-xs text-gray-500 mt-3">Responses will be added to the master spreadsheet</p>
                      )}
                    </>
                  );
                })()}
              </div>
              </div>
            )}
          </div>
      )}
      
      {/* Save Status Bar */}
      <StatusMessage status={saveStatus} />
    </div>
  );
}

function AppFooter() {
  return (
    <div className="mt-8 text-xs text-gray-500 text-center">
      <p>
        If any questions or issues arise, please feel free to contact
        {" "}hsierliu@fas.harvard.edu. Happy coding :)
      </p>
    </div>
  );
}

// Temporary admin-only controls for the participant-folder migration.
function MigrationControls() {
  const [plans, setPlans] = useState([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const preview = async () => {
    setBusy(true); setPlans([]); setFinished(false);
    try {
      const inventory = await DropboxService.migrationRequest();
      const next = [];
      const participants = new Map();
      for (const folderName of inventory.folders) {
        setStatus(`Reading participant information from ${folderName}…`);
        const plan = await DropboxService.migrationRequest("folder", undefined, folderName);
        if (participants.has(plan.participant)) {
          throw new Error(`Two folders contain participant ${plan.participant}: ${participants.get(plan.participant)} and ${folderName}. No changes were made.`);
        }
        participants.set(plan.participant, folderName);
        next.push(plan);
      }
      setStatus("Checking master CSV…");
      next.push({ participant: "csv", ...await DropboxService.migrationRequest("csv") });
      setPlans(next); setStatus("Dry run complete. Review all source and destination paths below before applying.");
    } catch (error) { setStatus(error.message); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true); setFinished(true);
    try {
      for (const plan of plans) {
        setStatus(`Migrating ${plan.participant}…`);
        await DropboxService.migrationRequest(plan.participant, plan.token, plan.folderName);
      }
      setStatus("Migration completed and files verified. Refresh the admin table. Keep the Dropbox backup until you have reviewed the results.");
    } catch (error) { setStatus(`Stopped: ${error.message}. Some earlier steps may have completed; review the backups before retrying.`); }
    finally { setBusy(false); }
  };
  return (
    <details className="mt-4">
      <summary>Temporary data migration (admin only)</summary>
      <p className="text-sm mt-3">Pause uploading and coding while migrating. Folders will be named using the participant ID in session.json, and the CSV session_id column will be removed. Only existing folders are processed; skipped participant numbers are fine. Dates are preserved. Originals are backed up outside the participant folder.</p>
      <div className="flex gap-3 mt-3">
        <button className="table-action" onClick={preview} disabled={busy}>Preview migration</button>
        <button className="table-action" onClick={apply} disabled={busy || !plans.length || finished}>Apply reviewed migration</button>
      </div>
      <p role="status" className="text-sm">{status}</p>
      {plans.length > 0 && <pre style={{ maxHeight: "240px", overflow: "auto", fontSize: "12px" }}>{JSON.stringify(plans, null, 2)}</pre>}
    </details>
  );
}

function AdminPanel() {
  const dialog = useRef(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(await DropboxService.loadAdminStatus());
    } catch (error) {
      setError(error.message || "Could not load coding status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" className="admin-tab px-4 py-2 rounded-lg bg-white border shadow text-sm"
        onClick={() => { dialog.current.showModal(); refresh(); }}>
        Admin
      </button>
      <dialog ref={dialog} className="admin-status-dialog" aria-labelledby="admin-status-heading">
        <MigrationControls />
        <div className="flex justify-between items-center gap-4 mb-4">
          <h2 id="admin-status-heading" className="text-xl font-semibold">Upload and coding status</h2>
          <div className="flex gap-2">
            <button type="button" className="table-action" onClick={refresh} disabled={loading}>Refresh</button>
            <button type="button" className="table-action" onClick={() => dialog.current.close()} autoFocus>Close</button>
          </div>
        </div>
        {loading && <p role="status">Loading status…</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {result?.sessions.loadWarnings?.length > 0 && (
          <div role="alert" className="text-red-700 mb-4">
            Some sessions could not be checked:
            <ul>{result.sessions.loadWarnings.map((warning) => <li key={warning.id}>{warning.id}: {warning.reason}</li>)}</ul>
          </div>
        )}
        {result && (
          <>
            {result.sessions.some((session) => session.hasLegacyResponse) && (
              <p className="text-sm text-gray-600 mb-4">Older shared response files are preserved. They are not assigned to an email or counted as individual coding here.</p>
            )}
            <div className="table-scroll admin-table-scroll" tabIndex={0} role="region" aria-label="Upload and coding status table">
              <table className="w-full text-sm admin-status-table">
                <thead>
                  <tr>
                    <th scope="col">Subject #</th>
                    <th scope="col">Age (months)</th>
                    <th scope="col">Uploaded</th>
                    {result.emails.map((email) => <th scope="col" key={email}>{email}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.sessions.map((session) => (
                    <tr key={session.id}>
                      <th scope="row">
                        {session.meta.participant_id || session.id}
                      </th>
                      <td>{session.meta.age_months ?? "—"}</td>
                      <td>{formatDate(session.savedAt)}</td>
                      {result.emails.map((email) => (
                        <td key={email}>
                          {session.completions[email]
                            ? <time dateTime={session.completions[email]} title={new Date(session.completions[email]).toLocaleString()}>{formatDate(session.completions[email])}</time>
                            : "-"}
                          {session.pending.includes(email) && <div className="text-xs text-red-700">Save needs retry</div>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.sessions.length === 0 && <p className="mt-4">No uploaded sessions to display.</p>}
          </>
        )}
      </dialog>
    </>
  );
}

function AuthenticatedApp() {
  const [mode, setMode] = useState(null);
  const [sharedVideoURL, setSharedVideoURL] = useState("");
  const [sharedPkg, setSharedPkg] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [accessProfile, setAccessProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => observeAuth(async (user) => {
    setAuthUser(user);
    setMode(null);
    setAccessProfile(null);
    setAuthError("");
    if (!user) {
      setAuthLoading(false);
      return;
    }
    try {
      setAccessProfile(await getAccessProfile());
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }), []);

  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthLoading(false);
      setAuthError(error.message || "Google sign-in failed.");
    }
  };

  const handleSignOut = async () => {
    setMode(null);
    await signOutUser();
  };

  const handleRoleSelect = (selectedMode) => {
    const requiredRole = selectedMode === "uploader" ? "uploader" : "coder";
    if (!accessProfile?.roles?.includes(requiredRole)) {
      setAuthError(`Your account does not have the ${requiredRole} role.`);
      return;
    }
    setMode(selectedMode);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-700">Checking your account…</p>
        </div>
        <AppFooter />
      </div>
    );
  }

  if (!authUser || !accessProfile) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full mx-auto" style={{ maxWidth: "800px" }}>
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold mb-3">
                Welcome to Polar Questions!
              </h1>
            </div>
            <div
              className="w-full mx-auto p-8 surface-panel text-center"
              style={{ maxWidth: "500px" }}
            >
              <p className="text-gray-600 mb-8">
                Sign in with your g.harvard.edu account.
              </p>
              {authError && (
                <p className="mb-5 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700">
                  {authError}
                </p>
              )}
              {!authUser ? (
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
              >
                Sign in with Google
              </button>
              ) : (
                <div>
                  <p className="mb-4 text-sm text-gray-600">
                    Signed in as {authUser.email}
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="button-dark w-full px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full mx-auto" style={{ maxWidth: "800px" }}>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3">Welcome to Polar Questions!</h1>
            <p className="text-gray-600">
              Signed in as {accessProfile.email}.
            </p>
          </div>
          
          <div className="p-8 surface-panel role-selection">
            <div className="grid grid-cols-2 gap-4 session-panels">
              {[
                { role: "uploader", title: "Uploader", description: "Upload and separate the clips for coding" },
                { role: "coder", title: "Coder", description: "Code child and parent responses" },
              ].map(({ role, title, description }) => (
                <button key={role} onClick={() => handleRoleSelect(role)}
                  disabled={!accessProfile.roles.includes(role)}
                  className="p-6 rounded-xl border border-gray-300 bg-gray-50 hover:border-blue-500 hover:bg-white hover:shadow-lg transition-all">
                  <h2 className="text-2xl font-semibold mb-2">{title}</h2>
                  <p className={`text-gray-600 text-sm ${role === "uploader" ? "whitespace-nowrap" : ""}`}>{description}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="button-dark mt-6 w-full px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm font-medium"
            >
              Sign out
            </button>
          </div>
        </div>
        </div>
        <AppFooter />
        {accessProfile.roles.includes("admin") && <AdminPanel />}
      </div>
    );
  }

  return (
    <div className="coding-workspace min-h-screen bg-gray-100 flex flex-col p-6">
      <div className="flex-1 w-full max-w-6xl mx-auto">
        <div className="flex items-center justify-center mb-6 relative">
          <h1 className="text-2xl font-bold text-center">
            {mode === "uploader" ? "Video Uploader" : "Video Coder"}
          </h1>
          <button 
            onClick={() => setMode(null)}
            className="absolute right-0 px-4 py-2 rounded-lg text-gray-800 text-sm font-medium transition-colors"
          >
            ← Back to Selection
          </button>
        </div>

        {mode === "uploader" ? (
          <Uploader onVideoLoaded={setSharedVideoURL} onPackageReady={setSharedPkg} />
        ) : (
          <Coder videoURL={sharedVideoURL} initialPkg={sharedPkg} />
        )}

      </div>
      <AppFooter />
        {accessProfile.roles.includes("admin") && <AdminPanel />}
    </div>
  );
}

export default function App() {
  if (firebaseConfigurationError) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col p-6">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-lg p-8 border border-red-300 bg-white shadow-sm">
            <h1 className="text-2xl font-bold text-red-700 mb-3">
              Configuration required
            </h1>
            <p className="text-gray-700">{firebaseConfigurationError}</p>
            <p className="text-sm text-gray-500 mt-4">
              Add the missing value to this Vercel environment and redeploy.
            </p>
          </div>
        </div>
        <AppFooter />
      </div>
    );
  }

  return <AuthenticatedApp />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
