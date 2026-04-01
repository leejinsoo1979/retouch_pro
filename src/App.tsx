/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, ChangeEvent, DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { GoogleGenAI } from "@google/genai";
import {
  Upload,
  Image as ImageIcon,
  Sparkles,
  Download,
  Loader2,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Key,
  Pencil,
  Eraser,
  X,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Extend window for AI Studio API key selection
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

type ImageSize = '1K' | '2K' | '4K';

type ModelOption = {
  id: string;
  name: string;
  description: string;
};

const MODELS: ModelOption[] = [
  { id: 'gemini-3-pro-image-preview', name: 'Nano Banana Pro', description: '고품질 전문 보정' },
  { id: 'gemini-3.1-flash-image-preview', name: 'Nano Banana 2', description: '빠른 속도, 대량 작업' },
  { id: 'gemini-2.5-flash-image', name: 'Nano Banana', description: '초고속, 저지연' },
];

export default function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoText, setLogoText] = useState<string>('');
  const [customApiKey, setCustomApiKey] = useState<string>(() => localStorage.getItem('gemini-api-key') || '');
  const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(20);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const markCanvasRef = useRef<HTMLCanvasElement>(null);
  const markContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasApiKey(selected);
    } catch (e) {
      console.error("Error checking API key:", e);
    }
  };

  const handleOpenKeySelector = async () => {
    try {
      await window.aistudio.openSelectKey();
      // Assume success as per guidelines
      setHasApiKey(true);
    } catch (e) {
      console.error("Error opening key selector:", e);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setOriginalImage(event.target?.result as string);
        setRetouchedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoImage(event.target?.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setOriginalImage(event.target?.result as string);
        setRetouchedImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetouch = async () => {
    if (!originalImage || (!hasApiKey && !customApiKey)) return;

    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.API_KEY || '' });
      const model = selectedModel;

      // Prepare image parts
      const parts: any[] = [];
      
      parts.push({ text: "원본 제품 이미지:" });
      const productBase64 = originalImage.split(',')[1];
      const productMime = originalImage.split(';')[0].split(':')[1];
      parts.push({ inlineData: { data: productBase64, mimeType: productMime } });

      if (logoImage) {
        parts.push({ text: "교체할 새로운 로고 이미지:" });
        const logoBase64 = logoImage.split(',')[1];
        const logoMime = logoImage.split(';')[0].split(':')[1];
        parts.push({ inlineData: { data: logoBase64, mimeType: logoMime } });
      }

      if (logoText) {
        parts.push({ text: `교체할 새로운 로고 텍스트: "${logoText}"` });
      }

      const prompt = `당신은 제품 사진 보정 전문가입니다. 이 작업의 핵심은 **제품 자체의 픽셀과 디테일을 100% 그대로 보존**하면서 요청된 변경 사항을 적용하는 것입니다.

1. 제품 보존 (최우선 순위): 사진 속 제품의 모든 디테일(텍스처, 글씨, 버튼, 포트, 나사 구멍 등)은 원본과 1:1로 일치해야 합니다. 제품의 형태, 색상을 변형하지 마세요.
2. 배경 교체: 제품은 그대로 두고, 배경만 실제 스튜디오 촬영 컷처럼 자연스러운 질감이 있는 화이트 배경으로 교체하세요.
3. 각도 및 정렬: 제품이 기울어져 있다면 수직/수평만 바로잡으세요. 완벽한 90도 정면 샷을 유지해야 합니다.
4. 조명 및 그림자: 제품 주변에 부드러운 소프트박스 조명을 비춘 것처럼 보정하되, 제품 본연의 디테일이 뭉개지지 않게 하세요. 바닥에는 자연스러운 매트한 그림자만 추가하고 반사(Reflection)는 절대 넣지 마세요.
5. 금지 사항: 제품의 색상을 변경하거나, 제품 위에 새로운 하이라이트를 그리거나, 제품의 가장자리를 임의로 다듬는 행위를 절대 금지합니다.`;

      parts.push({ text: prompt });

      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: parts
        },
        config: {
          imageConfig: {
            imageSize: imageSize,
            aspectRatio: "1:1" // Standard for product shots
          }
        }
      });

      let foundImage = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setRetouchedImage(`data:image/png;base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error("보정된 이미지를 생성하지 못했습니다. 다시 시도해주세요.");
      }

    } catch (err: any) {
      console.error("Retouch error:", err);
      if (err.message?.includes("Requested entity was not found")) {
        setHasApiKey(false);
        setError("API 키가 유효하지 않거나 만료되었습니다. 다시 선택해주세요.");
      } else {
        setError(err.message || "보정 중 오류가 발생했습니다.");
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Edit mode: canvas setup
  const initMarkCanvas = useCallback(() => {
    const canvas = markCanvasRef.current;
    const container = markContainerRef.current;
    if (!canvas || !container) return;
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    if (isEditMode) {
      setTimeout(initMarkCanvas, 50);
    }
  }, [isEditMode, initMarkCanvas]);

  const getCanvasPos = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = markCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDraw = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const ctx = markCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = markCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => setIsDrawing(false);

  const clearMark = () => {
    const canvas = markCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const getMarkedImage = (): string | null => {
    const canvas = markCanvasRef.current;
    const container = markContainerRef.current;
    if (!canvas || !container || !retouchedImage) return null;

    const merged = document.createElement('canvas');
    merged.width = canvas.width;
    merged.height = canvas.height;
    const ctx = merged.getContext('2d')!;

    const img = new Image();
    img.src = retouchedImage;
    ctx.drawImage(img, 0, 0, merged.width, merged.height);
    ctx.drawImage(canvas, 0, 0);

    return merged.toDataURL('image/png');
  };

  const handleEditRetouch = async () => {
    if (!retouchedImage || !editPrompt.trim() || (!hasApiKey && !customApiKey)) return;

    const markedImage = getMarkedImage();

    setIsProcessing(true);
    setError(null);
    setIsEditMode(false);

    try {
      const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.API_KEY || '' });
      const parts: any[] = [];

      parts.push({ text: "보정된 제품 이미지 (빨간색으로 마킹된 부분이 수정 요청 영역입니다):" });
      const imgSrc = markedImage || retouchedImage;
      const base64 = imgSrc.split(',')[1];
      const mime = imgSrc.split(';')[0].split(':')[1];
      parts.push({ inlineData: { data: base64, mimeType: mime } });

      parts.push({ text: `추가 보정 요청: ${editPrompt.trim()}

위 이미지에서 빨간색으로 마킹된 영역을 중심으로 요청된 수정사항을 적용하세요.
마킹되지 않은 영역은 절대 변경하지 마세요. 제품의 전체적인 품질과 스타일을 유지하면서 마킹된 부분만 수정하세요.` });

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: { parts },
        config: {
          imageConfig: {
            imageSize: imageSize,
            aspectRatio: "1:1"
          }
        }
      });

      let foundImage = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setRetouchedImage(`data:image/png;base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error("수정된 이미지를 생성하지 못했습니다. 다시 시도해주세요.");
      }
    } catch (err: any) {
      console.error("Edit retouch error:", err);
      setError(err.message || "추가 보정 중 오류가 발생했습니다.");
    } finally {
      setIsProcessing(false);
      setEditPrompt('');
    }
  };

  const downloadImage = () => {
    if (!retouchedImage) return;
    const link = document.createElement('a');
    link.href = retouchedImage;
    link.download = `retouched-studio-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-black/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-black rounded-full"></span>
              <span className="w-2.5 h-2.5 bg-black rounded-full"></span>
              <span className="w-2.5 h-2.5 bg-black rounded-full"></span>
            </span>
            <span className="uppercase">CRAFT</span>
          </h1>
        </div>
        
      </header>

      <main className="h-[calc(100vh-57px)] flex overflow-hidden">
        <div className="flex w-full">
          
          {/* Left Column: Image Area */}
          <div className="flex-1 p-8 overflow-y-auto space-y-8">
            <AnimatePresence mode="wait">
              {!originalImage ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-video max-w-3xl mx-auto bg-white border-2 border-dashed border-black/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-black/30 hover:bg-black/5 transition-all group"
                >
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="text-black/40 group-hover:text-black" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">제품 사진을 업로드하세요</p>
                    <p className="text-sm text-black/40 mt-1">드래그 앤 드롭 또는 클릭하여 선택</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </motion.div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Original */}
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-black/40">Original</span>
                      <button
                          onClick={() => setOriginalImage(null)}
                          className="text-xs font-medium text-black hover:underline"
                        >
                          이미지 변경
                        </button>
                    </div>
                    <div className="aspect-square bg-white rounded-2xl overflow-hidden shadow-sm border border-black/5 relative">
                      <img 
                        src={originalImage} 
                        alt="Original" 
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                      {logoImage && (
                        <div className="absolute top-4 right-4 w-20 h-20 bg-white/90 rounded-lg border border-black/10 p-2 shadow-lg">
                          <p className="text-[8px] font-bold uppercase text-black/40 mb-1">New Logo</p>
                          <img src={logoImage} className="w-full h-full object-contain" />
                          <button 
                            onClick={() => setLogoImage(null)}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Result */}
                  <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-black/40">Retouched</span>
                      {retouchedImage && (
                        <button
                          onClick={handleRetouch}
                          className="flex items-center gap-1 text-xs font-medium text-black hover:underline"
                        >
                          재생성
                        </button>
                      )}
                    </div>
                    <div ref={markContainerRef} className="aspect-square bg-white rounded-2xl overflow-hidden shadow-sm border border-black/5 flex items-center justify-center relative">
                      {retouchedImage ? (
                        <>
                          <img
                            src={retouchedImage}
                            alt="Retouched"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                          {isEditMode && (
                            <>
                              <canvas
                                ref={markCanvasRef}
                                className="absolute inset-0 w-full h-full cursor-crosshair"
                                onMouseDown={startDraw}
                                onMouseMove={draw}
                                onMouseUp={stopDraw}
                                onMouseLeave={stopDraw}
                              />
                              {/* Mark toolbar */}
                              <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-2 shadow-md border border-black/10">
                                <input
                                  type="range"
                                  min="5"
                                  max="50"
                                  value={brushSize}
                                  onChange={(e) => setBrushSize(Number(e.target.value))}
                                  className="w-20 accent-red-500"
                                />
                                <span className="text-[10px] text-black/40 w-6">{brushSize}</span>
                                <button onClick={clearMark} className="p-1 hover:bg-black/5 rounded-lg" title="마킹 지우기">
                                  <Eraser size={14} />
                                </button>
                                <button onClick={() => setIsEditMode(false)} className="p-1 hover:bg-black/5 rounded-lg" title="취소">
                                  <X size={14} />
                                </button>
                              </div>
                              {/* Prompt input */}
                              <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                                <input
                                  type="text"
                                  value={editPrompt}
                                  onChange={(e) => setEditPrompt(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleEditRetouch()}
                                  placeholder="수정할 내용을 입력하세요"
                                  className="flex-1 px-4 py-2 rounded-xl bg-white/90 backdrop-blur-sm border border-black/10 text-sm outline-none shadow-md"
                                />
                                <button
                                  onClick={handleEditRetouch}
                                  disabled={!editPrompt.trim()}
                                  className="px-4 py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-black/80 disabled:opacity-30 shadow-md"
                                >
                                  <Send size={14} />
                                </button>
                              </div>
                            </>
                          )}
                          {!isEditMode && (
                            <button
                              onClick={() => setIsEditMode(true)}
                              className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur-sm text-black text-xs font-medium rounded-xl shadow-md border border-black/10 hover:bg-white transition-colors"
                            >
                              <Pencil size={12} />
                              추가 보정
                            </button>
                          )}
                        </>
                      ) : isProcessing ? (
                        <div className="flex flex-col items-center gap-4">
                          <Loader2 className="w-10 h-10 text-black animate-spin" />
                          <div className="text-center">
                            <p className="text-sm font-medium animate-pulse">스튜디오 보정 중...</p>
                            <p className="text-xs text-black/40 mt-1">잠시만 기다려 주세요</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-black/40">
                          <Sparkles size={24} />
                          <p className="text-sm font-semibold">보정 대기 중</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3"
              >
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </div>

          {/* Right Column: Controls */}
          <aside className="w-[360px] shrink-0 border-l border-black/5 bg-white overflow-y-auto p-6 space-y-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-black/80">
                <Settings2 size={18} />
                <h2 className="font-semibold">보정 설정</h2>
              </div>

              {/* API Key Input */}
              <div className="space-y-3 p-4 bg-black/5 rounded-2xl border border-black/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-black/80">API 설정</label>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] text-black hover:underline font-medium"
                  >
                    키 발급받기
                  </a>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <input 
                      type="password"
                      value={customApiKey}
                      onChange={(e) => { setCustomApiKey(e.target.value); localStorage.setItem('gemini-api-key', e.target.value); }}
                      placeholder="Gemini API 키를 입력하세요"
                      className="w-full px-4 py-2 pl-9 rounded-xl bg-white border border-black/20 focus:border-black focus:ring-2 focus:ring-black/10 transition-all text-sm outline-none"
                    />
                    <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/50" />
                  </div>
                </div>
              </div>

              {/* Model Selection */}
              {customApiKey && (
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-black/40">모델 선택</label>
                  <div className="space-y-2">
                    {MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                          selectedModel === model.id
                            ? 'bg-black text-white'
                            : 'bg-black/5 text-black/60 hover:bg-black/10'
                        }`}
                      >
                        <p className="text-sm font-semibold">{model.name}</p>
                        <p className={`text-[11px] ${selectedModel === model.id ? 'text-white/60' : 'text-black/40'}`}>{model.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-black/40">출력 해상도</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['1K', '2K', '4K'] as ImageSize[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => setImageSize(size)}
                      className={`py-2 rounded-xl text-sm font-medium transition-all ${
                        imageSize === size 
                          ? 'bg-black text-white shadow-md shadow-black/20' 
                          : 'bg-black/5 text-black/60 hover:bg-black/10'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Features Checklist */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-black/40">적용 효과</label>
                <ul className="space-y-2">
                  {[
                    '실제 스튜디오 화이트 배경',
                    '완벽한 정면 (수직/수평 정렬)',
                    '로고 교체 및 색상 변경',
                    '소프트 박스 조명',
                    '자연스러운 바닥 그림자',
                    '채도 및 대비 최적화',
                    '노이즈 제거 및 샤프닝'
                  ].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-black/60">
                      <CheckCircle2 size={14} className="text-black" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                disabled={!originalImage || isProcessing || (!hasApiKey && !customApiKey)}
                onClick={handleRetouch}
                className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all ${
                  !originalImage || isProcessing || (!hasApiKey && !customApiKey)
                    ? 'bg-black/5 text-black/20 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-black/80 active:scale-[0.98]'
                }`}
              >
                {isProcessing && <Loader2 className="animate-spin" size={20} />}
                {isProcessing ? '처리 중...' : '이미지 생성'}
              </button>
              
              {retouchedImage && (
                <button
                  onClick={downloadImage}
                  className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 bg-white text-black border border-black/10 hover:bg-black/5 active:scale-[0.98] transition-all"
                >
                  <Download size={20} />
                  이미지 다운로드
                </button>
              )}

              {!hasApiKey && !customApiKey && originalImage && (
                <p className="text-[10px] text-center text-red-500 font-medium">
                  보정을 시작하려면 먼저 API 키를 입력하거나 선택하세요.
                </p>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
