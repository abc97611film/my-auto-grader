import React, { useState, useMemo, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, setDoc, onSnapshot, deleteDoc } from 'firebase/firestore';

const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined' && __firebase_config) {
    return JSON.parse(__firebase_config);
  }
  return {
    apiKey: "AIzaSyDbY2XXc-gd27XrngbEdkf2hnAFBkh5D4U",
    authDomain: "my-auto-grader-1a658.firebaseapp.com",
    projectId: "my-auto-grader-1a658",
    storageBucket: "my-auto-grader-1a658.firebasestorage.app",
    messagingSenderId: "966517075493",
    appId: "1:966517075493:web:ad7deb77f0e7e1920659cc"
  };
};

let app, auth, db;
try {
  const config = getFirebaseConfig();
  if (config && config.apiKey) {
    app = initializeApp(config);
    auth = getAuth(app);
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
    });
  } else {
    console.warn("尚未設定 Firebase Config，本地端將無法使用雲端儲存功能。");
  }
} catch (e) {
  console.error("Firebase 初始化失敗:", e);
}

const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'auto-grader-app';

const MARK_OPTIONS = [
  { id: 'circle', symbol: '◯', colorClass: 'text-green-500' },
  { id: 'cross', symbol: '✕', colorClass: 'text-red-500' },
  { id: 'triangle', symbol: '△', colorClass: 'text-yellow-500' },
  { id: 'question', symbol: '？', colorClass: 'text-gray-500' }
];
const ALPHABET = ['A', 'B', 'C', 'D', 'E'];

const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [setupTab, setSetupTab] = useState('new');
  const [currentRecordId, setCurrentRecordId] = useState(null);
  const [recordName, setRecordName] = useState('');
  const [deleteModalId, setDeleteModalId] = useState(null);
  const [authError, setAuthError] = useState('');

  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState(null); 
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [currentPage, setCurrentPage] = useState('setup');

  const [totalQuestions, setTotalQuestions] = useState('');
  const [optionCount, setOptionCount] = useState(4);
  const [pointsPerQuestion, setPointsPerQuestion] = useState('');
  const [gradingMode, setGradingMode] = useState('all-at-once');
  const [rawAnswers, setRawAnswers] = useState('');
  const [correctAnswers, setCorrectAnswers] = useState([]);

  const [timerMode, setTimerMode] = useState('none'); 
  const [timeLimit, setTimeLimit] = useState(''); 
  const [timeSpent, setTimeSpent] = useState(0); 
  const [timeRemaining, setTimeRemaining] = useState(0); 
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef({ timeSpent: 0, timeRemaining: 0 });

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [marks, setMarks] = useState({});

  const [setupError, setSetupError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, isCorrect: false, correctAnswer: '' });
  const [showMarksModal, setShowMarksModal] = useState(false);

  useEffect(() => {
    let meta = document.querySelector("meta[name=viewport]");
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    meta.content = "width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, viewport-fit=cover";
  }, []);

  useEffect(() => {
    if (!auth) {
      setAuthError("尚未填寫 Firebase 金鑰 (apiKey等)，請檢查 VS Code 裡的程式碼是否已填妥！");
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (e) {
          console.error("無名氏登入失敗:", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!db || !user) return;
    const recordsRef = collection(db, 'artifacts', currentAppId, 'users', user.uid, 'quiz_records');
    const unsubscribe = onSnapshot(recordsRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => b.updatedAt - a.updatedAt);
      setRecords(data);
    }, (error) => {
      console.error("抓取紀錄失敗:", error);
      setAuthError(`資料讀取失敗：${error.message}。請確認 Firestore 是否為「測試模式」！`);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    timerRef.current = { timeSpent, timeRemaining };
  }, [timeSpent, timeRemaining]);

  useEffect(() => {
    let interval = null;
    if ((currentPage === 'quiz' || currentPage === 'review') && !isPaused && timerMode !== 'none') {
      interval = setInterval(() => {
        setTimeSpent(prev => prev + 1);
        if (timerMode === 'down') {
          setTimeRemaining(prev => Math.max(0, prev - 1));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentPage, isPaused, timerMode]);

  useEffect(() => {
    if (timerMode === 'down' && timeRemaining === 0 && (currentPage === 'quiz' || currentPage === 'review') && !isPaused) {
      if (db && user && currentRecordId) {
        const docRef = doc(db, 'artifacts', currentAppId, 'users', user.uid, 'quiz_records', currentRecordId);
        setDoc(docRef, { status: 'completed', updatedAt: Date.now() }, { merge: true }).catch(console.error);
      }
      setCurrentPage('result');
    }
  }, [timeRemaining, timerMode, currentPage, isPaused, db, user, currentRecordId]);

  useEffect(() => {
    if ((currentPage === 'quiz' || currentPage === 'review') && currentRecordId && db && user) {
      const docRef = doc(db, 'artifacts', currentAppId, 'users', user.uid, 'quiz_records', currentRecordId);
      setDoc(docRef, {
        recordName,
        totalQuestions,
        optionCount,
        pointsPerQuestion,
        gradingMode,
        correctAnswers,
        userAnswers,
        marks,
        currentQuestionIndex,
        timerMode,
        timeLimit,
        pdfUrl,
        timeSpent: timerRef.current.timeSpent,
        timeRemaining: timerRef.current.timeRemaining,
        status: 'in-progress',
        updatedAt: Date.now()
      }, { merge: true }).catch(console.error);
    }
  }, [userAnswers, marks, currentQuestionIndex, currentPage, currentRecordId, user, db, recordName, timerMode, timeLimit, pdfUrl]);

  useEffect(() => {
    let interval = null;
    if ((currentPage === 'quiz' || currentPage === 'review') && currentRecordId && db && user) {
      interval = setInterval(() => {
        const docRef = doc(db, 'artifacts', currentAppId, 'users', user.uid, 'quiz_records', currentRecordId);
        setDoc(docRef, {
          timeSpent: timerRef.current.timeSpent,
          timeRemaining: timerRef.current.timeRemaining,
          updatedAt: Date.now()
        }, { merge: true }).catch(console.error);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [currentPage, currentRecordId, db, user]);

  useEffect(() => {
    if (!pdfUrl) {
      setPdfViewerUrl(null);
      return;
    }
    if (pdfUrl.startsWith('data:application/pdf')) {
      const base64Data = pdfUrl.split(',')[1];
      const html = `
        <!DOCTYPE html>
        <html lang="zh-TW">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, viewport-fit=cover">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
          <style>
            body { margin: 0; padding: 0; background: #374151; display: flex; flex-direction: column; align-items: center; min-height: 100vh; overflow-x: hidden; }
            .page-container { margin-bottom: 8px; width: 100%; box-shadow: 0 4px 10px rgba(0,0,0,0.5); background: white; }
            canvas { width: 100% !important; height: auto !important; display: block; }
            #loading { color: #D1D5DB; margin-top: 40px; font-family: sans-serif; font-size: 15px; font-weight: bold; text-align: center; line-height: 1.5; }
            .spinner { margin: 10px auto; width: 30px; height: 30px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 1s ease-in-out infinite; }
            @keyframes spin { to { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div id="loading">
            <div class="spinner"></div>
            處理 PDF 中...<br><span style="font-size: 12px; font-weight: normal; opacity: 0.8">這可能會需要幾秒鐘</span>
          </div>
          <div id="container" style="width: 100%; display: flex; flex-direction: column; align-items: center;"></div>
          <script>
            try {
              pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
              const base64 = "${base64Data}";
              const binary = atob(base64);
              const array = new Uint8Array(binary.length);
              for(let i=0; i<binary.length; i++) array[i] = binary.charCodeAt(i);

              const container = document.getElementById('container');
              const loading = document.getElementById('loading');

              pdfjsLib.getDocument({data: array}).promise.then(pdf => {
                loading.style.display = 'none';
                for(let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                  const wrapper = document.createElement('div');
                  wrapper.className = 'page-container';
                  container.appendChild(wrapper);

                  pdf.getPage(pageNum).then(page => {
                    const viewport = page.getViewport({scale: 2.5}); 
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    wrapper.appendChild(canvas);
                    page.render({canvasContext: ctx, viewport: viewport});
                  });
                }
              }).catch(err => {
                loading.innerHTML = '載入失敗 ❌<br><span style="font-size: 12px; font-weight: normal;">檔案可能已損毀或無法解析</span>';
                console.error(err);
              });
            } catch (e) {
              document.getElementById('loading').innerHTML = '環境不支援 ❌';
            }
          </script>
        </body>
        </html>
      `;
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      setPdfViewerUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPdfViewerUrl(pdfUrl);
    }
  }, [pdfUrl]);

  const handleGoogleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google 登入失敗:", error);
      setAuthError(`彈出視窗被阻擋或登入失敗。請務必使用「手機原本的 Safari 或 Chrome」開啟網址，不要在 LINE 或 FB 裡面點開！`);
    }
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      window.location.reload(); 
    } catch (error) {
      console.error("登出失敗:", error);
    }
  };

  const resetSetup = () => {
    setRecordName('');
    setTotalQuestions('');
    setOptionCount(4);
    setPointsPerQuestion('');
    setGradingMode('all-at-once');
    setRawAnswers('');
    setTimerMode('none');
    setTimeLimit('');
    setTimeSpent(0);
    setTimeRemaining(0);
    setPdfUrl(null);
    setCurrentRecordId(null);
    setUserAnswers({});
    setMarks({});
    setCurrentQuestionIndex(0);
    setSetupError('');
    timerRef.current = { timeSpent: 0, timeRemaining: 0 };
  };

  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      if (file.size > 700 * 1024) {
        setSetupError('為配合免費資料庫限制，PDF 檔案大小不能超過 700KB。請先壓縮考卷檔案。');
        return;
      }
      setIsUploadingPdf(true);
      setSetupError('');

      const reader = new FileReader();
      reader.onloadend = () => {
        setPdfUrl(reader.result); 
        setIsUploadingPdf(false);
      };
      reader.onerror = () => {
        setSetupError('PDF 檔案讀取失敗，請重試。');
        setIsUploadingPdf(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const parseAnswers = (text) => text.replace(/[^a-zA-Z]/g, '').toUpperCase().split('');

  const handleStart = () => {
    if (!recordName.trim()) {
      setSetupError('請輸入本次作答紀錄名稱，以利後續查看進度。');
      return;
    }
    const qCount = parseInt(totalQuestions, 10);
    const pts = parseFloat(pointsPerQuestion);
    
    if (!qCount || qCount <= 0) { setSetupError('請輸入有效的總題數。'); return; }
    if (!pts || pts <= 0) { setSetupError('請輸入有效的每題配分。'); return; }

    const parsedAnswers = parseAnswers(rawAnswers);
    if (parsedAnswers.length < qCount) {
      setSetupError(`正確答案數量不足。設定了 ${qCount} 題，但只偵測到 ${parsedAnswers.length} 個英文字母。`);
      return;
    }

    const validLetters = ALPHABET.slice(0, optionCount);
    const invalidAnswerIndex = parsedAnswers.slice(0, qCount).findIndex(ans => !validLetters.includes(ans));
    if (invalidAnswerIndex !== -1) {
      setSetupError(`偵測到無效答案 '${parsedAnswers[invalidAnswerIndex]}' 於第 ${invalidAnswerIndex + 1} 題。請確認字母是否符合選項數量。`);
      return;
    }

    if (timerMode === 'down') {
      const limit = parseInt(timeLimit, 10);
      if (!limit || limit <= 0) {
        setSetupError('請輸入有效的倒計時時限（分鐘）。');
        return;
      }
      const newRemaining = Math.max(0, (limit * 60) - timeSpent);
      setTimeRemaining(newRemaining);
      timerRef.current.timeRemaining = newRemaining;
    } else {
      setTimeRemaining(0);
      timerRef.current.timeRemaining = 0;
    }

    if (!currentRecordId) {
      setUserAnswers({});
      setMarks({});
      setCurrentQuestionIndex(0);
      setTimeSpent(0);
      timerRef.current.timeSpent = 0;
      const newId = Date.now().toString();
      setCurrentRecordId(newId);
    }

    setSetupError('');
    setCorrectAnswers(parsedAnswers.slice(0, qCount));
    setIsPaused(false);
    setCurrentPage('quiz');
  };

  const handleSelectAnswer = (option) => {
    setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: option }));
  };

  const handleToggleMark = (markId) => {
    setMarks(prev => {
      const newMarks = { ...prev };
      if (newMarks[currentQuestionIndex] === markId) delete newMarks[currentQuestionIndex];
      else newMarks[currentQuestionIndex] = markId;
      return newMarks;
    });
  };

  const proceedToNext = (isLast) => {
    if (isLast) setCurrentPage('review');
    else setCurrentQuestionIndex(prev => prev + 1);
  };

  const handleNext = () => {
    const isLastQuestion = currentQuestionIndex === correctAnswers.length - 1;
    if (gradingMode === 'per-question' && userAnswers[currentQuestionIndex]) {
      const isCorrect = userAnswers[currentQuestionIndex] === correctAnswers[currentQuestionIndex];
      setFeedbackModal({ isOpen: true, isCorrect, correctAnswer: correctAnswers[currentQuestionIndex], isLast: isLastQuestion });
    } else {
      proceedToNext(isLastQuestion);
    }
  };

  const handleCloseFeedback = () => {
    const isLast = feedbackModal.isLast;
    setFeedbackModal({ isOpen: false, isCorrect: false, correctAnswer: '' });
    proceedToNext(isLast);
  };

  const handleSubmit = () => {
    if (db && user && currentRecordId) {
      const docRef = doc(db, 'artifacts', currentAppId, 'users', user.uid, 'quiz_records', currentRecordId);
      setDoc(docRef, { status: 'completed', updatedAt: Date.now() }, { merge: true }).catch(console.error);
    }
    setCurrentPage('result');
  };

  const resultData = useMemo(() => {
    if (!correctAnswers || correctAnswers.length === 0) return null;
    let correctCount = 0;
    const details = correctAnswers.map((correctAns, index) => {
      const userAns = userAnswers[index];
      const isCorrect = userAns === correctAns;
      if (isCorrect) correctCount++;
      const markOpt = marks[index] ? MARK_OPTIONS.find(m => m.id === marks[index]) : null;
      return { questionNum: index + 1, userAns: userAns || '未作答', correctAns, isCorrect, markOpt };
    });
    return {
      score: correctCount * parseFloat(pointsPerQuestion),
      totalScore: correctAnswers.length * parseFloat(pointsPerQuestion),
      details
    };
  }, [correctAnswers, userAnswers, pointsPerQuestion, marks]);

  const handleResumeRecord = (record) => {
    setRecordName(record.recordName || '');
    setTotalQuestions(record.totalQuestions);
    setOptionCount(record.optionCount);
    setPointsPerQuestion(record.pointsPerQuestion);
    setGradingMode(record.gradingMode);
    setCorrectAnswers(record.correctAnswers);
    setUserAnswers(record.userAnswers || {});
    setMarks(record.marks || {});
    setCurrentQuestionIndex(record.currentQuestionIndex || 0);
    setPdfUrl(record.pdfUrl || null);
    
    setTimerMode(record.timerMode || 'none');
    setTimeLimit(record.timeLimit || '');
    setTimeSpent(record.timeSpent || 0);
    setTimeRemaining(record.timeRemaining || 0);
    timerRef.current = { timeSpent: record.timeSpent || 0, timeRemaining: record.timeRemaining || 0 };
    
    setCurrentRecordId(record.id);
    setIsPaused(true); 
    setCurrentPage('quiz');
  };

  const handleEditRecord = (record) => {
    setRecordName(record.recordName || '');
    setTotalQuestions(record.totalQuestions || '');
    setOptionCount(record.optionCount || 4);
    setPointsPerQuestion(record.pointsPerQuestion || '');
    setGradingMode(record.gradingMode || 'all-at-once');
    
    if (record.correctAnswers) {
      setRawAnswers(record.correctAnswers.map((ans, i) => `${i + 1}.${ans}`).join(' '));
    } else {
      setRawAnswers('');
    }

    setTimerMode(record.timerMode || 'none');
    setTimeLimit(record.timeLimit || '');
    setTimeSpent(record.timeSpent || 0);
    setTimeRemaining(record.timeRemaining || 0);
    timerRef.current = { timeSpent: record.timeSpent || 0, timeRemaining: record.timeRemaining || 0 };
    
    setPdfUrl(record.pdfUrl || null);
    setUserAnswers(record.userAnswers || {});
    setMarks(record.marks || {});
    setCurrentQuestionIndex(record.currentQuestionIndex || 0);
    
    setCurrentRecordId(record.id);
    setSetupTab('new');
  };

  const handleViewResult = (record) => {
    setRecordName(record.recordName || '');
    setTotalQuestions(record.totalQuestions);
    setOptionCount(record.optionCount);
    setPointsPerQuestion(record.pointsPerQuestion);
    setGradingMode(record.gradingMode);
    setCorrectAnswers(record.correctAnswers);
    setUserAnswers(record.userAnswers || {});
    setMarks(record.marks || {});
    setPdfUrl(record.pdfUrl || null);
    
    setTimerMode(record.timerMode || 'none');
    setTimeSpent(record.timeSpent || 0);
    
    setCurrentRecordId(record.id);
    setCurrentPage('result');
  };

  const executeDelete = async () => {
    if (!db || !user || !deleteModalId) return;
    try {
      await deleteDoc(doc(db, 'artifacts', currentAppId, 'users', user.uid, 'quiz_records', deleteModalId));
    } catch (e) { console.error("刪除失敗:", e); }
    setDeleteModalId(null);
  };

  const renderSetupPage = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-xl p-6 flex flex-col max-h-[95vh] overflow-hidden relative z-10">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-800">選擇題自動批改</h1>
        {user && user.isAnonymous && (
          <button onClick={handleGoogleLogin} className="text-xs bg-blue-100 text-blue-700 font-bold px-3 py-1.5 rounded-full hover:bg-blue-200 transition shadow-sm">
            👉 登入跨裝置同步
          </button>
        )}
        {user && !user.isAnonymous && (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500 truncate max-w-[120px]">{user.email}</span>
            <button onClick={handleLogout} className="text-xs bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-full hover:bg-gray-300 transition">
              登出
            </button>
          </div>
        )}
      </div>
      
      <div className="flex border-b mb-6 shrink-0">
        <button onClick={() => { resetSetup(); setSetupTab('new'); }} className={`flex-1 py-3 font-bold transition-colors ${setupTab === 'new' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>📝 建立新測驗</button>
        <button onClick={() => setSetupTab('history')} className={`flex-1 py-3 font-bold transition-colors ${setupTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>📂 作答紀錄</button>
      </div>

      {setupError && (
        <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-lg text-sm font-medium shrink-0">
          {setupError}
        </div>
      )}

      {setupTab === 'new' && (
        <div className="space-y-4 overflow-y-auto pr-2 pb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">本次作答紀錄名稱</label>
            <input 
              type="text" 
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如: 第一次期中考練習"
              value={recordName}
              onChange={(e) => setRecordName(e.target.value)}
            />
          </div>
          
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
            <label className="block text-sm font-bold text-blue-800 mb-1">上傳題目 PDF 檔</label>
            <input 
              type="file" 
              accept="application/pdf"
              onChange={handlePdfUpload}
              disabled={isUploadingPdf}
              className="w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer disabled:opacity-50"
            />
            {isUploadingPdf && <span className="text-xs text-blue-600 mt-2 block font-bold animate-pulse">⏳ PDF 轉換中... 請稍候</span>}
            {!isUploadingPdf && pdfUrl && <span className="text-xs text-green-600 mt-2 block font-bold">✓ PDF 已成功上傳</span>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">總題數</label>
            <input 
              type="text" inputMode="numeric" pattern="[0-9]*"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如: 50" value={totalQuestions} onChange={(e) => setTotalQuestions(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">選項數量</label>
            <div className="grid grid-cols-3 gap-2">
              {[3, 4, 5].map(num => (
                <button key={num} className={`py-2 rounded-lg font-medium transition ${optionCount === num ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => setOptionCount(num)}>{num} 個</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">每題配分</label>
            <input 
              type="text" inputMode="numeric" pattern="[0-9.]*"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="例如: 2" value={pointsPerQuestion} onChange={(e) => setPointsPerQuestion(e.target.value.replace(/[^0-9.]/g, ''))}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">計時設定</label>
            <div className="grid grid-cols-3 gap-2">
              <button className={`py-2 rounded-lg font-medium transition ${timerMode === 'none' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => setTimerMode('none')}>不計時</button>
              <button className={`py-2 rounded-lg font-medium transition ${timerMode === 'up' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => setTimerMode('up')}>正計時</button>
              <button className={`py-2 rounded-lg font-medium transition ${timerMode === 'down' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => setTimerMode('down')}>倒計時</button>
            </div>
            {timerMode === 'down' && (
              <div className="mt-2">
                <input 
                  type="text" inputMode="numeric" pattern="[0-9]*"
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="請輸入時限 (分鐘)" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value.replace(/[^0-9]/g, ''))}
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">批改方式</label>
            <div className="grid grid-cols-2 gap-2">
              <button className={`py-2 rounded-lg font-medium transition ${gradingMode === 'per-question' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => setGradingMode('per-question')}>逐題批改</button>
              <button className={`py-2 rounded-lg font-medium transition ${gradingMode === 'all-at-once' ? 'bg-blue-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`} onClick={() => setGradingMode('all-at-once')}>作答完一次批改</button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">正確答案貼上區</label>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="貼上文字即可，系統會自動擷取英文字母作為答案。例如: 1.A 2.B 3.C ..."
              value={rawAnswers} onChange={(e) => setRawAnswers(e.target.value)}
            />
          </div>
          <button onClick={handleStart} disabled={isUploadingPdf} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg shadow transition mt-2 shrink-0">開始作答</button>
        </div>
      )}

      {setupTab === 'history' && (
        <div className="flex-1 overflow-y-auto pr-2 space-y-3 pb-4">
          {authError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex flex-col items-center text-center">
              <span className="text-3xl mb-2">⚠️</span>
              <p className="font-bold mb-1">連線雲端發生問題</p>
              <p className="text-sm">{authError}</p>
            </div>
          )}
          
          {!authError && !user && <div className="text-center text-gray-500 py-8">正在連線至雲端...</div>}
          {!authError && user && records.length === 0 && <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-200 rounded-xl">目前還沒有任何紀錄喔！</div>}
          
          {!authError && records.map(record => {
            let displayStatus = 'in-progress';
            let statusColor = 'bg-yellow-100 text-yellow-700';
            let statusText = '作答中';

            if (record.status === 'completed') {
              displayStatus = 'completed';
              statusColor = 'bg-green-100 text-green-700';
              statusText = '已完成';
            } else if (!record.userAnswers || Object.keys(record.userAnswers).length === 0) {
              displayStatus = 'not-started';
              statusColor = 'bg-red-100 text-red-700';
              statusText = '未開始';
            }

            let scoreDisplay = null;
            if (displayStatus === 'completed' && record.correctAnswers && record.pointsPerQuestion) {
              let correctCount = 0;
              record.correctAnswers.forEach((ans, idx) => {
                if (record.userAnswers && record.userAnswers[idx] === ans) {
                  correctCount++;
                }
              });
              const score = correctCount * parseFloat(record.pointsPerQuestion);
              const totalScore = record.correctAnswers.length * parseFloat(record.pointsPerQuestion);
              scoreDisplay = `${score} / ${totalScore} 分`;
            }

            return (
              <div key={record.id} className="p-4 border border-gray-200 rounded-xl bg-gray-50 shadow-sm flex flex-col space-y-3">
                <div className="flex justify-between items-start space-x-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-gray-800 text-lg break-words">{record.recordName || '未命名測驗'}</h3>
                    <p className="text-xs text-gray-500">{new Date(record.updatedAt).toLocaleString()}</p>
                    {scoreDisplay && <p className="text-sm font-bold text-blue-600 mt-1">得分: {scoreDisplay}</p>}
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded whitespace-nowrap shrink-0 ${statusColor}`}>
                    {statusText}
                  </span>
                </div>
                <div className="flex justify-end space-x-2 border-t border-gray-200 pt-3">
                  {displayStatus === 'completed' ? (
                    <button onClick={() => handleViewResult(record)} className="text-sm bg-gray-800 hover:bg-black text-white font-bold px-4 py-2 rounded-lg transition">查看結果</button>
                  ) : (
                    <>
                      <button onClick={() => handleEditRecord(record)} className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold px-4 py-2 rounded-lg transition">修改</button>
                      <button onClick={() => handleResumeRecord(record)} className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg transition">繼續作答</button>
                    </>
                  )}
                  <button onClick={() => setDeleteModalId(record.id)} className="text-sm bg-red-100 hover:bg-red-200 text-red-700 font-bold px-4 py-2 rounded-lg transition">刪除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderPausedScreen = () => (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col items-center justify-center bg-white space-y-8 z-[100] p-4">
      <div className="text-6xl mb-2 animate-pulse">⏸️</div>
      <h2 className="text-3xl font-bold text-gray-800">作答已暫停</h2>
      
      <div className="w-full max-w-sm flex flex-row items-stretch justify-center gap-4">
        {timerMode !== 'none' && (
          <div className="bg-gray-100 flex-1 px-4 py-4 rounded-xl text-center flex flex-col justify-center">
            <p className="text-gray-500 text-sm mb-1">{timerMode === 'down' ? '剩餘時間' : '已耗時'}</p>
            <p className={`font-mono text-3xl font-bold ${timerMode === 'down' && timeRemaining <= 60 ? 'text-red-600' : 'text-gray-800'}`}>
              {timerMode === 'down' ? formatTime(timeRemaining) : formatTime(timeSpent)}
            </p>
          </div>
        )}
        <button onClick={() => setIsPaused(false)} className="bg-blue-600 hover:bg-blue-700 text-white flex-1 py-4 rounded-xl font-bold shadow-lg transition text-xl flex items-center justify-center">
          繼續作答
        </button>
      </div>

      <button onClick={() => { setIsPaused(false); setCurrentPage('setup'); setSetupTab('history'); }} className="text-gray-500 hover:text-gray-800 font-bold px-6 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg mt-4 transition">
        回首頁 (保留進度)
      </button>
    </div>
  );

  const renderQuizPage = () => {
    const options = ALPHABET.slice(0, optionCount);
    const isLastQuestion = currentQuestionIndex === correctAnswers.length - 1;

    return (
      <>
        {/* --- 電腦版 UI --- */}
        <div className="hidden lg:flex w-full h-full flex-col overflow-hidden bg-white">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center space-x-2 shrink-0">
            <div className="flex flex-col flex-1 min-w-0 pr-2">
               <span className="text-sm font-bold text-blue-600 mb-1 leading-tight break-words">
                 {recordName}
                 <span className="block mt-0.5 text-xs opacity-75 font-normal">(自動儲存中)</span>
               </span>
               <div className="flex items-center space-x-2">
                 <span className="font-medium text-gray-700">第</span>
                 <select value={currentQuestionIndex} onChange={(e) => setCurrentQuestionIndex(Number(e.target.value))} className="p-1 border border-gray-300 rounded outline-none font-bold text-blue-600">
                   {correctAnswers.map((_, idx) => <option key={idx} value={idx}>{idx + 1}</option>)}
                 </select>
                 <span className="font-medium text-gray-700">題 / {correctAnswers.length} 題</span>
               </div>
            </div>
            
            {timerMode !== 'none' && (
              <div className="flex flex-col items-end justify-center px-4 border-r border-gray-200 mr-2 shrink-0">
                <span className={`font-mono font-bold text-lg leading-none ${timerMode === 'down' && timeRemaining <= 60 ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
                  {timerMode === 'down' ? formatTime(timeRemaining) : formatTime(timeSpent)}
                </span>
                <button onClick={() => setIsPaused(true)} className="text-xs text-blue-600 hover:text-blue-800 font-bold mt-1">⏸ 暫停</button>
              </div>
            )}

            <button 
              onClick={() => { setCurrentPage('setup'); setSetupTab('history'); }} 
              className="flex items-center justify-center w-10 h-10 bg-white border border-gray-200 hover:bg-gray-100 text-gray-800 rounded-full shadow-sm transition-all shrink-0"
              title="回首頁"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </button>
          </div>

          <div className="p-4 flex justify-center space-x-4 border-b shrink-0">
            {MARK_OPTIONS.map(mark => (
              <button 
                key={mark.id} 
                onClick={() => handleToggleMark(mark.id)} 
                className={`text-2xl w-12 h-12 flex items-center justify-center rounded-full transition-all font-bold ${marks[currentQuestionIndex] === mark.id ? 'bg-blue-100 scale-110 shadow-md opacity-100 ' + mark.colorClass : 'bg-gray-50 hover:bg-gray-100 opacity-40 hover:opacity-100 ' + mark.colorClass}`}
              >
                {mark.symbol}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-gray-50/50">
            {options.map(opt => (
              <button key={opt} onClick={() => handleSelectAnswer(opt)} className={`w-full p-4 rounded-xl border-2 text-xl font-bold transition ${userAnswers[currentQuestionIndex] === opt ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-gray-50'}`}>{opt}</button>
            ))}
          </div>

          <div className="p-4 border-t bg-white flex justify-between items-center shrink-0">
            <button onClick={() => setShowMarksModal(true)} className="text-gray-600 font-medium hover:text-gray-800 px-3 py-2 rounded">看標註題目</button>
            <button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow transition">{isLastQuestion ? '作答完成' : '下一題'}</button>
          </div>
        </div>

        {/* --- 手機版 UI --- */}
        <div className="flex lg:hidden w-full flex-col bg-white">
          <div className="px-3 py-2 flex justify-between items-center shrink-0 border-b border-gray-200 bg-gray-50">
            <div className="font-bold text-black text-sm flex items-center">
              <span>第</span>
              <select 
                value={currentQuestionIndex} 
                onChange={(e) => setCurrentQuestionIndex(Number(e.target.value))} 
                className="mx-1 p-0 bg-transparent outline-none text-black font-bold appearance-none underline decoration-gray-400 text-center text-lg"
              >
                {correctAnswers.map((_, idx) => <option key={idx} value={idx}>{idx + 1}</option>)}
              </select>
              <span>題 / {correctAnswers.length}</span>
            </div>

            <div className="flex items-center gap-3">
              {timerMode !== 'none' && (
                <div className="flex items-center gap-2 mr-2 border-r border-gray-300 pr-3">
                  <span className={`font-mono font-bold text-lg ${timerMode === 'down' && timeRemaining <= 60 ? 'text-red-600 animate-pulse' : 'text-gray-800'}`}>
                    {timerMode === 'down' ? formatTime(timeRemaining) : formatTime(timeSpent)}
                  </span>
                  <button onClick={() => setIsPaused(true)} className="bg-gray-200 hover:bg-gray-300 text-blue-700 px-3 py-1 rounded-md font-bold text-sm active:scale-95 transition-transform shadow-sm">⏸ 暫停</button>
                </div>
              )}
              <button 
                onClick={() => { setCurrentPage('setup'); setSetupTab('history'); }} 
                className="flex items-center justify-center w-8 h-8 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-full shadow-sm transition-all shrink-0"
                title="回首頁"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </button>
            </div>
          </div>
          
          {/* 作答區：單一橫排佈局 (左：標註區，中：選項，右：交卷) */}
          <div className="w-full flex flex-row items-center justify-between px-2 py-2 bg-[#F8F9FA] shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            
            {/* 左側：標註及看標註按鈕 */}
            <div className="flex-1 flex flex-col items-start justify-center gap-1 min-w-0 pr-1">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {MARK_OPTIONS.map(mark => (
                  <button 
                    key={mark.id} 
                    onClick={() => handleToggleMark(mark.id)} 
                    className={`text-[20px] sm:text-[22px] leading-none font-bold transition-all active:scale-90 bg-transparent ${
                      marks[currentQuestionIndex] === mark.id 
                      ? 'scale-125 drop-shadow-md opacity-100 ' + mark.colorClass 
                      : 'opacity-40 grayscale hover:opacity-100 hover:grayscale-0 ' + mark.colorClass
                    }`}
                  >
                    {mark.symbol}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowMarksModal(true)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] font-bold py-1 px-2 rounded-md shadow-sm active:scale-95 transition-transform mt-1">
                看標註
              </button>
            </div>

            {/* 中間：選項置中 */}
            <div className="shrink-0 flex flex-row items-center justify-center gap-1.5 px-1">
              {options.map(opt => (
                <button 
                  key={opt} 
                  onClick={() => handleSelectAnswer(opt)} 
                  className={`w-[42px] h-[55px] sm:w-[48px] sm:h-[60px] rounded-xl text-2xl font-extrabold flex items-center justify-center transition-all shrink-0 shadow-sm active:scale-95 ${
                    userAnswers[currentQuestionIndex] === opt 
                    ? 'bg-[#3B82F6] text-white border-none' 
                    : 'bg-white text-gray-700 border-2 border-gray-200'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {/* 右側：交卷靠右 */}
            <div className="flex-1 flex justify-end items-center min-w-0 pl-1">
              <button onClick={handleNext} className="bg-[#3B82F6] hover:bg-blue-600 text-white font-bold h-[55px] sm:h-[60px] px-3 sm:px-4 rounded-xl shadow-sm transition whitespace-nowrap text-sm sm:text-base active:scale-95">
                {isLastQuestion ? '交卷' : '下一題'}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderReviewPage = () => {
    return (
      <>
        {/* --- 電腦版 UI --- */}
        <div className="hidden lg:flex w-full h-full flex-col overflow-hidden bg-white">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center shrink-0">
            <div className="text-left">
              <h2 className="text-xl font-bold text-gray-800">作答檢查</h2>
              <p className="text-sm text-gray-500 mt-1 truncate">{recordName}</p>
            </div>
            {timerMode !== 'none' && (
              <div className="flex flex-col items-end">
                <span className={`font-mono font-bold text-lg ${timerMode === 'down' && timeRemaining <= 60 ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
                  {timerMode === 'down' ? formatTime(timeRemaining) : formatTime(timeSpent)}
                </span>
                <button onClick={() => setIsPaused(true)} className="text-xs text-blue-600 hover:text-blue-800 font-bold mt-1">⏸ 暫停</button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <table className="w-full text-center border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-2 text-gray-600">題號</th>
                  <th className="py-2 text-gray-600">答案</th>
                  <th className="py-2 text-gray-600">標註</th>
                </tr>
              </thead>
              <tbody>
                {correctAnswers.map((_, idx) => {
                  const ans = userAnswers[idx];
                  const markOpt = marks[idx] ? MARK_OPTIONS.find(m => m.id === marks[idx]) : null;
                  return (
                    <tr key={idx} className={`border-b border-gray-100 ${!ans ? 'bg-red-50' : ''}`}>
                      <td className="py-3 font-medium text-gray-700">{idx + 1}</td>
                      <td className={`py-3 font-bold ${!ans ? 'text-red-500' : 'text-blue-600'}`}>{ans || '未作答'}</td>
                      <td className={`py-3 text-lg font-bold ${markOpt?.colorClass || ''}`}>{markOpt ? markOpt.symbol : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t bg-white flex justify-between space-x-3 shrink-0">
            <button onClick={() => setCurrentPage('quiz')} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition">修改答案</button>
            <button onClick={handleSubmit} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow transition">交卷</button>
          </div>
        </div>

        {/* --- 手機版 UI --- */}
        <div className="flex lg:hidden w-full flex-col bg-[#F8F9FA]">
          <div className="px-4 py-2 flex justify-between items-center shrink-0 border-b border-gray-200 bg-white">
            <div className="flex flex-col flex-1 min-w-0 pr-2">
              <span className="text-xs text-gray-400">作答檢查</span>
              <span className="font-bold text-gray-800 text-sm truncate w-full">{recordName}</span>
            </div>
            <div className="flex gap-2 shrink-0 items-center">
              {timerMode !== 'none' && (
                <div className="flex flex-col items-end mr-1 border-r border-gray-200 pr-2">
                  <span className={`font-mono font-bold text-xs ${timerMode === 'down' && timeRemaining <= 60 ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
                    {timerMode === 'down' ? formatTime(timeRemaining) : formatTime(timeSpent)}
                  </span>
                  <button onClick={() => setIsPaused(true)} className="text-[10px] text-blue-600 font-bold">⏸ 暫停</button>
                </div>
              )}
              <button onClick={() => setCurrentPage('quiz')} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-3 py-1.5 rounded transition text-xs">修改</button>
              <button onClick={handleSubmit} className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded shadow transition text-xs">交卷</button>
            </div>
          </div>

          <div className="w-full flex flex-row items-center px-4 py-4 gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden bg-gray-50">
            {correctAnswers.map((_, idx) => {
              const ans = userAnswers[idx];
              const markOpt = marks[idx] ? MARK_OPTIONS.find(m => m.id === marks[idx]) : null;
              return (
                <div key={idx} onClick={() => {setCurrentQuestionIndex(idx); setCurrentPage('quiz');}} className={`flex flex-col items-center justify-center w-20 h-24 shrink-0 rounded-xl border shadow-sm cursor-pointer ${!ans ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200 hover:border-blue-300'}`}>
                  <span className="text-xs text-gray-500 mb-1">第 {idx + 1} 題</span>
                  <span className={`text-2xl font-bold ${!ans ? 'text-red-500' : 'text-blue-600'}`}>{ans || '無'}</span>
                  <span className={`text-sm mt-1 font-bold ${markOpt?.colorClass || 'text-transparent'}`}>{markOpt ? markOpt.symbol : ' '}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  const renderResultPage = () => {
    if (!resultData) return null;
    const { score, totalScore, details } = resultData;

    return (
      <>
        {/* --- 電腦版 UI --- */}
        <div className="hidden lg:flex w-full h-full flex-col overflow-hidden bg-white">
          <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-blue-600 text-center text-white relative shrink-0">
             <h2 className="text-lg font-medium opacity-90 truncate">{recordName}</h2>
             <div className="flex items-baseline justify-center mt-1">
              <span className="text-4xl font-bold">{score}</span>
              <span className="text-lg ml-1 opacity-80">/ {totalScore} 分</span>
            </div>
            {timerMode !== 'none' && (
              <div className="mt-2 text-sm opacity-90 font-mono bg-blue-700/30 inline-block px-3 py-1 rounded-full">
                總耗時: {formatTime(timeSpent)}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {details.map(item => (
              <div key={item.questionNum} className={`p-4 rounded-xl border-l-4 shadow-sm flex justify-between items-center ${item.isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-gray-500 w-8">#{item.questionNum}</span>
                  <div className="w-6 text-center shrink-0">
                    {item.markOpt && (
                      <span className={`text-xl font-bold ${item.markOpt.colorClass}`}>{item.markOpt.symbol}</span>
                    )}
                  </div>
                  <div className="pl-2">
                    <div className="text-xs text-gray-500 mb-1">您的答案</div>
                    <div className={`font-bold text-lg ${item.isCorrect ? 'text-green-700' : 'text-red-600'}`}>{item.userAns}</div>
                  </div>
                </div>
                {!item.isCorrect && (
                  <div className="text-right pl-4 border-l border-red-200">
                    <div className="text-xs text-gray-500 mb-1">正確答案</div>
                    <div className="font-bold text-lg text-green-600">{item.correctAns}</div>
                  </div>
                )}
                {item.isCorrect && <div className="text-2xl text-green-500 px-4">✓</div>}
              </div>
            ))}
          </div>

          <div className="p-4 border-t bg-white flex space-x-3 shrink-0">
            <button onClick={() => { setCurrentPage('setup'); setSetupTab('history'); }} className="flex-1 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-bold py-3 rounded-lg transition">回列表</button>
            <button 
              onClick={() => { resetSetup(); setSetupTab('new'); setCurrentPage('setup'); }}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow transition"
            >
              新測驗
            </button>
          </div>
        </div>

        {/* --- 手機版 UI --- */}
        <div className="flex lg:hidden w-full flex-col bg-[#F8F9FA]">
          <div className="px-4 py-2 flex justify-between items-center shrink-0 border-b border-gray-200 bg-white">
             <div className="flex flex-col flex-1 min-w-0 pr-2">
               <span className="text-xs text-gray-500 truncate">{recordName}</span>
               <div className="flex items-baseline mt-0.5">
                <span className="text-lg font-bold text-blue-600">{score}</span>
                <span className="text-xs ml-1 text-gray-500">/ {totalScore} 分</span>
              </div>
              {timerMode !== 'none' && (
                <div className="text-[10px] mt-0.5 text-gray-400 font-mono">
                  耗時: {formatTime(timeSpent)}
                </div>
              )}
             </div>
             <div className="flex gap-2 shrink-0">
              <button onClick={() => { setCurrentPage('setup'); setSetupTab('history'); }} className="border border-blue-600 text-blue-600 font-bold px-3 py-1.5 rounded transition text-xs bg-white">列表</button>
              <button onClick={() => { resetSetup(); setSetupTab('new'); setCurrentPage('setup'); }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded shadow transition text-xs">新測驗</button>
             </div>
          </div>

          <div className="w-full flex flex-row items-center px-4 py-4 gap-3 overflow-x-auto [&::-webkit-scrollbar]:hidden bg-gray-50">
            {details.map(item => (
              <div key={item.questionNum} className={`relative overflow-hidden flex flex-col items-center justify-center w-[100px] h-28 shrink-0 rounded-xl border shadow-sm ${item.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex w-full px-2 justify-between items-center mb-1 z-10">
                  <span className="text-xs font-bold text-gray-500">#{item.questionNum}</span>
                  <span className={`text-xs font-bold ${item.markOpt?.colorClass || 'text-transparent'}`}>{item.markOpt ? item.markOpt.symbol : ' '}</span>
                </div>
                
                <div className="flex items-center justify-center gap-2 mt-1 z-10">
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-400">你答</span>
                    <span className={`text-xl font-bold ${item.isCorrect ? 'text-green-700' : 'text-red-600'}`}>{item.userAns}</span>
                  </div>
                  {!item.isCorrect && (
                    <>
                      <span className="text-gray-300 text-xs">|</span>
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400">正確</span>
                        <span className="text-xl font-bold text-green-600">{item.correctAns}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  return (
    <div className={`min-h-[100dvh] bg-gray-100 font-sans text-gray-900 relative ${currentPage === 'setup' ? 'flex items-center justify-center p-4' : 'flex flex-col lg:flex-row w-screen h-[100dvh] overflow-hidden'}`}>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scaleIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .animate-scale-in { animation: scaleIn 0.2s ease-out forwards; }
      `}} />
      
      {currentPage === 'setup' && renderSetupPage()}

      {/* 【強制橫向封鎖器】：直向時強制擋住畫面要求翻轉 */}
      {currentPage !== 'setup' && (
        <div className="hidden max-lg:portrait:flex fixed inset-0 z-[9999] bg-gray-900 text-white flex-col items-center justify-center p-6 text-center">
          <div className="text-6xl mb-6 animate-pulse" style={{ transform: 'rotate(-90deg)' }}>📱</div>
          <h2 className="text-2xl font-bold mb-2">請將手機轉為橫向</h2>
          <p className="text-gray-400">本測驗系統強制使用橫向顯示，以提供最佳作答體驗。</p>
        </div>
      )}

      {currentPage !== 'setup' && isPaused && renderPausedScreen()}

      {currentPage !== 'setup' && !isPaused && (
        <>
          <div 
            className="flex-1 w-full lg:h-full bg-gray-800 flex flex-col items-center justify-center relative z-0 overflow-hidden"
          >
            {pdfViewerUrl ? (
              <div className="w-full h-full flex flex-col relative">
                <iframe src={pdfViewerUrl} className="w-full flex-1 border-none bg-gray-800" title="PDF Viewer" />
              </div>
            ) : (
              <div className="text-gray-300 flex flex-col items-center justify-center p-6 text-center w-full h-full border-4 border-dashed border-gray-600 m-4 rounded-xl max-w-md max-h-[80%]">
                <span className="text-4xl mb-4">📄</span>
                <p className="mb-2 font-bold text-lg text-white">尚未上傳題目 PDF</p>
                <p className="mb-6 text-sm text-gray-400">尚未上傳題目 PDF，請至作答紀錄中修改上傳</p>
              </div>
            )}
          </div>

          <div 
            className="shrink-0 h-auto max-h-[50dvh] w-full lg:max-h-none lg:h-full lg:w-[400px] lg:min-w-[400px] bg-white shadow-[0_-5px_15px_rgba(0,0,0,0.1)] lg:shadow-[-5px_0_15px_rgba(0,0,0,0.05)] flex flex-col relative z-10"
          >
            {currentPage === 'quiz' && renderQuizPage()}
            {currentPage === 'review' && renderReviewPage()}
            {currentPage === 'result' && renderResultPage()}
          </div>
        </>
      )}

      {feedbackModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full text-center space-y-4 animate-scale-in">
            {feedbackModal.isCorrect ? (
              <div><div className="text-5xl mb-2">✅</div><h2 className="text-2xl font-bold text-green-600">答對了！</h2></div>
            ) : (
              <div><div className="text-5xl mb-2">❌</div><h2 className="text-2xl font-bold text-red-600">答錯了</h2><p className="text-gray-600 mt-2 text-lg">正確答案是：<span className="font-bold text-red-600">{feedbackModal.correctAnswer}</span></p></div>
            )}
            <button onClick={handleCloseFeedback} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 shadow">{feedbackModal.isLast ? '進入檢查頁面' : '繼續下一題'}</button>
          </div>
        </div>
      )}

      {showMarksModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-40 transition-opacity">
          <div className="bg-white w-full lg:w-[400px] lg:relative lg:rounded-xl lg:mb-10 max-h-[60%] rounded-t-2xl flex flex-col mx-auto shadow-2xl">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">有標註的題目</h3>
              <button onClick={() => setShowMarksModal(false)} className="text-gray-500 text-xl font-bold p-2">&times;</button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto grid grid-cols-4 gap-3">
              {Object.keys(marks).length === 0 ? <p className="col-span-4 text-center text-gray-500 py-4">目前沒有任何標註</p> : (
                Object.entries(marks).map(([idxStr, markId]) => {
                  const qIdx = parseInt(idxStr, 10);
                  const markOpt = MARK_OPTIONS.find(m => m.id === markId);
                  return (
                    <button key={qIdx} onClick={() => { setCurrentQuestionIndex(qIdx); setShowMarksModal(false); }} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-col items-center justify-center hover:bg-blue-50 transition">
                      <span className="text-sm text-gray-500 mb-1">第 {qIdx + 1} 題</span>
                      <span className={`text-xl font-bold ${markOpt?.colorClass || ''}`}>{markOpt?.symbol}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {deleteModalId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full text-center space-y-4 animate-scale-in">
            <div className="text-5xl mb-2">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-800">確定要刪除？</h2>
            <p className="text-gray-600">刪除後將無法復原此筆作答紀錄。</p>
            <div className="flex space-x-3 mt-4">
              <button onClick={() => setDeleteModalId(null)} className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition">取消</button>
              <button onClick={executeDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition">確定刪除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
