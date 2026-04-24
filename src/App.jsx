import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { addDoc, collection, getFirestore, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Calendar, Camera, Heart, Leaf, Loader2, Send, Sprout, User, X } from 'lucide-react';

const firebaseConfig =
  typeof __firebase_config !== 'undefined'
    ? JSON.parse(__firebase_config)
    : {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      };
const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
const app = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'pping-mul-diary';

const App = () => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!auth) return;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Auth error:', error);
      }
    };
    initAuth();

    if (!auth) {
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      const savedProfile = localStorage.getItem('diary-profile');
      if (savedProfile) setProfile(savedProfile);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !user) return undefined;

    const diaryRef = collection(db, 'artifacts', appId, 'public', 'data', 'daily_notes');
    const unsubscribe = onSnapshot(
      diaryRef,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
          dateStr: item.data().createdAt?.toDate
            ? item.data().createdAt.toDate().toLocaleDateString()
            : new Date().toLocaleDateString(),
        }));
        const sortedData = data.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA;
        });
        setEntries(sortedData);
      },
      (error) => console.error('Firestore error:', error),
    );

    return () => unsubscribe();
  }, [user]);

  const compressImage = (base64Str) =>
    new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        const MAX_SIDE = 800;
        if (width > height) {
          if (width > MAX_SIDE) {
            height *= MAX_SIDE / width;
            width = MAX_SIDE;
          }
        } else if (height > MAX_SIDE) {
          width *= MAX_SIDE / height;
          height = MAX_SIDE;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
    });

  const handleProfileSelect = (selected) => {
    setProfile(selected);
    localStorage.setItem('diary-profile', selected);
  };

  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsProcessingImage(true);
    const reader = new FileReader();

    reader.onload = async (loadEvent) => {
      try {
        const originalBase64 = loadEvent.target.result;
        const compressed = await compressImage(originalBase64);
        setSelectedImage(compressed);
      } catch (err) {
        console.error('Image processing error:', err);
        alert('이미지 처리 중 오류가 발생했습니다.');
      } finally {
        setIsProcessingImage(false);
      }
    };

    reader.onerror = () => {
      alert('이미지를 읽어오는데 실패했습니다.');
      setIsProcessingImage(false);
    };

    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if ((!inputText.trim() && !selectedImage) || !profile || !user || !db || isProcessingImage) return;

    setIsUploading(true);
    const todayStr = new Date().toLocaleDateString();

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'daily_notes'), {
        author: profile,
        content: inputText,
        image: selectedImage,
        createdAt: serverTimestamp(),
        userId: user.uid,
        dateStr: todayStr,
      });
      setInputText('');
      setSelectedImage(null);
    } catch (err) {
      console.error('Save error:', err);
      if (err.message.includes('bytes')) {
        alert('사진이 여전히 너무 큽니다. 다른 사진을 이용해 주세요.');
      } else {
        alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const today = new Date().toLocaleDateString();
  const todayEntries = entries.filter((entry) => entry.dateStr === today);
  const hasChirpWritten = todayEntries.some((entry) => entry.author === '삥아리');
  const hasMulggeWritten = todayEntries.some((entry) => entry.author === '물개');

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-emerald-50">
        <div className="animate-bounce text-emerald-600 font-bold text-xl flex flex-col items-center gap-2">
          <span className="text-4xl">🐸</span>
          폴짝 로딩 중...
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-emerald-50 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border-4 border-emerald-200">
          <div className="relative mb-4 inline-block">
            <div className="text-6xl">🐸</div>
            <Heart className="w-8 h-8 text-red-400 absolute -top-2 -right-2 fill-red-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold text-emerald-800 mb-2">개구리 연못 입구</h1>
          <p className="text-emerald-600/70 mb-8 italic">오늘의 추억을 심어볼까요? 🌱</p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => handleProfileSelect('삥아리')}
              className="flex flex-col items-center p-4 bg-yellow-50 hover:bg-yellow-100 rounded-2xl transition-all border-2 border-yellow-200 hover:border-yellow-400 shadow-sm active:scale-95"
            >
              <div className="text-4xl mb-2">🐥</div>
              <span className="font-bold text-yellow-700">삥아리</span>
            </button>
            <button
              onClick={() => handleProfileSelect('물개')}
              className="flex flex-col items-center p-4 bg-blue-50 hover:bg-blue-100 rounded-2xl transition-all border-2 border-blue-200 hover:border-blue-400 shadow-sm active:scale-95"
            >
              <div className="text-4xl mb-2">🦭</div>
              <span className="font-bold text-blue-700">물개</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!hasFirebaseConfig) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-emerald-200 shadow-md text-center">
          <div className="text-5xl mb-3">⚙️</div>
          <h2 className="text-xl font-bold text-emerald-900 mb-2">Firebase 설정이 필요해요</h2>
          <p className="text-sm text-emerald-700">
            `.env` 파일에 `VITE_FIREBASE_*` 값을 넣거나, 제공된 런타임 전역값(`__firebase_config`)으로 실행해 주세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-emerald-50 flex flex-col max-w-md mx-auto shadow-2xl font-sans border-x border-emerald-100 relative">
      <header className="bg-white p-6 pt-10 rounded-b-[40px] shadow-sm border-b border-emerald-100 flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-full text-emerald-600">
            <Leaf fill="currentColor" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-emerald-900 font-serif">연못 일기장</h1>
            <p className="text-xs text-emerald-600/60">싱그러운 우리의 하루 기록</p>
          </div>
        </div>
        <button
          onClick={() => setProfile(null)}
          className="text-xs font-medium text-emerald-400 hover:text-emerald-600 flex flex-col items-center transition-colors"
        >
          <User size={16} /> 변경
        </button>
      </header>

      <div className="px-6 py-4">
        <div className="bg-white/90 backdrop-blur rounded-2xl p-4 border border-emerald-100 flex justify-around shadow-sm items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 transition-all ${hasChirpWritten ? 'bg-yellow-100 border-yellow-400 scale-110 shadow-md' : 'bg-gray-50 border-gray-100 opacity-40'}`}
            >
              🐥
            </div>
            <span className={`text-[10px] font-bold ${hasChirpWritten ? 'text-yellow-600' : 'text-gray-400'}`}>삥아리</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="text-xl animate-bounce">🍀</div>
            <Heart size={16} className={hasChirpWritten && hasMulggeWritten ? 'fill-red-400 text-red-400' : 'text-gray-200'} />
          </div>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl border-2 transition-all ${hasMulggeWritten ? 'bg-blue-100 border-blue-400 scale-110 shadow-md' : 'bg-gray-50 border-gray-100 opacity-40'}`}
            >
              🦭
            </div>
            <span className={`text-[10px] font-bold ${hasMulggeWritten ? 'text-blue-600' : 'text-gray-400'}`}>물개</span>
          </div>
        </div>
      </div>

      <main className="flex-1 px-6 pb-24 overflow-y-auto space-y-6">
        {(profile === '삥아리' && !hasChirpWritten) || (profile === '물개' && !hasMulggeWritten) ? (
          <div className="bg-white rounded-3xl p-6 shadow-md border-2 border-emerald-100 overflow-hidden relative">
            <div className="absolute -top-4 -right-4 opacity-5 rotate-12 -z-0">
              <div className="text-8xl">🐸</div>
            </div>

            <div className="flex justify-between items-center mb-4 relative z-10">
              <label className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                <Sprout size={16} className="text-emerald-500" />
                {profile}님의 오늘의 잎새
              </label>

              <label
                htmlFor="photo-upload"
                className={`p-2.5 rounded-xl transition-all border shadow-sm cursor-pointer inline-flex items-center justify-center active:scale-90 ${isProcessingImage ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100'}`}
              >
                <Camera size={20} />
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                  disabled={isProcessingImage}
                />
              </label>
            </div>

            {(selectedImage || isProcessingImage) && (
              <div className="relative mb-4 rounded-2xl overflow-hidden border-2 border-emerald-50 shadow-inner z-10 bg-emerald-50/30 flex items-center justify-center min-h-[180px]">
                {isProcessingImage ? (
                  <div className="flex flex-col items-center gap-2 text-emerald-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-medium font-sans">사진 최적화 중...</span>
                  </div>
                ) : (
                  <>
                    <img src={selectedImage} alt="Preview" className="w-full h-auto max-h-[300px] object-contain block" />
                    <button
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white p-1.5 rounded-full backdrop-blur-sm hover:bg-black/70 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
              <textarea
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={selectedImage ? '사진에 담긴 이야기를 들려주세요! ✨' : '폴짝! 오늘 무슨 기분 좋은 일이 있었어? ❤️'}
                className="w-full bg-emerald-50/30 rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 border-emerald-100 border resize-none min-h-[90px]"
                maxLength={200}
              />
              <button
                type="submit"
                disabled={isUploading || isProcessingImage}
                className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all active:scale-95 shadow-lg ${isUploading || isProcessingImage ? 'bg-gray-200 text-gray-500 shadow-none' : 'bg-emerald-500 text-white shadow-emerald-200 hover:bg-emerald-600'}`}
              >
                {isUploading ? '연못에 심는 중...' : (
                  <>
                    <Send size={18} /> 기록 남기기
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-emerald-100/50 rounded-3xl p-6 border-2 border-emerald-200 text-center animate-in fade-in zoom-in duration-700">
            <div className="text-3xl mb-2">🌿</div>
            <p className="text-emerald-700 font-bold text-sm">오늘의 기록이 예쁘게 심어졌어요!</p>
            <p className="text-[11px] text-emerald-600 mt-1 italic">상대방의 소식도 곧 들려올 거예요.</p>
          </div>
        )}

        <div className="space-y-5 pt-4">
          <h3 className="text-sm font-bold text-emerald-800 flex items-center gap-2 px-1">
            <Calendar size={14} className="text-emerald-500" /> 연못의 추억 기록
          </h3>

          {entries.length === 0 ? (
            <div className="text-center py-16 opacity-40 grayscale">
              <div className="text-5xl mb-4">🐸💤</div>
              <p className="text-xs font-medium font-sans">아직 잠들어 있는 연못이에요. 첫 소식을 남겨보세요!</p>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-emerald-50 flex flex-col transition-all hover:shadow-md hover:border-emerald-100"
              >
                {entry.image && (
                  <div className="relative">
                    <img src={entry.image} alt="Diary" className="w-full h-auto max-h-[400px] object-contain bg-gray-50 block" />
                    <div className="absolute bottom-3 left-3 bg-white/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-emerald-700 shadow-sm border border-white">
                      📷 Memory
                    </div>
                  </div>
                )}
                <div className="p-5 flex gap-4 items-start">
                  <div
                    className={`flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shadow-sm border ${entry.author === '삥아리' ? 'bg-yellow-50 border-yellow-100' : 'bg-blue-50 border-blue-100'}`}
                  >
                    {entry.author === '삥아리' ? '🐥' : '🦭'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-[15px] text-emerald-900">{entry.author}</span>
                        <div className="w-1 h-1 bg-emerald-200 rounded-full"></div>
                        <span className="text-[10px] text-emerald-400 font-medium font-sans">연못 거주자</span>
                      </div>
                      <span className="text-[10px] text-emerald-300 font-medium font-sans">{entry.dateStr}</span>
                    </div>
                    <p className="text-[14px] text-emerald-800 leading-relaxed break-words whitespace-pre-wrap">{entry.content}</p>
                  </div>
                </div>
                <div className="px-5 pb-4 flex justify-end">
                  <div className="text-[10px] text-emerald-200 flex items-center gap-1">
                    <Heart size={10} className="fill-emerald-100" /> 소중한 하루
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <footer className="p-8 text-center pb-12">
        <div className="inline-block bg-white/80 backdrop-blur-lg px-6 py-2 rounded-full shadow-lg border border-emerald-50 text-[11px] font-bold text-emerald-600">
          개굴개굴 우리들의 사랑 이야기 ❤️
        </div>
      </footer>
    </div>
  );
};

export default App;
