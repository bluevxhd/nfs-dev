import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Send, Bot, User, Sparkles, Trash2, Square, Copy, Check, Plus, 
  Image as ImageIcon, X, Loader2, Palette, Download, FileText, 
  Menu, MessageSquare, Gamepad2, ChevronUp, Eye, Code, Monitor,
  Settings, Share2, Volume2, VolumeX, Maximize2, Minimize2,
  Clock, Zap, Shield, Cpu, Terminal, Database, Globe
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useSpring } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { GoogleGenAI } from "@google/genai";
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import SnakeGame from './components/SnakeGame';
import TicTacToeGame from './components/TicTacToeGame';
import FlappyBirdGame from './components/FlappyBirdGame';
import { soundService } from './services/soundService';

// Set PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// --- TYPES & INTERFACES ---
interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  image?: string;
  fileInfo?: {
    name: string;
    type: string;
    size: string;
  };
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  lastModified: Date;
  theme: 'blue' | 'red' | 'yellow';
}

interface SystemStatus {
  core: 'online' | 'offline' | 'busy';
  neuralLink: number;
  activeNodes: number;
  memoryUsage: string;
}
// --- HELPER COMPONENTS ---
const CodeBlock = ({ children, language, theme }: any) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleCopy = async () => {
    const text = String(children).replace(/\n$/, '');
    await navigator.clipboard.writeText(text);
    soundService.play('COPY');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group/code my-6 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950/80 shadow-2xl"
    >
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900/90 border-b border-zinc-800/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
          </div>
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-2">
            {language || 'terminal'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-500 transition-colors"
          >
            {isExpanded ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
          </button>
          <button 
            onClick={handleCopy} 
            className="p-1.5 hover:bg-zinc-800 rounded-md transition-all text-zinc-400 flex items-center gap-2"
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span className="text-[9px] font-bold uppercase tracking-widest">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.pre 
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="p-5 overflow-x-auto custom-scrollbar text-sm font-mono leading-relaxed selection:bg-sky-500/30"
          >
            <code className={`language-${language} text-zinc-300`}>{children}</code>
          </motion.pre>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const StatusBadge = ({ label, value, color }: { label: string, value: string | number, color: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.2em]">{label}</span>
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${color}`} />
      <span className="text-xs font-bold text-zinc-300 tabular-nums">{value}</span>
    </div>
  </div>
);
export default function App() {
  // --- CORE STATE ---
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'blue' | 'red' | 'yellow'>('blue');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [showGames, setShowGames] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    core: 'online',
    neuralLink: 98.4,
    activeNodes: 12,
    memoryUsage: '1.2GB'
  });

  // --- REFS ---
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // --- THEME CONFIG ---
  const themeStyles = useMemo(() => ({
    blue: {
      primary: 'text-sky-500',
      bg: 'bg-sky-500',
      bgLight: 'bg-sky-500/10',
      border: 'border-sky-500/20',
      shadow: 'shadow-sky-500/20',
      glow: 'shadow-sky-500/10',
      ring: 'focus:ring-sky-500/50',
      gradient: 'from-sky-500 via-indigo-600 to-purple-700'
    },
    red: {
      primary: 'text-red-500',
      bg: 'bg-red-500',
      bgLight: 'bg-red-500/10',
      border: 'border-red-500/20',
      shadow: 'shadow-red-500/20',
      glow: 'shadow-red-500/10',
      ring: 'focus:ring-red-500/50',
      gradient: 'from-red-500 via-orange-600 to-rose-700'
    },
    yellow: {
      primary: 'text-yellow-500',
      bg: 'bg-yellow-500',
      bgLight: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      shadow: 'shadow-yellow-500/20',
      glow: 'shadow-yellow-500/10',
      ring: 'focus:ring-yellow-500/50',
      gradient: 'from-yellow-500 via-amber-600 to-orange-700'
    }
  }), []);

  const activeTheme = themeStyles[theme];

  // --- SOUND WRAPPER ---
  const playSound = useCallback((name: any) => {
    if (!isMuted) soundService.play(name);
  }, [isMuted]);

  // --- AUTO SCROLL ---
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions]);
  // --- GEMINI INITIALIZATION ---
  const genAI = useMemo(() => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI(apiKey);
  }, []);

  const model = useMemo(() => {
    if (!genAI) return null;
    return genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.8,
        topP: 0.95,
      }
    });
  }, [genAI]);

  // --- FILE HANDLERS ---
  const handleFileUpload = async (file: File) => {
    playSound('CLICK');
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setSelectedImage(e.target?.result as string);
      reader.readAsDataURL(file);
    } else if (file.name.endsWith('.pdf')) {
      setIsLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
        }
        setInput(prev => prev + `\n[ANALYZING PDF: ${file.name}]\n${fullText}\n`);
      } catch (err) {
        console.error('PDF Error:', err);
      } finally {
        setIsLoading(false);
      }
    } else if (file.name.endsWith('.docx')) {
      setIsLoading(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setInput(prev => prev + `\n[ANALYZING DOCX: ${file.name}]\n${result.value}\n`);
      } catch (err) {
        console.error('Word Error:', err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // --- CHAT LOGIC ---
  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading || !model) return;

    const userText = input;
    const userImg = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);
    playSound('SEND');

    const newUserMessage: Message = {
      role: 'user',
      content: userText,
      timestamp: new Date(),
      image: userImg || undefined
    };

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      const newSession: ChatSession = {
        id: sessionId,
        title: userText.slice(0, 40) || 'Neural Mission Alpha',
        messages: [newUserMessage],
        createdAt: new Date(),
        lastModified: new Date(),
        theme: theme
      };
      setSessions([newSession, ...sessions]);
      setCurrentSessionId(sessionId);
    } else {
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: [...s.messages, newUserMessage],
        lastModified: new Date()
      } : s));
    }

    try {
      const chat = model.startChat({
        history: (sessions.find(s => s.id === sessionId)?.messages || []).map(m => ({
          role: m.role,
          parts: [{ text: m.content }]
        }))
      });

      const parts: any[] = [{ text: userText }];
      if (userImg) {
        parts.unshift({
          inlineData: {
            data: userImg.split(',')[1],
            mimeType: "image/jpeg"
          }
        });
      }

      const result = await chat.sendMessageStream(parts);
      let fullResponse = '';
      
      const modelMessage: Message = {
        role: 'model',
        content: '',
        timestamp: new Date()
      };

      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        messages: [...s.messages, modelMessage]
      } : s));

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        setSessions(prev => prev.map(s => s.id === sessionId ? {
          ...s,
          messages: s.messages.map((m, idx) => 
            idx === s.messages.length - 1 ? { ...m, content: fullResponse } : m
          )
        } : s));
      }
    } catch (error) {
      console.error('Gemini Error:', error);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className={`flex h-screen bg-black text-zinc-100 font-sans overflow-hidden ${activeTheme.selection}`}>
      {/* SIDEBAR */}
      <AnimatePresence mode="wait">
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-80 border-r border-zinc-800/50 bg-zinc-950 flex flex-col z-50 relative"
          >
            <div className="p-8 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-950/50 backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl ${activeTheme.bg} flex items-center justify-center shadow-2xl relative group`}>
                  <div className={`absolute inset-0 rounded-xl ${activeTheme.bg} blur-lg opacity-40 group-hover:opacity-100 transition-opacity`} />
                  <Cpu size={20} className="text-white relative z-10" />
                </div>
                <div>
                  <h2 className="font-display font-black tracking-tighter text-xl leading-none">NFS DEV</h2>
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.3em]">Neural Interface</span>
                </div>
              </div>
              <button 
                onClick={() => { setSidebarOpen(false); playSound('CLICK'); }}
                className="p-2 hover:bg-zinc-900 rounded-xl text-zinc-500 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
              <button 
                onClick={() => { setCurrentSessionId(null); playSound('CLICK'); }}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-600 transition-all group relative overflow-hidden`}
              >
                <div className={`absolute inset-0 ${activeTheme.bgLight} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <Plus size={20} className={`${activeTheme.primary} relative z-10`} />
                <span className="text-xs font-black text-zinc-400 group-hover:text-white uppercase tracking-widest relative z-10">New Mission</span>
              </button>

              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] px-2">Mission Logs</h3>
                <div className="space-y-2">
                  {sessions.map(s => (
                    <motion.button
                      layout
                      key={s.id}
                      onClick={() => { setCurrentSessionId(s.id); playSound('CLICK'); }}
                      className={`w-full p-4 rounded-2xl text-left text-sm transition-all flex items-center gap-4 group relative overflow-hidden ${currentSessionId === s.id ? 'bg-zinc-900 border border-zinc-800' : 'hover:bg-zinc-900/50 text-zinc-500'}`}
                    >
                      {currentSessionId === s.id && (
                        <motion.div layoutId="active-pill" className={`absolute left-0 top-0 bottom-0 w-1 ${activeTheme.bg}`} />
                      )}
                      <MessageSquare size={16} className={currentSessionId === s.id ? activeTheme.primary : 'group-hover:text-zinc-300'} />
                      <span className="truncate flex-1 font-medium">{s.title}</span>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessions(prev => prev.filter(ps => ps.id !== s.id));
                          if (currentSessionId === s.id) setCurrentSessionId(null);
                          playSound('DIE');
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-600 hover:text-red-500 transition-all"
                      >
                        <Trash2 size={14} />
                      </button>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800/50 bg-zinc-950/50 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <StatusBadge label="Neural Link" value={`${systemStatus.neuralLink}%`} color="bg-emerald-500" />
                <StatusBadge label="Active Nodes" value={systemStatus.activeNodes} color={activeTheme.bg} />
              </div>
              <button 
                onClick={() => setShowGames(true)}
                className="w-full p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl flex items-center justify-center gap-3 transition-all group"
              >
                <Gamepad2 size={18} className="text-zinc-500 group-hover:text-white" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Neural Arcade</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <main ref={mainRef} className="flex-1 flex flex-col relative overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_center,rgba(24,24,27,0.5)_0%,transparent_100%)]">
        <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-zinc-800/50 px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {!sidebarOpen && (
              <button 
                onClick={() => { setSidebarOpen(true); playSound('CLICK'); }}
                className="p-3 hover:bg-zinc-900 rounded-xl text-zinc-400 transition-all active:scale-90"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="flex flex-col">
              <h1 className="font-display font-black text-xs tracking-[0.3em] uppercase text-zinc-500">Neural Link Established</h1>
              <span className="text-sm font-bold text-zinc-200">{sessions.find(s => s.id === currentSessionId)?.title || 'Neural Mission Alpha'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex bg-zinc-900/50 p-1.5 rounded-2xl border border-zinc-800/50 backdrop-blur-md">
              {(['blue', 'red', 'yellow'] as const).map(t => (
                <button 
                  key={t} 
                  onClick={() => { setTheme(t); playSound('CLICK'); }}
                  className={`w-10 h-10 rounded-xl transition-all flex items-center justify-center relative group ${theme === t ? 'bg-zinc-800 shadow-inner' : 'opacity-30 hover:opacity-100'}`}
                >
                  <Palette size={16} className={t === 'blue' ? 'text-sky-500' : t === 'red' ? 'text-red-500' : 'text-yellow-500'} />
                  {theme === t && (
                    <motion.div layoutId="theme-active" className="absolute -bottom-1 w-1 h-1 rounded-full bg-white" />
                  )}
                </button>
              ))}
            </div>
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-3 hover:bg-zinc-900 rounded-xl text-zinc-400 transition-all"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button className="p-3 hover:bg-zinc-900 rounded-xl text-zinc-400 transition-all">
              <Share2 size={20} />
            </button>
          </div>
        </header>
        <div className="flex-1 max-w-5xl mx-auto w-full p-8 space-y-12">
          {currentSession ? (
            <div className="space-y-12">
              {currentSession.messages.map((m, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i} 
                  className={`flex gap-8 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-2xl relative group ${m.role === 'model' ? activeTheme.bg : 'bg-zinc-800'}`}>
                    <div className={`absolute inset-0 rounded-2xl ${m.role === 'model' ? activeTheme.bg : 'bg-zinc-800'} blur-lg opacity-20 group-hover:opacity-60 transition-opacity`} />
                    {m.role === 'model' ? <Bot size={20} className="text-white relative z-10" /> : <User size={20} className="text-white relative z-10" />}
                  </div>

                  <div className={`flex-1 max-w-[85%] space-y-4`}>
                    <div className={`flex items-center gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[10px] font-black tracking-[0.3em] uppercase text-zinc-600">
                        {m.role === 'model' ? 'Neural Core' : 'Operator'}
                      </span>
                      <span className="text-[9px] font-bold text-zinc-700 tabular-nums">
                        {m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className={`relative p-8 rounded-[2.5rem] border transition-all duration-500 ${m.role === 'user' ? `bg-zinc-900/80 border-zinc-800/50 rounded-tr-none` : `bg-zinc-950/40 border-zinc-800/30 backdrop-blur-sm rounded-tl-none shadow-2xl hover:border-${theme}-500/20`}`}>
                      {m.image && (
                        <motion.div 
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="mb-6 rounded-2xl overflow-hidden border border-zinc-800 shadow-2xl max-w-md group relative"
                        >
                          <img src={m.image} alt="Uploaded" className="w-full h-auto" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button className="p-3 bg-white/10 backdrop-blur-md rounded-xl text-white hover:bg-white/20 transition-all">
                              <Eye size={20} />
                            </button>
                          </div>
                        </motion.div>
                      )}

                      <div className="prose prose-invert max-w-none prose-sm prose-pre:bg-transparent prose-pre:p-0 prose-headings:font-display prose-headings:font-black prose-headings:tracking-tighter prose-headings:text-white prose-a:text-sky-400 prose-strong:text-white prose-code:text-sky-300">
                        <ReactMarkdown 
                          remarkPlugins={[remarkMath]} 
                          rehypePlugins={[rehypeKatex]}
                          components={{
                            code: ({node, inline, className, children, ...props}: any) => {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline ? (
                                <CodeBlock language={match ? match[1] : ''} theme={theme}>{children}</CodeBlock>
                              ) : (
                                <code className="bg-zinc-800/50 px-1.5 py-0.5 rounded-md text-sky-300 font-mono text-xs" {...props}>{children}</code>
                              )
                            }
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>

                      <div className={`absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity`}>
                        <button 
                          onClick={() => { navigator.clipboard.writeText(m.content); playSound('COPY'); }}
                          className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-600 hover:text-zinc-300 transition-all"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-12 py-24">
              <motion.div 
                animate={{ 
                  scale: [1, 1.1, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 4, repeat: Infinity }}
                className={`w-32 h-32 rounded-[2.5rem] ${activeTheme.bg} flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.5)] relative group`}
              >
                <div className={`absolute inset-0 rounded-[2.5rem] ${activeTheme.bg} blur-3xl opacity-20 group-hover:opacity-50 transition-opacity`} />
                <Bot size={64} className="text-white relative z-10" />
              </motion.div>

              <div className="space-y-4">
                <h2 className="text-7xl font-display font-black tracking-tighter striped-blue-text">NFS DEV AI</h2>
                <p className="text-zinc-500 max-w-lg mx-auto leading-relaxed font-medium">
                  Neural Interface v2.5. Initializing mission parameters. 
                  <br />
                  <span className="text-zinc-700 text-xs font-black uppercase tracking-[0.2em]">Next-Gen Developer Edition</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 max-w-2xl w-full">
                {[
                  { icon: <Code size={18}/>, title: "Code Synthesis", desc: "Generate complex neural algorithms" },
                  { icon: <FileText size={18}/>, title: "Data Analysis", desc: "Extract intelligence from encrypted files" },
                  { icon: <Zap size={18}/>, title: "Rapid Prototyping", desc: "Build interfaces at light speed" },
                  { icon: <Shield size={18}/>, title: "Security Audit", desc: "Scan for vulnerabilities in the grid" }
                ].map((f, i) => (
                  <motion.button
                    whileHover={{ scale: 1.02, y: -5 }}
                    key={i}
                    className="p-6 bg-zinc-900/30 border border-zinc-800/50 rounded-3xl text-left group hover:bg-zinc-900/50 transition-all"
                  >
                    <div className={`w-10 h-10 rounded-xl ${activeTheme.bgLight} flex items-center justify-center mb-4 ${activeTheme.primary}`}>
                      {f.icon}
                    </div>
                    <h4 className="font-bold text-white mb-1">{f.title}</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef} className="h-32" />
        </div>
        {/* INPUT AREA */}
        <div className="sticky bottom-0 p-10 bg-gradient-to-t from-black via-black/95 to-transparent backdrop-blur-sm">
          <div className="max-w-5xl mx-auto relative">
            <AnimatePresence>
              {selectedImage && (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  className="absolute bottom-full mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex items-center gap-4"
                >
                  <img src={selectedImage} className="w-20 h-20 object-cover rounded-xl border border-zinc-800" />
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl transition-all"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={sendMessage} className="relative group">
              <div className={`absolute -inset-1 rounded-[3rem] blur-2xl opacity-10 group-focus-within:opacity-30 transition-opacity ${activeTheme.bg}`} />
              <div className="relative bg-zinc-900/80 backdrop-blur-2xl border border-zinc-800/50 rounded-[3rem] p-3 flex items-end gap-3 shadow-2xl">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden" 
                  accept="image/*,.pdf,.docx"
                />
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="p-5 hover:bg-zinc-800 rounded-full text-zinc-500 transition-all active:scale-90"
                >
                  <ImageIcon size={22} />
                </button>
                
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Enter mission parameters..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-5 px-2 max-h-40 resize-none custom-scrollbar font-medium"
                  rows={1}
                />

                <button 
                  type="submit" 
                  disabled={isLoading}
                  className={`p-5 ${activeTheme.bg} text-white rounded-full shadow-2xl transition-all active:scale-90 disabled:opacity-50 relative group/send overflow-hidden`}
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/send:translate-y-0 transition-transform duration-300" />
                  {isLoading ? <Loader2 className="animate-spin relative z-10" size={22}/> : <Send size={22} className="relative z-10"/>}
                </button>
              </div>
            </form>
            
            <div className="mt-4 flex items-center justify-center gap-8 opacity-30">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-zinc-500" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Encrypted Link</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-zinc-500" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Neural Core v2.5</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-zinc-500" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em]">Quantum Safe</span>
              </div>
            </div>
          </div>
        </div>

        {/* SCROLL TOP */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              onClick={() => mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
              className={`fixed bottom-32 right-10 p-4 ${activeTheme.bg} text-white rounded-2xl shadow-2xl z-50 active:scale-90 transition-all`}
            >
              <ChevronUp size={24} />
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      {/* GAME MODAL */}
      <AnimatePresence>
        {showGames && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-8"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-zinc-950 border border-zinc-800 rounded-[3rem] w-full max-w-4xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] relative"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent opacity-20" />
              
              <div className="p-10 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/20">
                <div className="flex items-center gap-6">
                  <div className={`w-14 h-14 rounded-2xl ${activeTheme.bgLight} flex items-center justify-center ${activeTheme.primary}`}>
                    <Gamepad2 size={28} />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-3xl tracking-tighter">NEURAL ARCADE</h3>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-[0.3em]">Subsystem Entertainment</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setShowGames(false); setActiveGame(null); playSound('DIE'); }}
                  className="p-4 hover:bg-zinc-900 rounded-2xl text-zinc-500 hover:text-white transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-12">
                {!activeGame ? (
                  <div className="grid grid-cols-3 gap-8">
                    {[
                      { id: 'Snake', icon: <Cpu />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                      { id: 'TicTacToe', icon: <Grid />, color: 'text-sky-500', bg: 'bg-sky-500/10' },
                      { id: 'FlappyBird', icon: <Zap />, color: 'text-orange-500', bg: 'bg-orange-500/10' }
                    ].map(g => (
                      <motion.button
                        whileHover={{ y: -10, scale: 1.02 }}
                        key={g.id}
                        onClick={() => { setActiveGame(g.id); playSound('CLICK'); }}
                        className="p-10 bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] hover:border-white/20 transition-all text-center group relative overflow-hidden"
                      >
                        <div className={`absolute inset-0 ${g.bg} opacity-0 group-hover:opacity-100 transition-opacity`} />
                        <div className={`w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform ${g.color}`}>
                          <Gamepad2 size={32} />
                        </div>
                        <span className="font-display font-black text-lg tracking-widest uppercase text-zinc-400 group-hover:text-white transition-colors">{g.id}</span>
                      </motion.button>
                    ))}
                  </div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center"
                  >
                    <div className="p-8 bg-black rounded-[2rem] border border-zinc-800 shadow-2xl">
                      {activeGame === 'Snake' && <SnakeGame />}
                      {activeGame === 'TicTacToe' && <TicTacToeGame />}
                      {activeGame === 'FlappyBird' && <FlappyBirdGame />}
                    </div>
                    <button 
                      onClick={() => { setActiveGame(null); playSound('CLICK'); }}
                      className="mt-10 px-8 py-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all border border-zinc-800"
                    >
                      Back to Arcade Menu
                    </button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Dummy components for icons that might be missing in lucide
const Grid = ({ size = 20, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);
