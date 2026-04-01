/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from 'react';
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
  Key
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

export default function App() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [logoText, setLogoText] = useState<string>('');
  const [customApiKey, setCustomApiKey] = useState<string>('');
  const [retouchedImage, setRetouchedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize>('1K');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

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
    if (!originalImage || !hasApiKey) return;

    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: customApiKey || process.env.API_KEY || '' });
      const model = 'gemini-3-pro-image-preview';

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

1. 제품 보존 (최우선 순위): 사진 속 제품의 모든 디테일(텍스처, 글씨, 버튼, 포트, 나사 구멍 등)은 원본과 1:1로 일치해야 합니다. 제품의 형태를 변형하지 마세요.
2. 로고 교체: 제품에 있는 기존 로고를 첨부된 새로운 로고 이미지나 텍스트("${logoText || '첨부된 이미지'}")로 자연스럽게 교체하세요. 로고의 위치와 각도는 기존 로고와 동일하게 유지하되, 제품 표면의 질감이 느껴지도록 합성하세요.
3. 색상 변경: 제품의 버튼이나 현재 주황색(Orange)으로 되어 있는 모든 부분들을 선명한 녹색(Green)으로 변경하세요. 이때 금속이나 플라스틱의 질감은 그대로 유지되어야 합니다.
4. 배경 교체: 제품은 그대로 두고, 배경만 실제 스튜디오 촬영 컷처럼 자연스러운 질감이 있는 화이트 배경으로 교체하세요.
5. 각도 및 정렬: 제품이 기울어져 있다면 수직/수평만 바로잡으세요. 완벽한 90도 정면 샷을 유지해야 합니다.
6. 조명 및 그림자: 제품 주변에 부드러운 소프트박스 조명을 비춘 것처럼 보정하되, 제품 본연의 디테일이 뭉개지지 않게 하세요. 바닥에는 자연스러운 매트한 그림자만 추가하고 반사(Reflection)는 절대 넣지 마세요.
7. 금지 사항: 제품 위에 새로운 하이라이트를 그리거나, 제품의 가장자리를 임의로 다듬는 행위를 절대 금지합니다.`;

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

  const downloadImage = () => {
    if (!retouchedImage) return;
    const link = document.createElement('a');
    link.href = retouchedImage;
    link.download = `retouched-studio-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-green-200">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white">
            <Sparkles size={18} />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Studio Retouch Pro</h1>
        </div>
        
        {!hasApiKey && (
          <button 
            onClick={handleOpenKeySelector}
            className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-black/80 transition-colors"
          >
            <Key size={14} />
            API 키 선택
          </button>
        )}
      </header>

      <main className="max-w-6xl mx-auto p-6 lg:p-12">
        <div className="grid lg:grid-cols-[1fr_320px] gap-12">
          
          {/* Left Column: Image Area */}
          <div className="space-y-8">
            <AnimatePresence mode="wait">
              {!originalImage ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square bg-white border-2 border-dashed border-black/10 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-green-600/50 hover:bg-green-50/30 transition-all group"
                >
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Upload className="text-black/40 group-hover:text-green-600" />
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
                      <div className="flex gap-4">
                        <button 
                          onClick={() => logoInputRef.current?.click()}
                          className="text-xs font-medium text-green-600 hover:underline"
                        >
                          로고 추가
                        </button>
                        <button 
                          onClick={() => setOriginalImage(null)}
                          className="text-xs font-medium text-green-600 hover:underline"
                        >
                          이미지 변경
                        </button>
                      </div>
                      <input 
                        type="file" 
                        ref={logoInputRef} 
                        onChange={handleLogoChange} 
                        accept="image/*" 
                        className="hidden" 
                      />
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
                          onClick={downloadImage}
                          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:underline"
                        >
                          <Download size={12} />
                          다운로드
                        </button>
                      )}
                    </div>
                    <div className="aspect-square bg-white rounded-2xl overflow-hidden shadow-sm border border-black/5 flex items-center justify-center relative">
                      {retouchedImage ? (
                        <img 
                          src={retouchedImage} 
                          alt="Retouched" 
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      ) : isProcessing ? (
                        <div className="flex flex-col items-center gap-4">
                          <Loader2 className="w-10 h-10 text-green-600 animate-spin" />
                          <div className="text-center">
                            <p className="text-sm font-medium animate-pulse">스튜디오 보정 중...</p>
                            <p className="text-xs text-black/40 mt-1">잠시만 기다려 주세요</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-black/20">
                          <ImageIcon size={48} />
                          <p className="text-sm font-medium">보정 대기 중</p>
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
          <aside className="space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 space-y-6">
              <div className="flex items-center gap-2 text-black/80">
                <Settings2 size={18} />
                <h2 className="font-semibold">보정 설정</h2>
              </div>

              {/* API Key Input */}
              <div className="space-y-3 p-4 bg-green-50/50 rounded-2xl border border-green-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-widest text-green-800">API 설정</label>
                  <a 
                    href="https://aistudio.google.com/app/apikey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] text-green-600 hover:underline font-medium"
                  >
                    키 발급받기
                  </a>
                </div>
                <div className="space-y-2">
                  <div className="relative">
                    <input 
                      type="password"
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      placeholder="Gemini API 키를 입력하세요"
                      className="w-full px-4 py-2 pl-9 rounded-xl bg-white border border-green-200 focus:border-green-600 focus:ring-2 focus:ring-green-600/10 transition-all text-sm outline-none"
                    />
                    <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600/50" />
                  </div>
                  {!hasApiKey && !customApiKey && (
                    <button 
                      onClick={handleOpenKeySelector}
                      className="w-full py-2 rounded-xl border border-dashed border-green-300 text-green-700 text-[11px] font-medium hover:bg-green-100/50 transition-colors"
                    >
                      또는 플랫폼 키 선택기 사용
                    </button>
                  )}
                </div>
              </div>

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
                          ? 'bg-green-600 text-white shadow-md shadow-green-200' 
                          : 'bg-black/5 text-black/60 hover:bg-black/10'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logo Text Input */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-black/40">로고 텍스트 (선택 사항)</label>
                <input 
                  type="text"
                  value={logoText}
                  onChange={(e) => setLogoText(e.target.value)}
                  placeholder="예: Studio Pro"
                  className="w-full px-4 py-2 rounded-xl bg-black/5 border border-transparent focus:border-green-600/30 focus:bg-white transition-all text-sm outline-none"
                />
                <p className="text-[10px] text-black/40 leading-tight">
                  이미지 대신 텍스트로 로고를 교체하고 싶을 때 입력하세요.
                </p>
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
                      <CheckCircle2 size={14} className="text-green-600" />
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
                {isProcessing ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Sparkles size={20} />
                )}
                {isProcessing ? '처리 중...' : '스튜디오 보정 시작'}
              </button>
              
              {!hasApiKey && !customApiKey && originalImage && (
                <p className="text-[10px] text-center text-red-500 font-medium">
                  보정을 시작하려면 먼저 API 키를 입력하거나 선택하세요.
                </p>
              )}
            </div>

            <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
              <h3 className="text-sm font-bold text-green-800 mb-2">전문가의 팁</h3>
              <p className="text-xs text-green-700/80 leading-relaxed">
                로고를 교체하려면 '로고 추가' 버튼을 눌러 새 로고 이미지를 업로드하세요. 
                주황색 부품들은 자동으로 녹색으로 변경됩니다.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto p-6 text-center">
        <p className="text-xs text-black/20 font-medium uppercase tracking-widest">
          Powered by Gemini 3 Pro Image • Professional Studio Retouching
        </p>
      </footer>
    </div>
  );
}
