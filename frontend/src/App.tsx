import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Volume2, 
  Clock, 
  UtensilsCrossed, 
  ArrowRight, 
  Loader2,
  RefreshCw,
  Camera,
  Upload,
  X,
  Sparkles,
  Settings
} from 'lucide-react';

interface RecipeResult {
  name: string;
  time: string;
  dishes: string;
  ingredients: string[];
  suggested_ingredients?: string[];
  steps: string[];
  payoff: string;
  chef_notes?: string;
  effort_level?: string;
}

export default function App() {
  const [ingredientsInput, setIngredientsInput] = useState('');
  const [slothLevel, setSlothLevel] = useState<'aint_cookin' | 'can_cook' | 'ramsay'>('aint_cookin');
  const [elevenApiKey, setElevenApiKey] = useState('');
  const [voiceId, setVoiceId] = useState('MmQVkVZnQ0dUbfWzcW6f');
  const [hfToken, setHfToken] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  
  // Image Capture & Upload State
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [recipe, setRecipe] = useState<RecipeResult | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Helper to extract clean instructions for voice narration
  const getInstructionsOnly = (steps: string[]) => {
    return steps.map((s, idx) => `Step ${idx + 1}: ${s}`).join('. ');
  };

  // Stop camera stream
  const stopCamera = React.useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  }, []);

  // Cleanup camera stream and audio blobs on unmount
  React.useEffect(() => {
    return () => {
      stopCamera();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      window.speechSynthesis.cancel();
    };
  }, [audioUrl, stopCamera]);

  // Start webcam
  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setError('Could not access camera. Please check permissions or upload a picture.');
      setIsCameraActive(false);
    }
  };

  // Capture frame from webcam
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setImagePreview(dataUrl);
      stopCamera();
      analyzeKitchenImage(dataUrl);
    }
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        setImagePreview(base64);
        analyzeKitchenImage(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const API_BASE = 'http://localhost:8000/api/v1';

  // Vision Analysis via REST: POST /api/v1/pantry/scan
  const analyzeKitchenImage = async (base64Img: string) => {
    setAnalyzingImage(true);
    setStatusMessage('Analyzing your fridge scene with open-weight vision...');
    setError(null);

    try {
      const fetchResponse = await fetch(base64Img);
      const blob = await fetchResponse.blob();

      const formData = new FormData();
      formData.append('image', blob, 'pantry.jpg');
      if (hfToken.trim()) {
        formData.append('hf_token', hfToken.trim());
      }

      const res = await fetch(`${API_BASE}/pantry/scan`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        const caption = data.detected_ingredients;
        if (caption) {
          setIngredientsInput(prev => prev ? `${prev}, ${caption}` : caption);
          setStatusMessage('Ingredients detected!');
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || 'Vision scan failed. You can type ingredients manually!');
      }
    } catch (vErr: any) {
      console.warn('Vision call failed:', vErr);
      setError('Could not reach REST backend. Check if backend is running on port 8000.');
    } finally {
      setAnalyzingImage(false);
    }
  };

  // Recipe Generation via REST: POST /api/v1/recipes/generate
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingredientsInput.trim() && !imagePreview) {
      setError('Please snap a picture or type in whatever ingredients you have.');
      return;
    }

    setError(null);
    setLoading(true);
    setStatusMessage('Synthesizing minimal-effort recipe with Google Gemma 2...');
    setCurrentStep(2);

    try {
      const res = await fetch(`${API_BASE}/recipes/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: ingredientsInput || 'fridge items',
          effort_level: slothLevel,
          hf_token: hfToken.trim() || undefined
        })
      });

      if (!res.ok) {
        throw new Error(`Backend returned status ${res.status}`);
      }

      const generatedRecipe: RecipeResult = await res.json();
      setRecipe(generatedRecipe);
      setCurrentStep(3);

      // Trigger ElevenLabs Voice via REST: POST /api/v1/recipes/narration
      if (elevenApiKey.trim()) {
        setStatusMessage('Generating hands-free narration with ElevenLabs Voice AI...');
        setAudioLoading(true);

        const voiceRes = await fetch(`${API_BASE}/recipes/narration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipe_text: generatedRecipe.name,
            steps: generatedRecipe.steps,
            eleven_api_key: elevenApiKey.trim(),
            voice_id: voiceId
          })
        });

        if (voiceRes.ok) {
          const blob = await voiceRes.blob();
          if (audioUrl) {
            URL.revokeObjectURL(audioUrl);
          }
          setAudioUrl(URL.createObjectURL(blob));
        } else {
          console.warn('Voice narration error:', voiceRes.status);
        }
        setAudioLoading(false);
      }
    } catch (err: any) {
      setError(err?.message || 'Error communicating with REST API backend.');
    } finally {
      setLoading(false);
      setStatusMessage('');
    }
  };

  const speakWithBrowser = () => {
    if (!recipe) return;
    window.speechSynthesis.cancel();
    const text = getInstructionsOnly(recipe.steps);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="flex min-h-screen w-full bg-black selection:bg-white/30 p-2 transition-all duration-500 lg:h-screen lg:overflow-hidden lg:p-4">
      {/* 3. Left Column (Hero & Background Video) */}
      <section className="relative hidden lg:flex w-[52%] flex-col items-center justify-end pb-32 px-12 rounded-3xl overflow-hidden shadow-2xl h-full">
        {/* Background Video */}
        <video 
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay 
          muted 
          loop 
          playsInline
        >
          <source 
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4" 
            type="video/mp4" 
          />
        </video>

        {/* Hero Content Container */}
        <motion.div 
          className="z-10 w-full max-w-xs space-y-8"
          initial="hidden"
          animate="visible"
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.15,
                delayChildren: 0.2
              }
            }
          }}
        >
          {/* Brand/Logo */}
          <motion.div 
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
            className="flex items-center space-x-3.5"
          >
            {/* Logo image */}
            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20 shadow-lg bg-black shrink-0">
              <img src="/logo.png" alt="Cooked Literally Logo" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-semibold tracking-tight text-white leading-tight">Cooked Literally</span>
              <span className="text-xs text-white/50 tracking-wider font-medium">minimal efforts</span>
            </div>
          </motion.div>

          {/* Heading Block */}
          <motion.div 
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
            className="space-y-2"
          >
            <h1 className="text-4xl font-medium tracking-tight whitespace-nowrap text-white">
              Zero Effort.
            </h1>
            <p className="text-white/60 text-sm leading-relaxed px-0">
              Follow these 3 quick phases to turn random kitchen ingredients into dinner.
            </p>
          </motion.div>

          {/* Steps */}
          <motion.div 
            variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
            className="space-y-3"
          >
            <StepItem 
              number={1} 
              text="Snap photo or type items" 
              active={currentStep === 1} 
            />
            <StepItem 
              number={2} 
              text="Google Gemma synthesis" 
              active={currentStep === 2} 
            />
            <StepItem 
              number={3} 
              text="Hands-free voice guide" 
              active={currentStep === 3} 
            />
          </motion.div>
        </motion.div>
      </section>

      {/* 4. Right Column (Interaction Form & Results) */}
      <section className="flex-1 flex flex-col items-center justify-center py-12 lg:py-6 px-4 sm:px-12 lg:px-16 xl:px-24 overflow-y-auto lg:overflow-hidden">
        <motion.div 
          className="w-full max-w-xl space-y-6 lg:space-y-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-medium tracking-tight text-white">
                Better get Cooking
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="p-2 rounded-xl bg-brand-gray hover:bg-white/10 text-white/70 hover:text-white border border-white/10 transition-all cursor-pointer flex items-center space-x-1.5 text-xs"
                  title="Configure Model & Voice Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </button>
                <span className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 text-white/80 border border-white/10">
                  Gemma 2
                </span>
              </div>
            </div>
            <p className="text-white/40 text-sm">
              Snap a picture or list what you have. No measuring, minimal dishes.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {!recipe ? (
              /* Input Form */
              <motion.form 
                key="form"
                onSubmit={handleGenerate} 
                className="space-y-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
              >
                {/* Visual Capture & Upload Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white flex items-center space-x-2">
                      <Camera className="w-4 h-4 text-white/70" />
                      <span>1. Snap / Upload Fridge Photo</span>
                    </label>
                    {analyzingImage && (
                      <span className="text-xs text-white/60 flex items-center space-x-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Analyzing image...</span>
                      </span>
                    )}
                  </div>

                  {/* Camera Live Stream View */}
                  {isCameraActive && (
                    <div className="relative rounded-2xl overflow-hidden bg-brand-gray border border-white/20 aspect-video">
                      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                      <div className="absolute bottom-3 inset-x-0 flex justify-center space-x-3">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="px-4 py-2 bg-white text-black font-semibold rounded-xl text-xs hover:bg-white/90 shadow-lg cursor-pointer"
                        >
                          Capture Picture
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2 bg-black/60 text-white font-medium rounded-xl text-xs hover:bg-black/80 backdrop-blur-md cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Captured / Uploaded Image Preview */}
                  {imagePreview && !isCameraActive && (
                    <div className="relative rounded-2xl overflow-hidden bg-brand-gray border border-white/10 aspect-video max-h-44 flex items-center justify-center">
                      <img src={imagePreview} alt="Fridge scene" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImagePreview(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white/80 hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Camera & Upload Buttons */}
                  {!isCameraActive && !imagePreview && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="h-11 rounded-xl bg-brand-gray hover:bg-white/5 border border-white/10 text-white/80 hover:text-white text-xs font-medium flex items-center justify-center space-x-2 transition-all cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Use Webcam</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-11 rounded-xl bg-brand-gray hover:bg-white/5 border border-white/10 text-white/80 hover:text-white text-xs font-medium flex items-center justify-center space-x-2 transition-all cursor-pointer"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Upload Photo</span>
                      </button>
                      <input 
                        ref={fileInputRef} 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileUpload} 
                        className="hidden" 
                      />
                    </div>
                  )}
                </div>

                {/* Ingredients Typing Field */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-white flex items-center justify-between">
                    <span>2. Ingredients (Auto-populated or typed)</span>
                    <span className="text-xs text-white/40">comma separated</span>
                  </label>
                  <textarea 
                    value={ingredientsInput}
                    onChange={(e) => setIngredientsInput(e.target.value)}
                    placeholder="e.g. 2 eggs, leftover rice, soy sauce, green onion, butter..."
                    rows={2}
                    className="w-full bg-brand-gray border-none rounded-xl p-3 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 outline-none resize-none transition-all text-xs leading-relaxed"
                  />
                </div>

                {/* Effort Selection: Aint cookin / Can Cook / I am Ramsay */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-white">Effort Level</label>
                    <span className="text-[11px] text-white/40">
                      {slothLevel === 'ramsay' ? '🔥 Michelin technique + pantry upgrades' : slothLevel === 'can_cook' ? '🍳 Balanced 15-min home cook' : '🦥 Zero effort & single pan'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSlothLevel('aint_cookin')}
                      className={`h-14 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                        slothLevel === 'aint_cookin' 
                          ? 'bg-white text-black border-white shadow-md' 
                          : 'bg-brand-gray text-white/60 border-transparent hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold">Aint cookin</span>
                      <span className={`text-[10px] ${slothLevel === 'aint_cookin' ? 'text-black/60' : 'text-white/40'}`}>
                        4-5 mins • 1 pan
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlothLevel('can_cook')}
                      className={`h-14 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                        slothLevel === 'can_cook' 
                          ? 'bg-white text-black border-white shadow-md' 
                          : 'bg-brand-gray text-white/60 border-transparent hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-semibold">Can Cook</span>
                      <span className={`text-[10px] ${slothLevel === 'can_cook' ? 'text-black/60' : 'text-white/40'}`}>
                        10-15 mins • scratch
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlothLevel('ramsay')}
                      className={`h-14 rounded-xl flex flex-col items-center justify-center border transition-all cursor-pointer ${
                        slothLevel === 'ramsay' 
                          ? 'bg-gradient-to-r from-amber-200 to-amber-400 text-black border-amber-300 shadow-md font-bold' 
                          : 'bg-brand-gray text-white/60 border-transparent hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold flex items-center space-x-1">
                        <span>I am Ramsay</span>
                      </span>
                      <span className={`text-[10px] ${slothLevel === 'ramsay' ? 'text-black/70 font-medium' : 'text-white/40'}`}>
                        Gourmet • Upgrades
                      </span>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl">
                    {error}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-13 bg-white text-black font-semibold rounded-xl hover:bg-white/90 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 mt-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{statusMessage || 'Synthesizing with Gemma...'}</span>
                    </>
                  ) : (
                    <>
                      <span>give me my food</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.form>
            ) : (
              /* Recipe Result View */
              <motion.div 
                key="result"
                className="space-y-4 max-h-[75vh] overflow-y-auto pr-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {/* Recipe Card */}
                <div className="p-6 bg-brand-gray rounded-2xl border border-white/10 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        {recipe.effort_level === 'ramsay' ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-400 text-black uppercase tracking-wider">
                            🔥 Ramsay Gourmet Masterclass
                          </span>
                        ) : recipe.effort_level === 'can_cook' ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 uppercase tracking-wider">
                            🍳 Scratch Home Chef (15m)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                            🦥 Zero Effort Sloth (5m)
                          </span>
                        )}
                      </div>
                      <h3 className="text-2xl font-semibold text-white tracking-tight">
                        {recipe.name}
                      </h3>
                      <div className="flex items-center space-x-3 text-xs text-white/50 mt-1">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{recipe.time}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <UtensilsCrossed className="w-3.5 h-3.5" />
                          <span>{recipe.dishes}</span>
                        </span>
                      </div>
                    </div>
                    <span className="text-xs px-2.5 py-1 bg-white/10 rounded-full font-medium text-white/70 flex items-center space-x-1">
                      <Sparkles className="w-3 h-3" />
                      <span>Gemma 2</span>
                    </span>
                  </div>

                  {/* Ingredients Used */}
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                      Ingredients From Your Kitchen
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.ingredients.map((ing, i) => (
                        <span key={i} className="px-2.5 py-1 bg-black/40 rounded-lg text-xs text-white/80 border border-white/5">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Chef's Suggested New Ingredients / Upgrades (especially for Ramsay mode) */}
                  {recipe.suggested_ingredients && recipe.suggested_ingredients.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-amber-500/20">
                      <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-300 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Chef Ramsay's Suggested Additions & Flavor Upgrades</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recipe.suggested_ingredients.map((item, i) => (
                          <span key={i} className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-200 font-medium">
                            + {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cooking Steps */}
                  <div className="space-y-2.5 pt-2 border-t border-white/5">
                    <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                      Culinary Instructions ({recipe.steps.length} Steps)
                    </span>
                    <ol className="space-y-2">
                      {recipe.steps.map((st, i) => (
                        <li key={i} className="flex items-start space-x-3 text-sm text-white/90">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 font-medium ${
                            recipe.effort_level === 'ramsay' ? 'bg-amber-400 text-black font-bold' : 'bg-white/10 text-white/70'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="leading-relaxed">{st}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Chef Ramsay Notes / Technique */}
                  {recipe.chef_notes && (
                    <div className="p-3.5 bg-gradient-to-r from-amber-500/15 to-orange-500/5 rounded-xl border border-amber-500/30 space-y-1">
                      <span className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                        <span>👨‍🍳 Chef's Masterclass Technique</span>
                      </span>
                      <p className="text-xs text-amber-100/90 leading-relaxed italic">
                        "{recipe.chef_notes}"
                      </p>
                    </div>
                  )}

                  {/* Lazy / Gourmet Payoff */}
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-1">
                    <span className="text-xs font-semibold text-white/50">
                      {recipe.effort_level === 'ramsay' ? '🏆 The Gourmet Payoff' : '🦥 The Payoff'}
                    </span>
                    <p className="text-xs text-white/70 leading-relaxed">
                      {recipe.payoff}
                    </p>
                  </div>
                </div>

                {/* Voice Narration Section */}
                <div className="p-4 bg-brand-gray rounded-xl border border-white/10 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium text-white flex items-center space-x-2">
                      <Volume2 className="w-4 h-4 text-white/80" />
                      <span>Hands-Free Audio Guide</span>
                    </div>
                    <p className="text-xs text-white/40">
                      Only reading cooking instructions so your hands stay clean.
                    </p>
                  </div>

                  {audioUrl ? (
                    <audio controls src={audioUrl} autoPlay className="h-9 max-w-[200px]" />
                  ) : audioLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin text-white/60" />
                  ) : (
                    <button
                      onClick={speakWithBrowser}
                      className="px-3 py-2 bg-white text-black font-semibold rounded-lg text-xs hover:bg-white/90 transition-all cursor-pointer"
                    >
                      Play Instructions
                    </button>
                  )}
                </div>

                {/* Reset Button */}
                <button
                  onClick={() => {
                    setRecipe(null);
                    setCurrentStep(1);
                    setAudioUrl(null);
                    setImagePreview(null);
                  }}
                  className="w-full h-12 bg-transparent text-white/60 hover:text-white font-medium border border-white/10 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Cook Something Else</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </section>

      {/* Settings Modal Popup */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="w-full max-w-md bg-brand-gray border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white tracking-tight">Engine & Audio Settings</h3>
                    <p className="text-xs text-white/50">Configure your model keys and voice ID</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5">
                <InputGroup 
                  label="ElevenLabs Voice ID"
                  placeholder="MmQVkVZnQ0dUbfWzcW6f"
                  type="text"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                />

                <InputGroup 
                  label="ElevenLabs API Key (Optional / Sponsor)"
                  placeholder="xi-api-key..."
                  type="password"
                  value={elevenApiKey}
                  onChange={(e) => setElevenApiKey(e.target.value)}
                />

                <InputGroup 
                  label="Hugging Face Token (Gemma 2 & Vision)"
                  placeholder="hf_... (optional, server default used if empty)"
                  type="password"
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 bg-white text-black font-semibold rounded-xl text-xs hover:bg-white/90 transition-all cursor-pointer"
                >
                  Save & Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/* 5. Reusable Components */

export function StepItem({ number, text, active }: { number: number; text: string; active?: boolean }) {
  return (
    <div 
      className={`flex items-center space-x-4 p-3 rounded-2xl transition-all duration-300 ${
        active 
          ? 'bg-white text-black border border-white' 
          : 'bg-brand-gray text-white border-none'
      }`}
    >
      <div 
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
          active 
            ? 'bg-black text-white' 
            : 'bg-white/10 text-white/40'
        }`}
      >
        {number}
      </div>
      <span className="text-sm font-medium tracking-tight">{text}</span>
    </div>
  );
}

export function InputGroup({ 
  label, 
  placeholder, 
  type, 
  value, 
  onChange 
}: { 
  label: string; 
  placeholder: string; 
  type: string; 
  value?: string; 
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; 
}) {
  return (
    <div className="space-y-1.5 flex-1">
      <label className="text-xs font-medium text-white/70">{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-brand-gray border-none rounded-xl h-11 px-4 text-white placeholder:text-white/20 focus:ring-2 focus:ring-white/20 outline-none text-xs"
      />
    </div>
  );
}
