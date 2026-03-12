import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Send, Bot, User, Sparkles, Trash2, Square, Copy, Check, Plus, 
  Image as ImageIcon, X, Loader2, Palette, Download, FileText, 
  Menu, MessageSquare, Gamepad2, ChevronUp, Eye, Code, Monitor,
  Settings, Share2, Volume2, VolumeX, Maximize2, Minimize2,
  Clock, Zap, Shield, Cpu, Terminal, Database, Globe
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

// --- TYPES ---
interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  image?: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// CodeBlock Component untuk tampilan kode yang mewah
const CodeBlock = ({ children, language }: any) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    const text = String(children).replace(/\n$/, '');
    await navigator.clipboard.writeText(text);
    soundService.play('COPY');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-6 rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950/50 shadow-2xl">
      <div className="flex items-center justify-between px-5 py-3 bg-zinc-900/80 border-b border-zinc-800">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{language || 'code'}</span>
        <button onClick={handleCopy} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-all">
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="p-5 overflow-x-auto custom-scrollbar text-sm font-mono leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
};
export default function App() {
  const [input, setInput] = useState('');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'blue' | 'red' | 'yellow'>('blue');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showGames, setShowGames] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiRef = useRef<any>(null);
  const chatRef = useRef<any>(null);
  const mainRef = useRef<HTMLElement>(null);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  // --- THEME HELPERS ---
  const getThemeColor = (type: 'bg' | 'text' | 'border') => {
    const colors = {
      blue: { bg: 'bg-sky-500', text: 'text-sky-500', border: 'border-sky-500' },
      red: { bg: 'bg-red-500', text: 'text-red-500', border: 'border-red-500' },
      yellow: { bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' }
    };
    return colors[theme][type];
  };

  // --- INITIALIZE AI (SAFE VERSION - ANTI BLACKSCREEN) ---
  useEffect(() => {
    const initAI = () => {
      // Pengecekan aman agar tidak blackscreen saat dijalankan di browser/Vercel
      const apiKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
      
      if (apiKey) {
        try {
          const ai = new GoogleGenAI(apiKey);
          aiRef.current = ai;
          const model = ai.getGenerativeModel({ 
            model: "gemini-2.0-flash",
            systemInstruction: `Your name is NFS DEV, created by Nell 56 Developer.
            You are a high-end neural interface AI. Be helpful, concise, and professional.`
          });
          chatRef.current = model.startChat({ history: [] });
        } catch (e) {
          console.error("AI Initialization Error:", e);
        }
      }
    };
    initAI();
  }, []);

  // Auto-scroll ke bawah saat ada pesan baru
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions]);
  // --- FILE PROCESSING ---
  const handleFileUpload = async (file: File) => {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setSelectedImage(e.target?.result as string);
      reader.readAsDataURL(file);
    } else if (file.name.endsWith('.pdf')) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(' ') + '\n';
        }
        setInput(prev => prev + `\n[PDF Content: ${file.name}]\n${text}\n`);
      } catch (err) {
        console.error("PDF Error:", err);
      }
    }
    setShowPlusMenu(false);
  };

  // --- SEND MESSAGE LOGIC ---
  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    // Ambil API Key secara aman
    const apiKey = typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : undefined;
    if (!apiKey) {
      alert("API Key belum terpasang! Pastikan GEMINI_API_KEY sudah diisi di Vercel Settings.");
      return;
    }

    soundService.play('SEND');
    const userMsg: Message = { 
      role: 'user', 
      content: input, 
      timestamp: new Date(), 
      image: selectedImage || undefined 
    };
    
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      setSessions([{ 
        id: sessionId, 
        title: input.slice(0, 30) || 'New Mission', 
        messages: [userMsg], 
        createdAt: new Date() 
      }, ...sessions]);
      setActiveSessionId(sessionId);
    } else {
      setSessions(sessions.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, userMsg] } : s));
    }

    const currentInput = input;
    const currentImg = selectedImage;
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI(apiKey);
      }
      const model = aiRef.current.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const parts: any[] = [{ text: currentInput }];
      if (currentImg) {
        parts.push({ 
          inlineData: { 
            data: currentImg.split(',')[1], 
            mimeType: "image/jpeg" 
          } 
        });
      }

      const result = await model.generateContentStream(parts);
      let fullText = '';
      const modelMsg: Message = { role: 'model', content: '', timestamp: new Date() };
      
      // Tambahkan pesan kosong untuk model (AI) yang akan diisi secara streaming
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, modelMsg] } : s));

      for await (const chunk of result.stream) {
        fullText += chunk.text();
        setSessions(prev => prev.map(s => s.id === sessionId ? {
          ...s,
          messages: s.messages.map((m, idx) => idx === s.messages.length - 1 ? { ...m, content: fullText } : m)
        } : s));
      }
    } catch (err) {
      console.error("Chat Error:", err);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="flex h-screen bg-black text-zinc-100 overflow-hidden font-sans">
      {/* --- SIDEBAR (HISTORY) --- */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -300 }} 
            animate={{ x: 0 }} 
            exit={{ x: -300 }} 
            className="w-72 border-r border-zinc-800 bg-zinc-950 flex flex-col z-50"
          >
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${getThemeColor('bg')} flex items-center justify-center shadow-lg`}>
                  <Monitor size={18} className="text-white" />
                </div>
                <span className="font-bold text-lg tracking-tighter">NFS DEV</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-500 transition-all">
                <X size={18}/>
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
              <button 
                onClick={() => setActiveSessionId(null)} 
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-600 transition-all mb-4 group"
              >
                <Plus size={18} className={getThemeColor('text')} />
                <span className="text-sm font-bold text-zinc-400 group-hover:text-white transition-colors">NEW MISSION</span>
              </button>
              
              <div className="space-y-1">
                {sessions.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => setActiveSessionId(s.id)} 
                    className={`w-full p-3 rounded-xl text-left text-sm transition-all flex items-center gap-3 ${activeSessionId === s.id ? 'bg-zinc-900 border border-zinc-800 shadow-inner' : 'hover:bg-zinc-900/50 text-zinc-500'}`}
                  >
                    <MessageSquare size={14} />
                    <span className="truncate flex-1">{s.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* --- MAIN INTERFACE --- */}
      <main ref={mainRef} className="flex-1 flex flex-col relative bg-[radial-gradient(circle_at_center,rgba(24,24,27,0.5)_0%,transparent_100%)]">
        {/* HEADER */}
        <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-zinc-900 rounded-lg transition-all">
                <Menu size={20}/>
              </button>
            )}
            <h1 className="font-bold text-xs tracking-[0.3em] uppercase text-zinc-500">Neural Interface v2.5</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowGames(true)} 
              className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400 transition-all"
            >
              <Gamepad2 size={20}/>
            </button>
            
            <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              {(['blue', 'red', 'yellow'] as const).map(t => (
                <button 
                  key={t} 
                  onClick={() => setTheme(t)} 
                  className={`w-8 h-8 rounded-lg transition-all flex items-center justify-center ${theme === t ? 'bg-zinc-800 shadow-inner' : 'opacity-30 hover:opacity-100'}`}
                >
                  <div className={`w-3 h-3 rounded-full ${t === 'blue' ? 'bg-sky-500' : t === 'red' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                </button>
              ))}
            </div>
          </div>
        </header>
        {/* --- CHAT VIEWPORT --- */}
        <div className="flex-1 max-w-4xl mx-auto w-full p-6 overflow-y-auto custom-scrollbar">
          {activeSession ? (
            <div className="space-y-8">
              {activeSession.messages.map((m, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  key={i} 
                  className={`flex gap-6 ${m.role === 'user' ? 'justify-end' : ''}`}
                >
                  <div className={`flex-1 max-w-[85%] p-6 rounded-3xl border ${m.role === 'user' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950/50 border-zinc-800 shadow-2xl'}`}>
                    <div className="flex items-center gap-3 mb-4 opacity-50 text-[10px] font-bold uppercase tracking-widest">
                      {m.role === 'model' ? <Bot size={14} className={getThemeColor('text')} /> : <User size={14} />}
                      {m.role === 'model' ? 'Neural Core' : 'Operator'}
                    </div>
                    
                    {m.image && (
                      <img 
                        src={m.image} 
                        alt="Uploaded content" 
                        className="max-w-xs rounded-xl mb-4 border border-zinc-800 shadow-lg" 
                        referrerPolicy="no-referrer"
                      />
                    )}
                    
                    <div className="prose prose-invert max-w-none prose-sm prose-pre:bg-transparent prose-pre:p-0">
                      <ReactMarkdown 
                        components={{ code: CodeBlock }} 
                        remarkPlugins={[remarkMath]} 
                        rehypePlugins={[rehypeKatex]}
                      >
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            /* WELCOME SCREEN */
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 py-20">
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }} 
                transition={{ duration: 3, repeat: Infinity }} 
                className={`w-24 h-24 rounded-3xl ${getThemeColor('bg')} flex items-center justify-center shadow-2xl`}
              >
                <Bot size={48} className="text-white" />
              </motion.div>
              <div className="space-y-4">
                <h2 className="text-5xl font-black tracking-tighter striped-blue-text">NFS DEV AI</h2>
                <p className="text-zinc-500 max-w-md mx-auto leading-relaxed">
                  Neural Interface v2.5. Initializing mission parameters. 
                  Upload files or start a conversation with the core.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-lg">
                {['Build a Website', 'Write Code', 'Analyze Data', 'Security Audit'].map(f => (
                  <button 
                    key={f} 
                    onClick={() => setInput(f)} 
                    className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:border-zinc-600 transition-all text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={chatEndRef} className="h-10" />
        </div>

        {/* --- INPUT BAR --- */}
        <div className="p-6 bg-gradient-to-t from-black via-black/95 to-transparent">
          <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative group">
            <div className={`absolute -inset-1 rounded-[2rem] blur-2xl opacity-10 group-focus-within:opacity-30 transition-opacity ${getThemeColor('bg')}`} />
            <div className="relative bg-zinc-900/80 backdrop-blur-2xl border border-zinc-800/50 rounded-[2rem] p-2 flex items-center gap-2 shadow-2xl">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} 
                className="hidden" 
                accept="image/*,.pdf"
              />
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className="p-4 hover:bg-zinc-800 rounded-full text-zinc-500 transition-all"
              >
                <ImageIcon size={20}/>
              </button>
              
              <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Enter mission parameters..." 
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-4 px-2 font-medium" 
              />
              
              <button 
                type="submit" 
                disabled={isLoading} 
                className={`p-4 ${getThemeColor('bg')} text-white rounded-full shadow-2xl transition-all active:scale-90 disabled:opacity-50`}
              >
                {isLoading ? <Loader2 className="animate-spin" size={20}/> : <Send size={20}/>}
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* --- NEURAL ARCADE (GAME MODAL) --- */}
      <AnimatePresence>
        {showGames && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Gamepad2 className={getThemeColor('text')} />
                  <h3 className="font-bold text-xl tracking-tighter">NEURAL ARCADE</h3>
                </div>
                <button 
                  onClick={() => {setShowGames(false); setActiveGame(null);}} 
                  className="p-2 hover:bg-zinc-900 rounded-lg transition-all"
                >
                  <X size={20}/>
                </button>
              </div>
              
              <div className="p-8">
                {!activeGame ? (
                  <div className="grid grid-cols-3 gap-6">
                    {['Snake', 'TicTacToe', 'FlappyBird'].map(g => (
                      <button 
                        key={g} 
                        onClick={() => setActiveGame(g)} 
                        className="p-8 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-sky-500/50 transition-all text-center group"
                      >
                        <Bot className="mx-auto mb-4 text-zinc-500 group-hover:text-sky-400 transition-colors" size={32} />
                        <span className="font-bold text-xs tracking-widest uppercase block">{g}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="bg-black rounded-2xl border border-zinc-800 p-4 shadow-inner">
                      {activeGame === 'Snake' && <SnakeGame />}
                      {activeGame === 'TicTacToe' && <TicTacToeGame />}
                      {activeGame === 'FlappyBird' && <FlappyBirdGame />}
                    </div>
                    <button 
                      onClick={() => setActiveGame(null)} 
                      className="mt-8 text-xs font-bold text-zinc-500 hover:text-white uppercase tracking-[0.2em] transition-colors"
                    >
                      ← Back to Neural Arcade
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
                                           }
