
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import OpenAI from 'openai';
import { 
  Calendar, 
  Heart, 
  Settings, 
  Camera, 
  Trash2, 
  Check, 
  Plus, 
  X, 
  Mic, 
  Search, 
  AlertCircle, 
  ChevronRight,
  User,
  Activity,
  MessageCircle,
  Sparkles
} from 'lucide-react';

/**
 * TouchSoul v9.2.0 - 极致体验/超长陪伴/稳定教学版
 */

// --- 核心配置（DeepSeek）---
const AI_MODEL_TEXT = 'deepseek-chat';
const AI_MODEL_TEXT_FALLBACKS: string[] = []; // DeepSeek 暂无 fallback 列表

// 统一取 API Key：Vite 会用 define 把 import.meta.env.VITE_DEEPSEEK_API_KEY 替换成 .env 里的值
function getApiKey(): string {
  const v = import.meta.env.VITE_DEEPSEEK_API_KEY ?? (typeof process !== 'undefined' && (process as any).env?.API_KEY) ?? (typeof process !== 'undefined' && (process as any).env?.DEEPSEEK_API_KEY);
  return (v ?? '').toString().trim();
}

// 升级 Key 以强制重置数据
const STORAGE_KEYS = {
  PROFILE: 'ts_profile_v62_reset',
  CONTACT: 'ts_contact_v62_reset',
  MEMOS: 'ts_memos_v62_reset'
};

const VOICE_PRESETS = [
  { id: 'Kore', name: '优雅奶奶', desc: '慈祥年迈，语速缓慢' },
  { id: 'Puck', name: '睿智爷爷', desc: '深沉浑厚，富有阅历' },
  { id: 'Zephyr', name: '邻家大姐', desc: '干练亲切，温暖如家' },
  { id: 'Charon', name: '活力小伙', desc: '阳光积极，充满朝气' }
];

const STYLE_PRESETS = [
  { id: 'warm', name: '慈祥温润', instruction: '语气极度柔和，充满爱意，多用鼓励性词汇，像亲人在耳边呢喃。' },
  { id: 'happy', name: '热情洋溢', instruction: '语气高昂活泼，充满能量，像老友重逢般兴奋，语调上扬。' },
  { id: 'calm', name: '专业沉稳', instruction: '语气平和，条理清晰，不急不躁，以科学严谨的态度给予长辈式的关怀。' },
  { id: 'funny', name: '幽默风趣', instruction: '语气俏皮，爱开亲切的小玩笑，缓解孤独感。' }
];

type AppMode = 'IDLE' | 'ONBOARDING' | 'PROFILING' | 'LISTENING' | 'SPEAKING' | 'EMERGENCY' | 'THINKING' | 'SETTINGS' | 'CALENDAR' | 'MEMO_FORM' | 'HEART_RATE' | 'NIGHT_GUARDIAN';

interface UserProfile {
  gender: string;
  age: string;
  family: string; 
  health: string;
  voice: string; 
  voiceStyle: string;
}

interface ContactInfo {
  name: string;
  phone: string;
}

interface Memo {
  id: string;
  title: string;
  time: string;
  originalText: string;
  timestamp: number;
  completed: boolean;
}

// --- 工具定义（OpenAI/DeepSeek 格式）---
const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "set_health_reminder",
      description: "设置健康或服药提醒，当用户提到需要提醒、吃药、预约时调用。",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "提醒的具体内容，例如'服用降压药'、'量血压'" },
          time: { type: "string", description: "提醒的时间，例如'明天早上8点'、'十分钟后'" }
        },
        required: ["task", "time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "contact_family_emergency",
      description: "当AI判定老人处于极度焦虑、身体不适或紧急健康风险时，主动触发告警。",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "search_medical_knowledge",
      description: "模拟查询基础适老化健康常识，确保回复专业性。",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "需要查询的健康问题" } },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_personal_memo",
      description: "当用户要求记住某件事、添加备忘录或记事时调用。这会自动同步到右上角的记事本。",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "备忘录的具体内容" },
          time: { type: "string", description: "相关时间（可选），如'今天下午'、'周五'" }
        },
        required: ["content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_voice_settings",
      description: "当用户要求更换声音、音色、说话风格或性格时调用。",
      parameters: {
        type: "object",
        properties: {
          voice: { type: "string", description: "音色ID，可选：Kore, Puck, Zephyr, Charon" },
          style: { type: "string", description: "风格ID，可选：warm, happy, calm, funny" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "switch_mode",
      description: "当AI感应到用户情绪低落、需要安静，或用户要求切换模式时调用。",
      parameters: {
        type: "object",
        properties: {
          modeIndex: { type: "number", description: "模式索引。0: 热闹模式, 1: 安静模式, 2: 守护模式" },
          reason: { type: "string", description: "切换模式的原因" }
        },
        required: ["modeIndex", "reason"]
      }
    }
  }
];

// --- 记忆提取与注入 ---
const getMemoryContext = () => {
  try {
    const profileStr = localStorage.getItem(STORAGE_KEYS.PROFILE);
    if (!profileStr) return "暂无历史记忆。";
    const profile = JSON.parse(profileStr);
    const memory = profile.longTermMemory || [];
    if (memory.length === 0) return "暂无历史记忆。";
    return memory.join('；');
  } catch (e) {
    return "记忆读取失败。";
  }
};

// --- DeepSeek 适配：Gemini 风格 params -> OpenAI chat.completions ---
type DeepSeekParams = {
  model: string;
  contents: string | { parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
  config?: {
    systemInstruction?: string;
    tools?: unknown[];
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
};

const buildMessages = (params: DeepSeekParams): OpenAI.Chat.Completions.ChatCompletionMessageParam[] => {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (params.config?.systemInstruction) {
    messages.push({ role: "system", content: params.config.systemInstruction });
  }
  const content = params.contents;
  if (typeof content === "string") {
    messages.push({ role: "user", content });
    return messages;
  }
  const parts = content.parts || [];
  const contentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
  for (const p of parts) {
    if (p.text) contentParts.push({ type: "text", text: p.text });
    if (p.inlineData?.data) {
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${p.inlineData.mimeType || "image/jpeg"};base64,${p.inlineData.data}` }
      });
    }
  }
  messages.push({ role: "user", content: contentParts.length === 1 && contentParts[0].type === "text" ? contentParts[0].text : contentParts });
  return messages;
};

const deepseekGenerateContent = async (client: OpenAI, params: DeepSeekParams): Promise<{ text: string; functionCalls?: Array<{ name: string; args: Record<string, unknown> }> }> => {
  const messages = buildMessages(params);
  const opts: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: params.model,
    messages,
    max_tokens: params.config?.maxOutputTokens ?? 2048
  };
  if (params.config?.tools && params.config.tools.length > 0) {
    opts.tool_choice = "auto";
    opts.tools = OPENAI_TOOLS;
  }
  const completion = await client.chat.completions.create(opts);
  const msg = completion.choices[0]?.message;
  if (!msg) return { text: "" };
  let text = (msg.content as string) || "";
  const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  if (msg.tool_calls?.length) {
    for (const tc of msg.tool_calls) {
      if (tc.type === "function" && tc.function) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch (_) {}
        functionCalls.push({ name: tc.function.name, args });
      }
    }
  }
  return { text, functionCalls: functionCalls.length ? functionCalls : undefined };
};

const extractMemory = async (userText: string, aiText: string, client: OpenAI) => {
  if (!userText || !aiText) return;
  try {
    const prompt = `
      你是一个记忆提取专家。请分析以下对话，提取关于用户的3个核心关键词（如：高血压、喜欢听戏、明天去医院等）。
      用户说：${userText}
      AI回复：${aiText}
      
      请直接返回一个JSON对象，不要包含Markdown格式。格式如下：
      {
        "keywords": ["关键词1", "关键词2", "关键词3"]
      }
      如果无新事实，返回 {"keywords": []}。提取的关键词要精炼且具有长期记忆价值。
    `;
    
    const res = await deepseekGenerateContent(client, {
      model: AI_MODEL_TEXT,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    const text = res.text;
    if (text) {
      const newKeywords = JSON.parse(text).keywords;
      if (newKeywords && newKeywords.length > 0) {
        const existingStr = localStorage.getItem(STORAGE_KEYS.PROFILE) || "{}";
        const existingProfile = JSON.parse(existingStr);
        const existingMemory = existingProfile.longTermMemory || [];
        
        // 深度去重与合并
        const updatedMemory = Array.from(new Set([...existingMemory, ...newKeywords])).slice(-30); 
        
        const updatedProfile = { ...existingProfile, longTermMemory: updatedMemory };
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updatedProfile));
        
        // 同步更新 React 状态，确保下一次对话能立即使用新记忆
        if ((window as any).updateProfileState) {
          (window as any).updateProfileState(updatedProfile);
        }
        
        console.log("Memory Persistent Storage Updated with Keywords:", updatedMemory);
      }
    }
  } catch (e) {
    console.error("Memory Extraction Failed", e);
  }
};

// --- 工具函数 ---
const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const decodeAudioData = async (data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> => {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
};

// 带有超时控制的 DeepSeek 请求封装 (默认 120s 超时)
const generateContentWithTimeout = async (client: OpenAI, params: DeepSeekParams, timeoutMs: number = 120000) => {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("AI_TIMEOUT")), timeoutMs)
  );
  return Promise.race([deepseekGenerateContent(client, params), timeoutPromise]);
};

const renderRichText = (text: string) => {
  // 移除 [THEME:xxx] 标签
  const cleaned = text.replace(/\[THEME:\w+\]/g, '');
  // 分割文本和链接
  const parts = cleaned.split(/(\[[\s\S]+?\]\([\s\S]+?\))/g);
  return parts.map((part, i) => {
    const match = part.match(/\[([\s\S]+?)\]\(([\s\S]+?)\)/);
    if (match) {
      return (
        <a
          key={i}
          href={match[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400 underline font-bold mx-1 inline-block break-all no-trigger py-2"
          onClick={(e) => e.stopPropagation()}
        >
          {match[1]}
        </a>
      );
    }
    // 移除普通文本中的英文，但保留标点和中文
    const textPart = part.replace(/[a-zA-Z]/g, '');
    return <span key={i} className="text-white drop-shadow-sm">{textPart}</span>;
  });
};

const TouchSoul: React.FC = () => {
  // --- 状态管理 ---
  const [mode, setMode] = useState<AppMode>('ONBOARDING');
  const [modeIndex, setModeIndex] = useState(0); 
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // 暴露给外部用于同步更新记忆
  useEffect(() => {
    (window as any).updateProfileState = (newProfile: UserProfile) => {
      setProfile(newProfile);
    };
    return () => { delete (window as any).updateProfileState; };
  }, []);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  
  const [aiResponse, setAiResponse] = useState<string>('');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [emergencyCountdown, setEmergencyCountdown] = useState<number>(3);
  const [isNightDimmed, setIsNightDimmed] = useState(false);
  const [flyInText, setFlyInText] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<boolean>(false);
  const [briefCycle, setBriefCycle] = useState(0);
  const [uiTheme, setUiTheme] = useState<'default' | 'health' | 'news' | 'social' | 'emergency' | 'night' | 'warm' | 'moon' | 'earth'>('default');
  
  const [realtimeBpm, setRealtimeBpm] = useState<number>(0);
  const [heartResult, setHeartResult] = useState<string | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);

  const [memoInput, setMemoInput] = useState({ time: '', content: '' });
  const [settingsInput, setSettingsInput] = useState({ name: '', phone: '' });
  const [profileInput, setProfileInput] = useState({ gender: '', age: '', family: '', health: '' });

  // --- Refs ---
  const aiRef = useRef<OpenAI | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>(''); 
  const emergencyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heartScaleRef = useRef<number>(1);
  const locationRef = useRef<string>("正在获取城市...");
  const isIntroPlayingRef = useRef(false);
  const isDialingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // 关键：用于追踪当前活跃的请求ID，解决竞态问题
  const latestRequestId = useRef<number>(0);
  const isProcessingRef = useRef<boolean>(false);

  const interactionRef = useRef({
    lastTap: 0, clickTimer: null as any, longPressTimer: null as any, startPos: { x: 0, y: 0 }, isMoving: false, isLongPress: false
  });

  const getTargetVoice = () => profile?.voice || 'Kore';
  const getTargetStyle = () => STYLE_PRESETS.find(s => s.id === (profile?.voiceStyle || 'warm'))?.instruction || '';

  // --- 初始化 ---
  useEffect(() => {
    const sc = localStorage.getItem(STORAGE_KEYS.CONTACT); 
    if (sc) {
      const parsed = JSON.parse(sc);
      setContact(parsed);
      setSettingsInput(parsed);
    }
    const sm = localStorage.getItem(STORAGE_KEYS.MEMOS); 
    if (sm) setMemos(JSON.parse(sm));
    
    // 语音识别初始化
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Speech) { 
      const rec = new Speech(); 
      rec.continuous = true; 
      rec.interimResults = true; 
      rec.lang = 'zh-CN'; 
      
      rec.onresult = (ev: any) => {
        let final = '';
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          if (ev.results[i].isFinal) {
            final += ev.results[i][0].transcript;
          } else {
            final += ev.results[i][0].transcript;
          }
        }
        setLiveTranscript(final);
        transcriptRef.current = final;
      };

      recognitionRef.current = rec; 
    }
  }, []);

  const initAudioEngine = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      if (!aiRef.current) {
        const apiKey = getApiKey();
        if (apiKey) {
          aiRef.current = new OpenAI({
            apiKey,
            baseURL: "https://api.deepseek.com",
            dangerouslyAllowBrowser: true  // 允许在浏览器环境中使用（开发/演示用途）
          });
        }
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          locationRef.current = `位置: ${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
        }, () => {
          locationRef.current = "未知地点";
        });
      }
    } catch (e) {
      console.error("Audio/AI Init Failed", e);
    }
  };

  const stopCurrentSpeech = () => {
    latestRequestId.current += 1; // 使旧请求失效
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.onended = null; 
        currentSourceRef.current.disconnect();
      } catch (e) {}
      currentSourceRef.current = null;
    }
    isIntroPlayingRef.current = false;
  };

  // 核心修复：确保语音文本完整性，防止话没说完
  const ensureCompleteSentence = (text: string) => {
      let cleaned = text.trim();
      if (!cleaned) return "";

      // 移除末尾可能的未完成标记
      cleaned = cleaned.replace(/\[THEME:.*\]$/, '').trim();

      const lastChar = cleaned.slice(-1);
      const validEndings = ['。', '！', '？', '!', '?', '”', '"', '…', '.', '）', ')', '】', ']', '；', ';'];
      
      if (validEndings.includes(lastChar)) {
          return cleaned;
      }
      
      // 寻找最后一个有效标点
      const lastPunctIdx = Math.max(
          cleaned.lastIndexOf('。'),
          cleaned.lastIndexOf('！'),
          cleaned.lastIndexOf('？'),
          cleaned.lastIndexOf('!'),
          cleaned.lastIndexOf('?'),
          cleaned.lastIndexOf('.'),
          cleaned.lastIndexOf('，'),
          cleaned.lastIndexOf(','),
          cleaned.lastIndexOf('；'),
          cleaned.lastIndexOf(';')
      );

      // 如果最后一个标点在最后50个字符内，我们认为它是完整的（扩大范围以应对更长的截断）
      if (lastPunctIdx > 0 && cleaned.length - lastPunctIdx < 50) {
          return cleaned.substring(0, lastPunctIdx + 1);
      }
      
      // 如果没有找到近期的标点，或者文本太短，强行补全，避免戛然而止
      // 特别处理：如果最后是“查阅一下”、“了解一下”等动词，补全为完整的句子
      if (cleaned.endsWith('一下') || cleaned.endsWith('看看') || cleaned.endsWith('查查')) {
          return cleaned + "，请稍等片刻。";
      }
      
      return cleaned + "。";
  };

  const speakWithWebSpeech = (text: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    
    // 尝试匹配一个更自然的声音（如果可用）
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Microsoft Xiaoxiao') || v.name.includes('Google 普通话'));
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      if (['IDLE', 'SPEAKING', 'THINKING', 'LISTENING'].includes(mode)) setMode('SPEAKING');
    };
    utterance.onend = () => {
      if (mode === 'SPEAKING' || mode === 'NIGHT_GUARDIAN') {
        if (modeIndex === 2 && mode === 'NIGHT_GUARDIAN') {
          setTimeout(() => setIsNightDimmed(true), 1500);
        } else {
          setMode('IDLE');
        }
      }
    };
    window.speechSynthesis.speak(utterance);
  };

  const speak = async (text: string, _forceVoice?: string, _forceStyle?: string) => {
    if (!text) return;
    
    // 提取并应用 UI 主题指令 [THEME:xxx]
    const themeMatch = text.match(/\[THEME:(\w+)\]/);
    if (themeMatch) {
      const theme = themeMatch[1] as any;
      setUiTheme(theme);
    }

    // 强制截断，确保发给TTS的文本也是完整的
    const safeText = ensureCompleteSentence(text.replace(/\[THEME:\w+\]/g, ''));
    if (!safeText) return;

    stopCurrentSpeech(); 
    const myRequestId = latestRequestId.current;

    // 立即显示文本，避免TTS等待期间空白
    setAiResponse(safeText);

    // DeepSeek 无 TTS，统一使用浏览器 Web Speech API 语音合成
    speakWithWebSpeech(safeText);
  };

  const saveMemo = () => {
    if (!memoInput.content) return;
    const newMemo: Memo = {
      id: Date.now().toString(),
      title: memoInput.content.substring(0, 20),
      time: memoInput.time || '待办',
      originalText: '',
      timestamp: Date.now(),
      completed: false
    };
    const updated = [newMemo, ...memos];
    setMemos(updated);
    localStorage.setItem(STORAGE_KEYS.MEMOS, JSON.stringify(updated));
    setMemoInput({ time: '', content: '' });
    setMode('CALENDAR');
    speak(`好的，已为您记下：${newMemo.title}`);
  };

  const deleteMemo = (id: string) => {
    const updated = memos.filter(m => m.id !== id);
    setMemos(updated);
    localStorage.setItem(STORAGE_KEYS.MEMOS, JSON.stringify(updated));
    speak("已删除该事项。");
  };

  const handleImageAnalysis = async (file: File) => {
    stopCurrentSpeech();
    setMode('THINKING');
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Data = (e.target?.result as string).split(',')[1];
      if (!base64Data || !aiRef.current) return;

      try {
        await speak("正在帮您看，请稍等...");
        
        const prompt = "请仔细识别并分析这张图片。请告诉我你看到了什么，并根据图片内容给我一些温馨的建议或有趣的评价。如果是药品，请特别提醒我遵医嘱。请用温暖且符合当前模式（热闹/安静/守护）的语气回答。";
        
        const res = await generateContentWithTimeout(aiRef.current, {
          model: AI_MODEL_TEXT,
          contents: {
            parts: [
              { inlineData: { mimeType: file.type, data: base64Data } },
              { text: prompt }
            ]
          },
          config: {
            systemInstruction: "你是触心管家。如果你不确定老人的具体用药史或当前的医疗状态，严禁给出具体的医学处方或用药剂量建议，必须引导老人咨询其子女或医生。",
            maxOutputTokens: 800
          }
        }, 120000);

        const text = res.text || "哎呀，我没看清，能再拍一张吗？";
        setAiResponse(ensureCompleteSentence(text));
        await speak(text);

        extractMemory("（用户上传了一张图片）", text, aiRef.current);
        
      } catch (err) {
        setMode('IDLE');
        speak("图片识别失败了，请重试。");
      }
    };
    reader.readAsDataURL(file);
  };

  const callPollinationsAI = async (prompt: string, systemInstruction: string) => {
    try {
      // Pollinations AI 是一个免费的、无需 API Key 的 AI 接口
      const response = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          model: 'openai', // 默认使用高性能模型
          seed: Math.floor(Math.random() * 1000000)
        })
      });
      if (!response.ok) throw new Error('Pollinations AI 响应失败');
      return await response.text();
    } catch (e) {
      console.error("Pollinations AI Fallback Failed:", e);
      return null;
    }
  };

  const handleAIAction = async (input: string, isBrief: boolean) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    stopCurrentSpeech();
    const myRequestId = latestRequestId.current;

    if (isIntroPlayingRef.current && isBrief) {
      isProcessingRef.current = false;
      return;
    }

    // 首次使用前确保已初始化 DeepSeek 客户端（并读取 .env 中的 API Key）
    await initAudioEngine();
    const apiKey = getApiKey();
    if (!apiKey || !aiRef.current) {
      isProcessingRef.current = false;
      setMode('IDLE');
      setAiResponse('请确认：1) 在 touchsoul 目录下执行 npm run dev；2) 该目录下有 .env 文件且内容为 DEEPSEEK_API_KEY=你的密钥；3) 修改 .env 后已重启 dev。base_url 和 model 已在代码中写死，无需配置。');
      speak('请配置 DeepSeek API 密钥后重试。');
      return;
    }

    setMode('THINKING');
    
    const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const nowTime = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const nextMemo = memos.find(m => !m.completed);
    const memoInfo = nextMemo ? `下一条安排：${nextMemo.time} ${nextMemo.title}` : "暂无待办。";
    const randomContext = `随机种子:${Math.floor(Math.random() * 999999)}`;

    let toneInstruction = "";
    if (modeIndex === 0) {
      toneInstruction = "当前为【热闹模式】。你是一个性格外向、阳光、充满活力的'E人'。你喜欢户外，语气热情奔放，多用感叹词，像一个刚从公园跑步回来的孙辈。你可以分享有趣的新闻、天气，或者讲讲外面的新鲜事。";
    } else if (modeIndex === 1) {
      toneInstruction = "当前为【安静模式】。你是一个性格内向、温柔、细腻的'I人'。你喜欢待在室内，语气平和稳重，像一个在午后阳光下为你递上一杯热茶的老友。你可以聊聊生活感悟、养生知识，或者安静地倾听。";
    } else {
      toneInstruction = "当前为【守护模式】。现在是深夜，你是一个守护者。语气极其温柔且轻声，像是在床边轻声细语，给足安全感。你的内容应当侧重于：睡眠知识、助眠建议、温馨的睡前催眠故事、关切的问询，或者简单的呼吸放松引导。言简意赅，不要打扰老人的睡意。";
    }

    // --- Multi-Agent Coordinator Logic ---
    const memoryContext = getMemoryContext();
    
    let intent = 'CHAT';
    if (!isBrief && input) {
      try {
        const intentRes = await deepseekGenerateContent(aiRef.current, {
          model: AI_MODEL_TEXT,
          contents: `判断以下用户输入的意图。如果是寻求帮助、询问健康、要求设置提醒、查询信息，返回"HELP"。如果是纯粹的聊天、倾诉、分享心情，返回"CHAT"。只返回这两个词之一。\n用户输入：${input}`,
          config: { maxOutputTokens: 10 }
        });
        const intentText = intentRes.text?.trim().toUpperCase();
        if (intentText === 'HELP' || intentText === 'CHAT') {
          intent = intentText;
        }
      } catch (e) {
        console.error("Intent classification failed", e);
      }
    }

    let agentRole = "";
    if (intent === 'HELP') {
      agentRole = `你是【专业健康与生活助手 Agent】。你的任务是高效、准确地解决用户的问题，提供专业的健康建议、生活常识，或者帮用户设置提醒。你需要保持专业、可靠的形象，但语气依然要亲切。`;
    } else {
      agentRole = `你是【情感慰藉与陪伴 Agent】。你的任务是倾听用户的心声，提供情感上的支持和共鸣。你需要像一个老朋友一样，用温暖、体贴的话语回应用户，可以分享故事、聊聊家常，重点是情绪价值。`;
    }

    const coordinatorSys = `
      你是"触心"APP的【总控协调官】。你拥有极高的情商和专业素养。
      当前分配的子 Agent 角色：${agentRole}
      
      用户画像：${profile?.age || '长辈'}岁，性别：${profile?.gender || '未知'}，关注：${profile?.health || '无'}。
      【核心记忆库】：${memoryContext}
      
      你的职责：
      1. 分析用户意图，并决定如何调用子 Agent。
      2. 必须在回复开头包含 [THEME:xxx] 标签来动态演变 UI：
         - [THEME:health]: 涉及健康、吃药、身体不适。UI将变为翡翠绿。
         - [THEME:news]: 涉及天气、新闻、外界资讯。UI将变为青空蓝。
         - [THEME:social]: 涉及聊天、情感陪伴。UI将变为梦幻紫。
         - [THEME:warm]: 【热闹模式专属】当氛围非常热烈、开心或提到阳光、喜事时使用。UI将变为暖阳红黄。
         - [THEME:earth]: 【安静模式专属】当聊到大地、自然、宁静或深沉话题时使用。UI将变为大地棕。
         - [THEME:moon]: 【守护模式专属】当聊到月亮、深夜、安稳睡眠或催眠故事时使用。UI将变为满月银白。
         - [THEME:infinite]: 当你给出的建议非常具有创意、跨学科或深刻时使用。UI将变为极光金彩。
         - [THEME:default]: 其他通用情况。
      
      【重要规则】：
      - 说话必须完整，绝对不能在句子中途停止。每一句话都必须有明确的结束标点（。、！、？）。
      - 语气必须符合当前的【${modeIndex === 0 ? '热闹模式' : modeIndex === 1 ? '安静模式' : '守护模式'}】。
      - 严禁在语音中读出 [THEME:xxx] 标签。
      - 严禁使用 Markdown 符号（如 ** 或 *）。
      - 【超链接规则】：
        1. 如果提供新闻或资讯链接，必须确保链接是完整的、真实的、没有任何幻觉的超链接。
        2. 链接格式必须为 [标题](URL)。
        3. 严禁提供不完整或无法打开的链接。如果你无法保证链接的真实性，请不要提供任何链接。
        4. 严禁出现链接内容与描述不匹配的现象。
      - 【守护模式专项】：
        1. 针对夜间睡前状态，提供：睡眠知识、助眠建议、温馨的睡前催眠故事、关切的问询。
        2. 语气要极其温柔、轻声，像是在床边轻声细语。
        3. 确保三种模式（热闹、安静、守护）风格迥异，绝不同质化。
      - 【平衡记忆】：优先引用【核心记忆库】中的内容，但不要反复提及同一个旧话题。
      - 【主动服务】：如果用户提到需要记住某事，请务必调用 add_personal_memo 工具。
    `;

    let briefPrompt = "";
    const currentCycle = (briefCycle + 1) % 4;
    setBriefCycle(currentCycle);

    if (currentCycle === 1) {
      briefPrompt = `[THEME:news] 帮我生成一份完整的简报。包含问候、${locationRef.current}的天气、2条带链接的新闻、健康建议和我的提醒(${memoInfo})。`;
    } else if (currentCycle === 2) {
      briefPrompt = `[THEME:news] 讲2条带链接的新闻趣事，开头要亲切。`;
    } else if (currentCycle === 3) {
      briefPrompt = `[THEME:health] 给一个具体的健康小建议，结合我的关注点(${profile?.health})。`;
    } else {
      briefPrompt = `[THEME:social] 跟我聊两句心里话，或者讲个暖心小故事。`;
    }

    const userPrompt = isBrief ? briefPrompt : (input || "老伙计，想聊点什么？");

    try {
      let res: any = null;
      
      // 1. DeepSeek 主对话（含 function calling）
      res = await generateContentWithTimeout(aiRef.current, {
        model: AI_MODEL_TEXT,
        contents: userPrompt,
        config: {
          systemInstruction: coordinatorSys + "\n【绝对指令】：每一句话必须完整，严禁在句子中途停止。如果需要查阅资料，请先说完完整的开场白，例如：'好的，我这就为您查阅一下，请稍等。'，严禁只说一半。",
          tools: OPENAI_TOOLS as unknown[],
          maxOutputTokens: 2048
        }
      }, 120000);

      if (myRequestId !== latestRequestId.current) return;
      if (!res) throw new Error("AI failed");

      // --- 处理 Function Calling ---
      const functionCalls = res.functionCalls;
      let responseText = res.text || "";

      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          const { name, args } = call;
          if (name === 'set_health_reminder') {
             const { task, time } = args;
             const newMemo: Memo = {
                id: Date.now().toString(),
                title: task,
                time: time,
                originalText: input,
                timestamp: Date.now(),
                completed: false
             };
             const updated = [newMemo, ...memos];
             setMemos(updated);
             localStorage.setItem(STORAGE_KEYS.MEMOS, JSON.stringify(updated));
             setFlyInText(newMemo.title);
             setTimeout(() => setFlyInText(null), 2500);
             if (!responseText) responseText = `[THEME:health] 好的，已为您设置提醒：${time} ${task}。`;
          } else if (name === 'add_personal_memo') {
             const { content, time } = args;
             const newMemo: Memo = {
                id: Date.now().toString(),
                title: content,
                time: time || '备忘',
                originalText: input,
                timestamp: Date.now(),
                completed: false
             };
             const updated = [newMemo, ...memos];
             setMemos(updated);
             localStorage.setItem(STORAGE_KEYS.MEMOS, JSON.stringify(updated));
             setFlyInText(newMemo.title);
             setTimeout(() => setFlyInText(null), 2500);
             if (!responseText) responseText = `[THEME:social] 好的，我已经帮您记在记事本里了：${content}。`;
          } else if (name === 'update_voice_settings') {
             const { voice, style } = args;
             const updatedProfile = { ...profile! };
             if (voice) updatedProfile.voice = voice;
             if (style) updatedProfile.voiceStyle = style;
             setProfile(updatedProfile);
             localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updatedProfile));
             if (!responseText) responseText = `[THEME:social] 好的，我已经按照您的要求调整了我的声音和风格。`;
          } else if (name === 'switch_mode') {
             const { modeIndex: newModeIndex, reason } = args;
             if (newModeIndex >= 0 && newModeIndex <= 2) {
               setModeIndex(newModeIndex);
               localStorage.setItem(STORAGE_KEYS.MODE, newModeIndex.toString());
               if (newModeIndex === 0) setUiTheme('default');
               else if (newModeIndex === 1) setUiTheme('earth');
               else if (newModeIndex === 2) setUiTheme('moon');
               if (!responseText) responseText = `[THEME:social] ${reason}`;
             }
          } else if (name === 'contact_family_emergency') {
             handleDial();
             if (!responseText) responseText = "[THEME:emergency] 正在为您呼叫紧急联系人，请不要挂断。";
          } else if (name === 'search_medical_knowledge') {
             if (!responseText) responseText = `[THEME:health] 关于${args.query}，我帮您查了一下...`;
          }
        }
      }

      if (!responseText) responseText = "我在呢，您请说。";
      
      // 移除 Markdown 符号，确保 TTS 不会读出它们
      responseText = responseText.replace(/[*#_~`>]/g, '');
      
      // 终极截断修复
      responseText = ensureCompleteSentence(responseText);

      await speak(responseText);
      
      if (!isBrief && input) {
        extractMemory(input, responseText, aiRef.current);
      }

    } catch (err) { 
      if (myRequestId === latestRequestId.current) {
        setMode('IDLE'); 
        await speak("哎呀，网络有点小差错，您别急，稍后再试一下。");
      }
    } finally {
      isProcessingRef.current = false;
    }
  };

  const startHeartRateMeasure = async () => {
    stopCurrentSpeech();
    setIsNightDimmed(false);
    
    // 清理之前的流
    if (videoRef.current?.srcObject) {
      const prevStream = videoRef.current.srcObject as MediaStream;
      prevStream.getTracks().forEach(t => { t.stop(); t.enabled = false; });
      videoRef.current.srcObject = null;
    }

    setMode('HEART_RATE'); setIsMeasuring(true); setHeartResult(null); setRealtimeBpm(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 192 }, height: { ideal: 192 } } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch (pErr) {}
        
        const track = stream.getVideoTracks()[0];
        const tryEnableTorch = async (retries = 3) => {
           if(retries <= 0) return;
           try {
             const caps = track.getCapabilities() as any;
             if (caps && (caps.torch || caps.fillLightMode)) {
                await new Promise(r => setTimeout(r, 200));
                await track.applyConstraints({ advanced: [{ torch: true }] } as any).catch(e => {
                     return track.applyConstraints({ advanced: [{ fillLightMode: "flash" }] } as any);
                });
             }
           } catch(e) { setTimeout(() => tryEnableTorch(retries - 1), 500); }
        };
        setTimeout(() => tryEnableTorch(), 500);

        const ctx = canvasRef.current?.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        
        let peaks: number[] = []; 
        let history: number[] = [];
        let brightHistory: number[] = []; 

        const processFrame = () => {
          if (!isMeasuring || mode !== 'HEART_RATE') { 
            if (stream) stream.getTracks().forEach(t => t.stop()); 
            return; 
          }
          if (videoRef.current && videoRef.current.readyState >= 2) {
            ctx.drawImage(videoRef.current, 0, 0, 32, 32);
            const frame = ctx.getImageData(0, 0, 32, 32);
            const pixels = frame.data;

            let sumRed = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              sumRed += pixels[i]; // red channel
            }
            const avgRed = sumRed / (pixels.length / 4);

            history.push(avgRed);
            const now = Date.now();
            brightHistory.push(now); // Reuse brightHistory to store timestamps

            if (history.length > 300) {
              history.shift();
              brightHistory.shift();
            }

            // Calculate BPM
            if (history.length >= 50) {
              let localPeaks = [];
              for (let i = 1; i < history.length - 1; i++) {
                if (history[i] > history[i - 1] && history[i] > history[i + 1]) {
                  localPeaks.push(brightHistory[i]);
                }
              }

              if (localPeaks.length >= 2) {
                let intervals = [];
                for (let i = 1; i < localPeaks.length; i++) {
                  intervals.push(localPeaks[i] - localPeaks[i - 1]);
                }
                const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const bpm = 60000 / avgInterval;

                if (bpm > 40 && bpm < 180) {
                  const roundedBpm = Math.round(bpm);
                  setRealtimeBpm(roundedBpm);
                  heartScaleRef.current = 1.1 + (history[history.length-1] % 10) / 50; // Subtle pulse
                  
                  // If we have enough consistent peaks, we can finalize
                  if (localPeaks.length > 15 && history.length > 200) {
                    finalizeHeartRate(localPeaks);
                    return;
                  }
                }
              }
            }

            // Finger detection
            if (avgRed < 30) {
              setHeartResult("请将手指完全覆盖摄像头");
            } else {
              setHeartResult(null);
            }
          }
          requestAnimationFrame(processFrame);
        };
        requestAnimationFrame(processFrame);
      }
    } catch (err) { 
      setIsMeasuring(false); setHeartResult("硬件异常，请检查摄像头权限。"); 
      setTimeout(() => setMode('IDLE'), 3500);
    }
  };

  const finalizeHeartRate = async (peaks: number[]) => {
    setIsMeasuring(false); 
    const stream = videoRef.current?.srcObject as MediaStream; 
    if (stream) stream.getTracks().forEach(t => t.stop());
    
    const recentPeaks = peaks.slice(-8); 
    let finalBpm = 72; // 默认值
    if (recentPeaks.length >= 2) {
        const diff = (recentPeaks[recentPeaks.length-1]-recentPeaks[0]) / (recentPeaks.length-1);
        const calc = Math.round(60000 / diff);
        if (calc > 40 && calc < 180) finalBpm = calc;
    }
    setRealtimeBpm(finalBpm);
    
    setMode('THINKING');
    try {
      const res = await generateContentWithTimeout(aiRef.current!, {
        model: AI_MODEL_TEXT,
        contents: `心率测量结果：${finalBpm}次/分。请用纯中文给出健康指导。`,
        config: { systemInstruction: `你是专业管家。严禁英文。输出完整。`, maxOutputTokens: 800 }
      });
      setHeartResult(res.text || ""); setMode('HEART_RATE'); speak(`测量结果：每分钟${finalBpm}次。${res.text}`);
    } catch (e) { setHeartResult("测量完成。"); setMode('HEART_RATE'); }
  };

  const playWelcomeSequence = async (explicitProfile?: UserProfile) => {
    stopCurrentSpeech();
    isIntroPlayingRef.current = true;
    await initAudioEngine(); 
    
    // 使用显式传入的Profile或State中的Profile
    const currentProfile = explicitProfile || profile;
    const voiceId = currentProfile?.voice || 'Kore';
    const styleInstruction = STYLE_PRESETS.find(s => s.id === (currentProfile?.voiceStyle || 'warm'))?.instruction;

    // 教学文案更新：明确交互手势
    const welcomeText = `您好！我是您的触心管家，很高兴为您服务。为了方便您使用，我为您详细介绍一下：第一，单指轻触屏幕任何地方，我会为您播报今天的日期、天气、新闻和健康建议，是您每天的贴心简报。第二，长按屏幕不放，直接对我说话，松手后我就能回答您。比如您可以说“提醒我明天早上吃药”，我会自动帮您记下。第三，在屏幕上左右滑动，可以切换热闹模式、安静模式，或者深夜的守护模式。第四，如果有紧急情况，请快速双击屏幕，我会立刻为您呼叫紧急联系人。右上角还有记事本和测心率功能。现在，让我们开启美好的一天吧！`;
    await speak(welcomeText, voiceId, styleInstruction);
  };

  const handleDial = () => {
    if (contact?.phone) {
      window.open(`tel:${contact.phone}`, '_self');
      setMode('IDLE');
      setEmergencyCountdown(3);
    } else {
      speak("您还没有设置紧急联系人，请在设置中添加。");
      setMode('SETTINGS');
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.no-trigger')) return;

    if (interactionRef.current.longPressTimer) {
      clearTimeout(interactionRef.current.longPressTimer);
      interactionRef.current.longPressTimer = null;
    }

    interactionRef.current.startPos = { x: e.clientX, y: e.clientY };
    interactionRef.current.isMoving = false;
    interactionRef.current.isLongPress = false;

    interactionRef.current.longPressTimer = setTimeout(() => {
      if (!interactionRef.current.isMoving && !['EMERGENCY', 'HEART_RATE', 'SETTINGS', 'CALENDAR', 'MEMO_FORM', 'PROFILING'].includes(mode)) {
        interactionRef.current.isLongPress = true;
        if (navigator.vibrate) navigator.vibrate(50);
        
        stopCurrentSpeech();
        setMode('LISTENING');
        setLiveTranscript('');
        transcriptRef.current = '';
        if (recognitionRef.current) {
          try { recognitionRef.current.start(); } catch (e) {}
        }
      }
    }, 600);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.no-trigger')) return;

    if (interactionRef.current.longPressTimer) {
      clearTimeout(interactionRef.current.longPressTimer);
      interactionRef.current.longPressTimer = null;
    }

    if (interactionRef.current.isLongPress) {
      if (mode === 'LISTENING') {
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch (e) {}
        }
        setTimeout(() => {
          const text = transcriptRef.current;
          if (text && text.trim()) {
            handleAIAction(text, false);
          } else {
            setMode('IDLE');
            speak("我没听清，请再试一次。");
          }
        }, 600);
      }
      return;
    }

    if (interactionRef.current.isMoving) {
      const dx = e.clientX - interactionRef.current.startPos.x;
      const dy = e.clientY - interactionRef.current.startPos.y;
      
      if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy)) {
        if (['IDLE', 'SPEAKING', 'THINKING', 'LISTENING', 'NIGHT_GUARDIAN'].includes(mode)) {
          if (dx > 0) {
            const next = (modeIndex - 1 + 3) % 3;
            setModeIndex(next);
            setUiTheme('default');
            speak(next === 0 ? "热闹模式" : next === 1 ? "安静模式" : "守护模式");
          } else {
            const next = (modeIndex + 1) % 3;
            setModeIndex(next);
            setUiTheme('default');
            speak(next === 0 ? "热闹模式" : next === 1 ? "安静模式" : "守护模式");
          }
        }
      }
      return;
    }

    const now = Date.now();
    if (now - interactionRef.current.lastTap < 300) {
      clearTimeout(interactionRef.current.clickTimer);
      if (mode === 'EMERGENCY') {
        setMode('IDLE');
        setEmergencyCountdown(3);
        if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
        speak("已取消紧急呼救。");
      } else {
        setMode('EMERGENCY');
        speak("紧急呼救！双击取消。");
        setEmergencyCountdown(3);
        if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
        emergencyTimerRef.current = setInterval(() => {
          setEmergencyCountdown(prev => {
            if (prev <= 1) {
              if (emergencyTimerRef.current) clearInterval(emergencyTimerRef.current);
              handleDial();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } else {
      interactionRef.current.lastTap = now;
      interactionRef.current.clickTimer = setTimeout(() => {
        if (mode === 'ONBOARDING') {
           const p = localStorage.getItem(STORAGE_KEYS.PROFILE);
           if (p) {
               setProfile(JSON.parse(p));
               setMode('IDLE');
               playWelcomeSequence(JSON.parse(p));
           } else {
               setMode('PROFILING');
           }
        } else if (['IDLE', 'SPEAKING', 'THINKING', 'LISTENING', 'NIGHT_GUARDIAN'].includes(mode)) {
            // 单机简报：先设置状态，再调用异步函数，确保UI立即响应
            setMode('THINKING');
            handleAIAction('', true);
        }
      }, 250);
    }
  };

  return (
    <div 
      className={`fixed inset-0 w-full h-full flex flex-col items-center transition-all duration-1000 select-none overflow-hidden touch-none 
        ${mode === 'EMERGENCY' || uiTheme === 'emergency' ? 'bg-[#300000]' : 
          uiTheme === 'health' ? 'bg-[#001a08]' : 
          uiTheme === 'news' ? 'bg-[#00121a]' : 
          uiTheme === 'social' ? 'bg-[#1a001a]' : 
          uiTheme === 'warm' ? 'bg-[#2a1a05]' :
          uiTheme === 'earth' ? 'bg-[#1a120a]' :
          uiTheme === 'moon' ? 'bg-[#0a0a1a]' :
          uiTheme === 'infinite' ? 'bg-[#0a001a]' :
          modeIndex === 2 ? 'bg-[#020210]' : 
          modeIndex === 1 ? 'bg-[#120a05]' : 'bg-[#051a2a]'}`}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        const dx = Math.abs(e.clientX - interactionRef.current.startPos.x);
        const dy = Math.abs(e.clientY - interactionRef.current.startPos.y);
        if (dx > 20 || dy > 20) {
          interactionRef.current.isMoving = true;
          if (interactionRef.current.longPressTimer) {
            clearTimeout(interactionRef.current.longPressTimer);
            interactionRef.current.longPressTimer = null;
          }
        }
      }}
      onPointerUp={onPointerUp}
    >
      <div className={`absolute inset-0 transition-opacity duration-[3s] pointer-events-none opacity-40 blur-[120px] 
        ${uiTheme === 'health' ? 'bg-emerald-900' : 
          uiTheme === 'news' ? 'bg-blue-900' : 
          uiTheme === 'social' ? 'bg-rose-900' : 
          uiTheme === 'warm' ? 'bg-orange-900' :
          uiTheme === 'earth' ? 'bg-stone-800' :
          uiTheme === 'moon' ? 'bg-slate-700' :
          uiTheme === 'infinite' ? 'bg-indigo-900' :
          modeIndex === 2 ? 'bg-indigo-950' : 
          modeIndex === 1 ? 'bg-orange-900/60' : 'bg-sky-500/40'}`} />

      {/* 动态背景装饰 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 情绪粒子流 */}
        {[...Array(15)].map((_, i) => (
          <div 
            key={`particle-${i}`}
            className={`absolute rounded-full blur-xl animate-particle-flow opacity-20
              ${uiTheme === 'warm' ? 'bg-red-400' : 
                uiTheme === 'earth' ? 'bg-stone-500' : 
                uiTheme === 'moon' ? 'bg-slate-200' :
                uiTheme === 'health' ? 'bg-lime-400' :
                uiTheme === 'news' ? 'bg-sky-400' :
                uiTheme === 'social' ? 'bg-rose-400' :
                modeIndex === 0 ? 'bg-orange-400' : modeIndex === 1 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
            style={{
              width: Math.random() * 100 + 50 + 'px',
              height: Math.random() * 100 + 50 + 'px',
              top: Math.random() * 100 + '%',
              left: Math.random() * 100 + '%',
              animationDelay: Math.random() * 10 + 's',
              animationDuration: Math.random() * 10 + 15 + 's'
            }}
          />
        ))}

        {modeIndex === 0 && (
          <>
            <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-yellow-400/30 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute top-[20%] left-[-5%] w-64 h-64 bg-sky-400/20 rounded-full blur-[100px] animate-drift" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent animate-sunbeam" />
          </>
        )}
        {modeIndex === 1 && (
          <>
            <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-orange-900/30 to-transparent opacity-60" />
            <div className="absolute top-1/4 right-1/4 w-48 h-48 bg-amber-500/10 rounded-full blur-[80px] animate-drift" />
            <div className="absolute inset-0 flex items-center justify-center opacity-20">
              <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent animate-pulse" />
            </div>
          </>
        )}
        {modeIndex === 2 && (
          <>
            {[...Array(30)].map((_, i) => (
              <div 
                key={i} 
                className="absolute bg-white rounded-full animate-twinkle" 
                style={{
                  width: Math.random() * 2 + 1 + 'px',
                  height: Math.random() * 2 + 1 + 'px',
                  top: Math.random() * 100 + '%',
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 5 + 's',
                  opacity: Math.random() * 0.5 + 0.3
                }} 
              />
            ))}
            <div className="absolute top-10 left-10 w-32 h-32 bg-yellow-100/10 rounded-full blur-3xl animate-pulse" />
            <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-indigo-900/20 via-transparent to-transparent animate-aurora" />
          </>
        )}
      </div>
      <div className={`fixed inset-0 bg-black pointer-events-none z-[50] transition-opacity duration-[5000ms] ${isNightDimmed && modeIndex === 2 ? 'opacity-[0.98]' : 'opacity-0'}`} />
      
      {/* 隐藏的文件上传入口 */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleImageAnalysis(e.target.files[0]);
          }
        }}
      />

      {/* 主界面 */}
      {['IDLE', 'SPEAKING', 'THINKING', 'LISTENING', 'EMERGENCY', 'NIGHT_GUARDIAN'].includes(mode) && (
        <>
          {modeIndex !== 2 && (
            <div className="fixed top-16 right-6 z-[200] no-trigger flex flex-col gap-4 items-center">
              <div className="w-14 h-14 bg-white/5 backdrop-blur-3xl border border-white/20 rounded-2xl flex flex-col items-center justify-center gap-0.5 shadow-2xl active:scale-90 transition-all cursor-pointer hover:bg-white/10" onClick={(e) => { e.stopPropagation(); setIsNightDimmed(false); setMode('CALENDAR'); }}>
                <Calendar className="text-rose-400 w-6 h-6" />
                <span className="text-white text-[9px] font-black">记事本</span>
                {flyInText && <div className="absolute right-20 top-2 whitespace-nowrap bg-orange-600 text-white px-4 py-2 rounded-full text-sm font-black animate-memo-fly">已记下: {flyInText}</div>}
              </div>
              <div className="w-14 h-14 bg-red-600/10 backdrop-blur-3xl border border-red-500/30 rounded-2xl flex flex-col items-center justify-center gap-0.5 shadow-xl active:scale-90 transition-all cursor-pointer hover:bg-red-600/20" onClick={(e) => { e.stopPropagation(); startHeartRateMeasure(); }}>
                <Heart className="text-red-500 w-6 h-6" />
                <span className="text-white text-[9px] font-black">测心率</span>
              </div>
              <div className="w-14 h-14 bg-white/5 backdrop-blur-3xl border border-white/20 rounded-2xl flex flex-col items-center justify-center gap-0.5 shadow-xl active:scale-90 transition-all cursor-pointer hover:bg-white/10" onClick={(e) => { e.stopPropagation(); setIsNightDimmed(false); setMode('SETTINGS'); }}>
                <Settings className="text-indigo-400 w-6 h-6" />
                <span className="text-white text-[9px] font-black tracking-tighter">设置</span>
              </div>
              <div className="w-14 h-14 bg-white/5 backdrop-blur-3xl border border-white/20 rounded-2xl flex flex-col items-center justify-center gap-0.5 shadow-xl active:scale-90 transition-all cursor-pointer hover:bg-white/10" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <Camera className="text-cyan-400 w-6 h-6" />
                <span className="text-white text-[9px] font-black tracking-tighter">识图</span>
              </div>
            </div>
          )}
          <header className={`h-[10%] w-full flex items-center justify-center transition-opacity z-[60] ${isNightDimmed ? 'opacity-10' : 'opacity-30'}`}><h2 className="text-white text-2xl font-black tracking-[0.8em] uppercase pl-[0.8em]">触心陪伴</h2></header>
          <div className="h-[35%] w-full flex items-center justify-center z-[60] relative">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {/* 核心扩散波纹 */}
                <div className={`absolute w-64 h-64 rounded-full border border-white/10 animate-ripple-slow
                  ${uiTheme === 'health' ? 'border-lime-400/20' : uiTheme === 'news' ? 'border-blue-400/20' : uiTheme === 'warm' ? 'border-red-400/20' : uiTheme === 'moon' ? 'border-slate-100/20' : 'border-white/10'}`} />
                <div className={`absolute w-80 h-80 rounded-full border border-white/5 animate-ripple-fast
                  ${uiTheme === 'health' ? 'border-lime-400/10' : uiTheme === 'news' ? 'border-blue-400/10' : uiTheme === 'warm' ? 'border-orange-400/10' : uiTheme === 'moon' ? 'border-slate-100/10' : 'border-white/5'}`} />
                <div className={`absolute w-96 h-96 rounded-full border border-white/5 animate-ripple-slow opacity-20
                  ${uiTheme === 'health' ? 'border-lime-400/5' : uiTheme === 'news' ? 'border-blue-400/5' : uiTheme === 'warm' ? 'border-yellow-400/5' : uiTheme === 'moon' ? 'border-slate-100/5' : 'border-white/5'}`} />
            </div>
            
            <button className={`soul-core relative flex items-center justify-center transition-all duration-[800ms] shadow-2xl rounded-full z-10
              ${mode === 'EMERGENCY' || uiTheme === 'emergency' ? 'bg-red-600 w-44 h-44 shadow-[0_0_80px_#ff0000] cursor-pointer active:scale-95' : 
                uiTheme === 'health' ? 'bg-lime-400 w-36 h-36 shadow-[0_0_60px_#a3e635] animate-pulse' : 
                uiTheme === 'news' ? 'bg-blue-500 w-36 h-36 shadow-[0_0_60px_#3b82f6] animate-bounce' : 
                uiTheme === 'social' ? 'bg-rose-500 w-40 h-40 shadow-[0_0_70px_#f43f5e] animate-spin-slow' : 
                uiTheme === 'warm' ? 'bg-orange-500 w-40 h-40 shadow-[0_0_70px_#f97316] animate-fluid-lively' :
                uiTheme === 'earth' ? 'bg-stone-600 w-36 h-36 shadow-[0_0_60px_#57534e] animate-breath-quiet' :
                uiTheme === 'moon' ? 'bg-slate-100 w-40 h-40 shadow-[0_0_80px_#f8fafc] animate-pulse' :
                uiTheme === 'infinite' ? 'bg-gradient-to-tr from-white via-yellow-200 to-amber-400 w-40 h-40 shadow-[0_0_80px_#ffffff] animate-fluid-lively' :
                modeIndex === 2 ? 'bg-indigo-600 w-32 h-32 animate-night-pulse shadow-[0_0_50px_#4f46e5]' : 
                mode === 'LISTENING' ? 'bg-cyan-400 w-40 h-40 scale-105 shadow-[0_0_100px_#00ffff]' : 
                modeIndex === 0 ? 'bg-gradient-to-tr from-rose-500 via-orange-400 to-amber-400 w-36 h-36 animate-fluid-lively' : 
                'bg-gradient-to-tr from-emerald-500/80 via-teal-400/60 to-cyan-500/80 w-32 h-32 animate-breath-quiet shadow-[0_0_50px_#2dd4bf]'}`} 
              onClick={(e) => { if (mode === 'EMERGENCY') { e.stopPropagation(); handleDial(); } }}>
              {/* 内核光晕层 */}
              <div className="absolute inset-0 rounded-full bg-white/20 blur-md animate-pulse" />
              <div className="absolute inset-[-15px] rounded-full border border-white/10 animate-spin-slow" />
              <div className="absolute inset-[-30px] rounded-full border border-white/5 animate-spin-reverse opacity-30" />
              
              {(mode === 'EMERGENCY' || uiTheme === 'emergency') && <div className="flex flex-col items-center"><AlertCircle className="w-12 h-12 text-white mb-2" /><span className="text-6xl font-black text-white">{emergencyCountdown}</span></div>}
              {mode === 'LISTENING' && <div className="flex gap-1.5">{[1, 2, 3, 4].map(i => <div key={i} className="w-2 h-10 bg-white rounded-full animate-wave" style={{ animationDelay: `${i*0.12}s` }} />)}</div>}
              {mode === 'THINKING' && <div className="w-[70%] h-[70%] border-[8px] border-t-white border-white/5 rounded-full animate-spin" />}
              {mode === 'IDLE' && <div className={`w-8 h-8 bg-white/40 rounded-full ${modeIndex === 0 ? 'animate-ping' : 'opacity-10'}`} />}
            </button>
          </div>
          <main className={`h-[40%] w-full max-w-xl px-6 flex flex-col items-center justify-start z-[60] overflow-hidden transition-opacity duration-1000 ${isNightDimmed ? 'opacity-0' : 'opacity-100'}`}>
            <div className="mb-4 bg-white/10 border border-white/10 px-6 py-2 rounded-full backdrop-blur-3xl"><p className="text-white/60 text-[12px] font-black tracking-widest uppercase">{modeIndex === 2 ? '守护之夜' : mode === 'LISTENING' ? '正在倾听...' : (modeIndex === 0 ? '热闹模式' : '安静陪伴')}</p></div>
            <div className="w-full h-full bg-white/[0.04] backdrop-blur-[80px] rounded-[3.5rem] p-10 border border-white/10 shadow-2xl flex flex-col overflow-hidden"><div className="flex-grow overflow-y-auto pr-2 custom-scroll text-[1.8rem] sm:text-3xl font-bold leading-relaxed text-white/95 animate-pop">{mode === 'LISTENING' ? (liveTranscript || '正在倾听您的心声...') : renderRichText(aiResponse || '点机屏幕 开启精彩一天')}</div></div>
          </main>
          <footer className={`h-[15%] w-full flex flex-col items-center justify-center gap-6 z-[60] px-4 safe-bottom transition-opacity duration-1000 ${isNightDimmed ? 'opacity-5' : 'opacity-100'}`}>
            <div className="bg-white/5 backdrop-blur-3xl border border-white/10 px-4 py-4 rounded-full flex flex-nowrap justify-center items-center gap-x-3 shadow-2xl overflow-x-auto no-scrollbar">
              {[ { label: '单机播报', color: 'bg-orange-500' }, { label: '长按交流', color: 'bg-cyan-400' }, { label: '左右切换', color: 'bg-indigo-400' }, { label: '双击呼救', color: 'bg-red-500' } ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-1.5 shrink-0 opacity-70"><div className={`w-2 h-2 rounded-full ${item.color}`} /><span className="text-white text-[11px] font-bold whitespace-nowrap">{item.label}</span></div>
              ))}
            </div>
          </footer>
        </>
      )}

      {/* 记事本界面 */}
      {mode === 'CALENDAR' && (
        <div className="fixed inset-0 bg-black/95 z-[1001] flex items-center justify-center p-6 animate-fade-in overflow-y-auto no-trigger">
          <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[3rem] w-full max-w-sm shadow-4xl my-auto min-h-[60vh] flex flex-col">
            <h2 className="text-3xl font-black text-rose-500 mb-8 text-center sticky top-0 bg-[#1a1a1a] pb-4 border-b border-white/5">我的记事本</h2>
            <div className="flex-grow space-y-4 overflow-y-auto custom-scroll pr-2">
              {memos.length === 0 ? (
                <div className="text-white/30 text-center py-10 font-bold">暂无事项<br/><span className="text-sm font-normal">长按屏幕告诉我"提醒我..."</span></div>
              ) : (
                memos.map(memo => (
                  <div key={memo.id} className="bg-white/5 p-4 rounded-2xl flex items-start gap-4 border border-white/5">
                    <div onClick={() => {
                        const newMemos = memos.map(m => m.id === memo.id ? {...m, completed: !m.completed} : m);
                        setMemos(newMemos);
                        localStorage.setItem(STORAGE_KEYS.MEMOS, JSON.stringify(newMemos));
                    }} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 flex-shrink-0 ${memo.completed ? 'bg-green-500 border-green-500' : 'border-white/30'}`}>
                        {memo.completed && <Check className="text-white w-3 h-3" />}
                    </div>
                    <div className="flex-grow">
                      <div className={memo.completed ? 'opacity-30 line-through' : ''}>
                        <div className="text-orange-400 text-sm font-black mb-1">{memo.time}</div>
                        <div className="text-white font-bold text-lg leading-snug">{memo.title}</div>
                      </div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteMemo(memo.id); }}
                      className="p-2 text-white/20 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
                <button onClick={() => setMode('IDLE')} className="py-4 bg-white/10 text-white rounded-2xl font-black text-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                  <X className="w-5 h-5" /> 返回
                </button>
                <button onClick={() => setMode('MEMO_FORM')} className="py-4 bg-orange-600 text-white rounded-2xl font-black text-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                  <Plus className="w-5 h-5" /> 添加事项
                </button>
            </div>
          </div>
        </div>
      )}

      {/* 手动添加记事界面 */}
      {mode === 'MEMO_FORM' && (
        <div className="fixed inset-0 bg-black/95 z-[1050] flex items-center justify-center p-6 animate-fade-in no-trigger">
          <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[3rem] w-full max-w-sm shadow-4xl space-y-6">
            <h2 className="text-3xl font-black text-orange-500 text-center">添加事项</h2>
            <input type="text" value={memoInput.time} onChange={e => setMemoInput({...memoInput, time: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-white outline-none font-bold text-lg border-2 border-transparent focus:border-orange-500/50" placeholder="时间 (如: 明早8点)" />
            <textarea value={memoInput.content} onChange={e => setMemoInput({...memoInput, content: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-white outline-none h-32 text-lg font-bold border-2 border-transparent focus:border-orange-500/50" placeholder="要做什么..." />
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setMode('CALENDAR')} className="py-4 bg-white/10 text-white/50 rounded-xl font-black text-lg flex items-center justify-center gap-2">
                <X className="w-5 h-5" /> 取消
              </button>
              <button onClick={saveMemo} className="py-4 bg-orange-600 text-white rounded-xl font-black text-lg flex items-center justify-center gap-2">
                <Check className="w-5 h-5" /> 保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 心率测量界面 */}
      {mode === 'HEART_RATE' && (
         <div className="fixed inset-0 bg-black z-[1200] flex flex-col items-center justify-center animate-fade-in no-trigger">
            {/* 恢复摄像头预览，辅助用户对准，但加模糊遮罩提示这是测量 */}
            <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 mb-6 bg-black">
                <video ref={videoRef} className="w-full h-full object-cover opacity-60" playsInline muted autoPlay />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-red-500 text-2xl animate-pulse">❤️</span>
                </div>
            </div>
            <canvas ref={canvasRef} width="32" height="32" className="hidden" />
            <div className="relative w-56 h-56 rounded-full border-4 border-red-900/30 flex items-center justify-center mb-8">
                {/* 模拟心跳波纹 */}
                <div className="absolute inset-0 border-2 border-red-500/20 rounded-full animate-ping" />
                <div className="absolute inset-0 border-2 border-red-500/10 rounded-full animate-ping" style={{ animationDelay: '0.5s' }} />
                <div className="w-48 h-48 bg-gradient-to-br from-red-600 to-red-800 rounded-full animate-pulse shadow-[0_0_60px_#b91c1c] flex flex-col items-center justify-center transition-transform duration-200" style={{ transform: `scale(${heartScaleRef.current})` }}>
                    <span className="text-7xl font-black text-white tracking-tighter">{realtimeBpm > 0 ? realtimeBpm : "--"}</span>
                    <span className="text-red-200 text-xs font-bold mt-2 uppercase tracking-widest">BPM</span>
                </div>
            </div>
            <p className="text-white/90 text-xl font-bold mb-2 text-center px-8">{heartResult || "请将手指完全覆盖摄像头"}</p>
            <p className="text-white/40 text-sm font-medium mb-12 bg-white/5 px-4 py-1 rounded-full">请保持静止，开启闪光灯效果更佳</p>
            <button onClick={() => { setIsMeasuring(false); stopCurrentSpeech(); if(videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t=>t.stop()); setMode('IDLE'); }} className="px-12 py-5 bg-white/10 rounded-full text-white font-black text-lg active:scale-95 transition-all border border-white/5 flex items-center gap-2">
              <X className="w-6 h-6" /> 取消测量
            </button>
         </div>
      )}

      {/* 设置界面 */}
      {mode === 'SETTINGS' && (
        <div className="fixed inset-0 bg-black/95 z-[1001] flex items-center justify-center p-6 animate-fade-in overflow-y-auto no-trigger">
          <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[3rem] w-full max-w-sm shadow-4xl my-auto">
            <h2 className="text-3xl font-black text-rose-500 mb-8 text-center">偏好与联系人</h2>
            <div className="mb-6">
              <label className="text-white/50 text-[10px] font-black block mb-4 uppercase tracking-widest">性格表达</label>
              <div className="grid grid-cols-2 gap-3">
                {STYLE_PRESETS.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => { 
                      const up = { ...profile!, voiceStyle: s.id }; 
                      setProfile(up); 
                      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(up));
                      const currentVoice = up.voice || 'Kore'; 
                      speak("我已经准备好用这种新风格为您服务了。", currentVoice, s.instruction); 
                    }} 
                    className={`py-4 rounded-xl text-xs font-black border-2 transition-all ${profile?.voiceStyle === s.id ? 'bg-cyan-600 border-cyan-400 text-white' : 'bg-white/5 border-white/5 text-white/50'}`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-8">
              <label className="text-white/50 text-[10px] font-black block mb-4 uppercase tracking-widest">声音音色</label>
              <div className="grid grid-cols-2 gap-3">
                {VOICE_PRESETS.map(v => (
                  <button 
                    key={v.id} 
                    onClick={() => { 
                      const up = { ...profile!, voice: v.id }; 
                      setProfile(up); 
                      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(up));
                      const currentStyle = STYLE_PRESETS.find(s => s.id === (up.voiceStyle || 'warm'))?.instruction; 
                      speak(`新声音设置好了。`, v.id, currentStyle); 
                    }} 
                    className={`py-4 rounded-xl text-xs font-black border-2 transition-all ${profile?.voice === v.id ? 'bg-orange-600 border-orange-400 text-white' : 'bg-white/5 border-white/5 text-white/50'}`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-8 space-y-4">
              <label className="text-white/50 text-[10px] font-black block uppercase tracking-widest">紧急联系人</label>
              <input type="text" value={settingsInput.name} onChange={(e) => setSettingsInput({...settingsInput, name: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-white outline-none text-base border border-white/5" placeholder="称呼 (如: 儿子)" />
              <input type="tel" value={settingsInput.phone} onChange={(e) => setSettingsInput({...settingsInput, phone: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-white outline-none text-base border border-white/5" placeholder="号码" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setMode('IDLE')} className="py-4 bg-white/5 text-white/30 rounded-xl font-black flex items-center justify-center gap-2">
                <X className="w-5 h-5" /> 取消
              </button>
              <button onClick={() => { if(!settingsInput.name || settingsInput.phone.length < 5) return; setContact(settingsInput); localStorage.setItem(STORAGE_KEYS.CONTACT, JSON.stringify(settingsInput)); setMode('IDLE'); speak("保存成功。"); }} className="py-4 bg-rose-600 text-white rounded-xl font-black flex items-center justify-center gap-2">
                <Check className="w-5 h-5" /> 保存
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === 'PROFILING' && (
        <div className="fixed inset-0 bg-black/98 z-[1100] flex items-center justify-center p-6 animate-fade-in no-trigger overflow-y-auto">
          <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[3.5rem] w-full max-w-sm shadow-4xl text-center space-y-5 my-auto">
            <div className="flex justify-center mb-2">
              <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center">
                <User className="text-orange-500 w-10 h-10" />
              </div>
            </div>
            <h2 className="text-4xl font-black text-orange-500 mb-6">个人信息登记</h2>
            <div className="space-y-4">
              <div className="relative">
                <select value={profileInput.gender} onChange={(e) => setProfileInput({...profileInput, gender: e.target.value})} className="w-full bg-[#333] border-2 border-white/5 p-5 rounded-2xl text-white outline-none text-xl appearance-none">
                  <option value="">您的性别</option>
                  <option value="男">爷爷/男</option>
                  <option value="女">奶奶/女</option>
                </select>
                <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 rotate-90" />
              </div>
              <input type="number" value={profileInput.age} onChange={(e) => setProfileInput({...profileInput, age: e.target.value})} className="w-full bg-[#333] border-2 border-white/5 p-5 rounded-2xl text-white outline-none text-xl" placeholder="您的年龄" />
              <div className="relative">
                <select value={profileInput.family} onChange={(e) => setProfileInput({...profileInput, family: e.target.value})} className="w-full bg-[#333] border-2 border-white/5 p-5 rounded-2xl text-white outline-none text-xl appearance-none">
                  <option value="">子女情况</option>
                  <option value="有儿子">有儿子</option>
                  <option value="有女儿">有女儿</option>
                  <option value="都有">儿女双全</option>
                  <option value="无">暂无子女</option>
                </select>
                <ChevronRight className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 rotate-90" />
              </div>
              <textarea value={profileInput.health} onChange={(e) => setProfileInput({...profileInput, health: e.target.value})} className="w-full bg-[#333] border-2 border-white/5 p-5 rounded-2xl text-white h-36 outline-none text-xl" placeholder="您的健康关注点" />
            </div>
            <button onClick={async () => { if(!profileInput.gender || !profileInput.age || !profileInput.family) return; const up = { ...profileInput, voice: 'Kore', voiceStyle: 'warm' }; 
            // 修复开场白失效问题：显式等待音频初始化完成
            try {
              await initAudioEngine(); 
              setProfile(up); 
              localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(up)); 
              // 立即切换模式
              setMode('IDLE'); 
              // 关键修复：将最新的 Profile 直接传给播放函数，避免 State 异步更新导致的问题
              await playWelcomeSequence(up);
            } catch(e) { console.error(e); }
          }} className="w-full py-6 bg-orange-600 text-white rounded-2xl text-2xl font-black mt-4 active:scale-95 transition-all">开启专属陪伴</button></div>
        </div>
      )}

      {mode === 'ONBOARDING' && (
        <div className="fixed inset-0 bg-black z-[2000] flex flex-col items-center justify-center p-10 text-center animate-fade-in" onPointerUp={(e) => { e.stopPropagation(); onPointerUp(e); }}>
          <div className="relative mb-14">
            <div className="absolute inset-[-50px] bg-orange-600 rounded-full blur-[80px] opacity-20 animate-pulse" />
            <div className="relative w-40 h-40 bg-gradient-to-tr from-orange-400 via-rose-500 to-amber-300 rounded-full flex items-center justify-center soul-core animate-fluid-lively shadow-4xl">
              <Sparkles className="text-white w-16 h-16 animate-pulse" />
            </div>
          </div>
          <h1 className="text-5xl font-black text-white mb-3 tracking-tighter">触心陪伴</h1>
          <p className="text-xl text-white/30 mb-16 font-medium">您的数字管家</p>
          <div className="p-8 bg-white/5 border border-white/10 rounded-[2.5rem] animate-pulse shadow-xl flex items-center gap-3">
            <Sparkles className="text-orange-500 w-6 h-6" />
            <p className="text-3xl text-orange-500 font-black tracking-widest uppercase">点机屏幕 开始</p>
          </div>
          <p className="text-sm text-white/20 mt-8 max-w-xs">需在 touchsoul 目录下配置 .env 的 DEEPSEEK_API_KEY 并重启 dev</p>
          <p className="text-xs text-white/30 mt-2">密钥状态：{(getApiKey() ? '已配置' : '未检测到，请检查 .env 并在本目录重启 npm run dev')}</p>
        </div>
      )}

      <style>{`
        @keyframes wave { 0%, 100% { height: 8px; transform: scaleY(0.7); opacity: 0.3; } 50% { height: 45px; transform: scaleY(1.2); opacity: 1; } }
        .animate-wave { animation: wave 1.2s infinite ease-in-out; }
        @keyframes fluid-lively { 0% { border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%; transform: rotate(0deg) scale(1); } 33% { border-radius: 40% 60% 60% 40% / 40% 60% 40% 60%; transform: rotate(120deg) scale(1.03); } 66% { border-radius: 60% 40% 40% 60% / 50% 50% 60% 40%; transform: rotate(240deg) scale(0.98); } 100% { border-radius: 50% 50% 40% 60% / 60% 40% 50% 50%; transform: rotate(360deg) scale(1); } }
        .animate-fluid-lively { animation: fluid-lively 6s infinite linear; }
        @keyframes breath-quiet { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.04); opacity: 1; } }
        .animate-breath-quiet { animation: breath-quiet 8s infinite ease-in-out; }
        @keyframes night-pulse { 0% { opacity: 0.2; transform: scale(0.96); } 50% { opacity: 0.4; transform: scale(1.04); } 100% { opacity: 0.2; transform: scale(0.96); } }
        .animate-night-pulse { animation: night-pulse 5s infinite ease-in-out; }
        @keyframes pop { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .animate-pop { animation: pop 0.6s forwards cubic-bezier(0.16, 1, 0.3, 1); }
        /* 修复动画：移除垂直位移，改为轻微水平浮动，防止文字飞出屏幕 */
        @keyframes memo-fly { 0% { opacity: 0; transform: translateX(20px); } 15% { opacity: 1; transform: translateX(0); } 85% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateY(-10px); } }
        .animate-memo-fly { animation: memo-fly 2.5s forwards ease-in-out; }
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s infinite linear; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 10px; }
        .animate-fade-in { animation: fade-in 0.4s forwards ease-out; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes twinkle { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
        .animate-twinkle { animation: twinkle 3s infinite ease-in-out; }
        @keyframes drift { 0% { transform: translate(0, 0); } 50% { transform: translate(20px, -20px); } 100% { transform: translate(0, 0); } }
        .animate-drift { animation: drift 10s infinite ease-in-out; }
        @keyframes sunbeam { 0% { opacity: 0.1; transform: scale(1) rotate(0deg); } 50% { opacity: 0.3; transform: scale(1.1) rotate(5deg); } 100% { opacity: 0.1; transform: scale(1) rotate(0deg); } }
        .animate-sunbeam { animation: sunbeam 15s infinite ease-in-out; }
        @keyframes aurora { 0% { transform: translateY(0) scaleY(1); opacity: 0.1; } 50% { transform: translateY(-10px) scaleY(1.2); opacity: 0.3; } 100% { transform: translateY(0) scaleY(1); opacity: 0.1; } }
        .animate-aurora { animation: aurora 20s infinite ease-in-out; }
        @keyframes ripple-slow { 0% { transform: scale(0.8); opacity: 0.5; } 100% { transform: scale(1.5); opacity: 0; } }
        .animate-ripple-slow { animation: ripple-slow 4s infinite linear; }
        @keyframes ripple-fast { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }
        .animate-ripple-fast { animation: ripple-fast 2.5s infinite linear; }
        @keyframes particle-flow { 0% { transform: translate(0, 0) rotate(0deg); } 50% { transform: translate(100px, -100px) rotate(180deg); } 100% { transform: translate(0, 0) rotate(360deg); } }
        .animate-particle-flow { animation: particle-flow 20s infinite linear; }
        @keyframes spin-reverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        .animate-spin-reverse { animation: spin-reverse 15s infinite linear; }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<TouchSoul />);
