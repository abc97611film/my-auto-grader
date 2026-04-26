import React, { useState, useMemo } from 'react';

// 定義標註符號
const MARK_OPTIONS = [
  { id: 'circle', symbol: '⭕' },
  { id: 'cross', symbol: '❌' },
  { id: 'triangle', symbol: '🔺' },
  { id: 'question', symbol: '❓' }
];

// 選項字母表
const ALPHABET = ['A', 'B', 'C', 'D', 'E'];

export default function App() {
  // 頁面狀態: 'setup', 'quiz', 'review', 'result'
  const [currentPage, setCurrentPage] = useState('setup');

  // 起始設定狀態
  const [totalQuestions, setTotalQuestions] = useState('');
  const [optionCount, setOptionCount] = useState(4); // 預設 4 個選項
  const [pointsPerQuestion, setPointsPerQuestion] = useState('');
  const [gradingMode, setGradingMode] = useState('all-at-once'); // 'per-question' 或 'all-at-once'
  const [rawAnswers, setRawAnswers] = useState('');

  // 處理後的正確解答陣列
  const [correctAnswers, setCorrectAnswers] = useState([]);

  // 作答狀態
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); // { 0: 'A', 1: 'C', ... }
  const [marks, setMarks] = useState({}); // { 0: 'circle', 1: 'question', ... }

  // 錯誤提示與彈出視窗狀態
  const [setupError, setSetupError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, isCorrect: false, correctAnswer: '' });
  const [showMarksModal, setShowMarksModal] = useState(false);

  // 解析正確答案 (只取英文字母並轉大寫)
  const parseAnswers = (text) => {
    return text.replace(/[^a-zA-Z]/g, '').toUpperCase().split('');
  };

  // 開始作答驗證
  const handleStart = () => {
    const qCount = parseInt(totalQuestions, 10);
    const pts = parseFloat(pointsPerQuestion);
    
    if (!qCount || qCount <= 0) {
      setSetupError('請輸入有效的總題數。');
      return;
    }
    if (!pts || pts <= 0) {
      setSetupError('請輸入有效的每題配分。');
      return;
    }

    const parsedAnswers = parseAnswers(rawAnswers);
    if (parsedAnswers.length < qCount) {
      setSetupError(`正確答案數量不足。您設定了 ${qCount} 題，但只偵測到 ${parsedAnswers.length} 個英文字母。`);
      return;
    }

    // 檢查是否有選項以外的字母 (例如選項設定為 3 (A,B,C)，答案卻出現 D)
    const validLetters = ALPHABET.slice(0, optionCount);
    const invalidAnswerIndex = parsedAnswers.slice(0, qCount).findIndex(ans => !validLetters.includes(ans));
    if (invalidAnswerIndex !== -1) {
      setSetupError(`偵測到無效答案 '${parsedAnswers[invalidAnswerIndex]}' 於第 ${invalidAnswerIndex + 1} 題。請確認答案字母是否符合您設定的選項數量（目前為 A 到 ${validLetters[validLetters.length - 1]}）。`);
      return;
    }

    setSetupError('');
    setCorrectAnswers(parsedAnswers.slice(0, qCount)); // 只取總題數的答案數量
    setUserAnswers({});
    setMarks({});
    setCurrentQuestionIndex(0);
    setCurrentPage('quiz');
  };

  // 選擇答案
  const handleSelectAnswer = (option) => {
    setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: option }));
  };

  // 選擇標註
  const handleToggleMark = (markId) => {
    setMarks(prev => {
      const newMarks = { ...prev };
      if (newMarks[currentQuestionIndex] === markId) {
        delete newMarks[currentQuestionIndex]; // 取消標註
      } else {
        newMarks[currentQuestionIndex] = markId;
      }
      return newMarks;
    });
  };

  // 下一題 / 作答完成
  const handleNext = () => {
    const isLastQuestion = currentQuestionIndex === correctAnswers.length - 1;
    
    // 如果是逐題批改且該題有作答，則顯示回饋
    if (gradingMode === 'per-question' && userAnswers[currentQuestionIndex]) {
      const isCorrect = userAnswers[currentQuestionIndex] === correctAnswers[currentQuestionIndex];
      setFeedbackModal({
        isOpen: true,
        isCorrect: isCorrect,
        correctAnswer: correctAnswers[currentQuestionIndex],
        isLast: isLastQuestion
      });
    } else {
      // 若無逐題批改，直接跳轉
      proceedToNext(isLastQuestion);
    }
  };

  const proceedToNext = (isLast) => {
    if (isLast) {
      setCurrentPage('review');
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  // 關閉逐題批改的彈出視窗並進入下一題
  const handleCloseFeedback = () => {
    const isLast = feedbackModal.isLast;
    setFeedbackModal({ isOpen: false, isCorrect: false, correctAnswer: '' });
    proceedToNext(isLast);
  };

  // 計算分數
  const resultData = useMemo(() => {
    if (currentPage !== 'result') return null;
    let correctCount = 0;
    const details = correctAnswers.map((correctAns, index) => {
      const userAns = userAnswers[index];
      const isCorrect = userAns === correctAns;
      if (isCorrect) correctCount++;
      return { questionNum: index + 1, userAns: userAns || '未作答', correctAns, isCorrect };
    });
    
    return {
      score: correctCount * parseFloat(pointsPerQuestion),
      totalScore: correctAnswers.length * parseFloat(pointsPerQuestion),
      details
    };
  }, [currentPage, correctAnswers, userAnswers, pointsPerQuestion]);

  // 渲染：起始頁面
  const renderSetupPage = () => (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md p-6 space-y-6">
      <h1 className="text-2xl font-bold text-center text-gray-800">答題自動批改 App</h1>
      
      {setupError && (
        <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
          {setupError}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">總題數</label>
          <input 
            type="text" 
            inputMode="numeric" 
            pattern="[0-9]*"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="例如: 50"
            value={totalQuestions}
            onChange={(e) => setTotalQuestions(e.target.value.replace(/[^0-9]/g, ''))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">選項數量</label>
          <div className="grid grid-cols-3 gap-2">
            {[3, 4, 5].map(num => (
              <button
                key={num}
                className={`py-2 rounded-lg font-medium transition-colors ${
                  optionCount === num 
                    ? 'bg-blue-600 text-white shadow' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                onClick={() => setOptionCount(num)}
              >
                {num} 個
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">每題配分</label>
          <input 
            type="text" 
            inputMode="numeric" 
            pattern="[0-9.]*"
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="例如: 2"
            value={pointsPerQuestion}
            onChange={(e) => setPointsPerQuestion(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">批改方式</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`py-2 rounded-lg font-medium transition-colors ${
                gradingMode === 'per-question' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setGradingMode('per-question')}
            >
              逐題批改
            </button>
            <button
              className={`py-2 rounded-lg font-medium transition-colors ${
                gradingMode === 'all-at-once' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              onClick={() => setGradingMode('all-at-once')}
            >
              作答完一次批改
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">正確答案貼上區</label>
          <textarea
            className="w-full p-3 border border-gray-300 rounded-lg h-24 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
            placeholder="貼上文字即可，系統會自動擷取英文字母作為答案。例如: 1.A 2.B 3.C ..."
            value={rawAnswers}
            onChange={(e) => setRawAnswers(e.target.value)}
          />
        </div>

        <button 
          onClick={handleStart}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 shadow transition-colors"
        >
          開始作答
        </button>
      </div>
    </div>
  );

  // 渲染：作答頁面
  const renderQuizPage = () => {
    const options = ALPHABET.slice(0, optionCount);
    const isLastQuestion = currentQuestionIndex === correctAnswers.length - 1;

    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md flex flex-col h-[90vh] overflow-hidden relative">
        {/* Header - 題號選單與標註 */}
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span className="font-medium text-gray-700">第</span>
            <select 
              value={currentQuestionIndex}
              onChange={(e) => setCurrentQuestionIndex(Number(e.target.value))}
              className="p-1 border border-gray-300 rounded outline-none font-bold text-blue-600"
            >
              {correctAnswers.map((_, idx) => (
                <option key={idx} value={idx}>{idx + 1}</option>
              ))}
            </select>
            <span className="font-medium text-gray-700">題 / 共 {correctAnswers.length} 題</span>
          </div>
        </div>

        {/* 標註區塊 */}
        <div className="p-4 flex justify-center space-x-4 border-b">
          {MARK_OPTIONS.map(mark => (
            <button
              key={mark.id}
              onClick={() => handleToggleMark(mark.id)}
              className={`text-2xl p-2 rounded-full transition-all ${
                marks[currentQuestionIndex] === mark.id 
                  ? 'bg-blue-100 scale-110 shadow-sm' 
                  : 'bg-gray-50 hover:bg-gray-100 grayscale opacity-50 hover:grayscale-0 hover:opacity-100'
              }`}
            >
              {mark.symbol}
            </button>
          ))}
        </div>

        {/* 選項區塊 */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto bg-gray-50/50">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => handleSelectAnswer(opt)}
              className={`w-full p-4 rounded-xl border-2 text-xl font-bold transition-all ${
                userAnswers[currentQuestionIndex] === opt
                  ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>

        {/* 底部按鈕 */}
        <div className="p-4 border-t bg-white flex justify-between items-center">
          <button 
            onClick={() => setShowMarksModal(true)}
            className="text-gray-600 font-medium hover:text-gray-800 px-3 py-2 rounded"
          >
            看標註題目
          </button>
          <button 
            onClick={handleNext}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow transition-colors"
          >
            {isLastQuestion ? '作答完成' : '下一題'}
          </button>
        </div>

        {/* 逐題批改彈出視窗 */}
        {feedbackModal.isOpen && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full text-center space-y-4 animate-scale-in">
              {feedbackModal.isCorrect ? (
                <div>
                  <div className="text-5xl mb-2">✅</div>
                  <h2 className="text-2xl font-bold text-green-600">答對了！</h2>
                </div>
              ) : (
                <div>
                  <div className="text-5xl mb-2">❌</div>
                  <h2 className="text-2xl font-bold text-red-600">答錯了</h2>
                  <p className="text-gray-600 mt-2 text-lg">正確答案是：<span className="font-bold text-red-600">{feedbackModal.correctAnswer}</span></p>
                </div>
              )}
              <button 
                onClick={handleCloseFeedback}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg mt-4 shadow"
              >
                {feedbackModal.isLast ? '進入檢查頁面' : '繼續下一題'}
              </button>
            </div>
          </div>
        )}

        {/* 標註列表彈出視窗 */}
        {showMarksModal && (
          <div className="absolute inset-0 bg-black/60 flex items-end justify-center z-40 transition-opacity">
            <div className="bg-white w-full max-h-[60%] rounded-t-2xl flex flex-col">
              <div className="p-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-bold">有標註的題目</h3>
                <button onClick={() => setShowMarksModal(false)} className="text-gray-500 text-xl font-bold p-2">&times;</button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto grid grid-cols-4 gap-3">
                {Object.keys(marks).length === 0 ? (
                  <p className="col-span-4 text-center text-gray-500 py-4">目前沒有任何標註</p>
                ) : (
                  Object.entries(marks).map(([idxStr, markId]) => {
                    const qIdx = parseInt(idxStr, 10);
                    const markSymbol = MARK_OPTIONS.find(m => m.id === markId)?.symbol;
                    return (
                      <button
                        key={qIdx}
                        onClick={() => {
                          setCurrentQuestionIndex(qIdx);
                          setShowMarksModal(false);
                        }}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex flex-col items-center justify-center hover:bg-blue-50 transition-colors"
                      >
                        <span className="text-sm text-gray-500 mb-1">第 {qIdx + 1} 題</span>
                        <span className="text-xl">{markSymbol}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染：檢查頁面
  const renderReviewPage = () => {
    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b bg-gray-50 text-center">
          <h2 className="text-xl font-bold text-gray-800">作答檢查</h2>
          <p className="text-sm text-gray-500 mt-1">請確認您的作答內容</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-2 text-gray-600">題號</th>
                <th className="py-2 text-gray-600">您的答案</th>
                <th className="py-2 text-gray-600">標註</th>
              </tr>
            </thead>
            <tbody>
              {correctAnswers.map((_, idx) => {
                const ans = userAnswers[idx];
                const markId = marks[idx];
                const markSymbol = markId ? MARK_OPTIONS.find(m => m.id === markId)?.symbol : '-';
                return (
                  <tr key={idx} className={`border-b border-gray-100 ${!ans ? 'bg-red-50' : ''}`}>
                    <td className="py-3 font-medium text-gray-700">{idx + 1}</td>
                    <td className={`py-3 font-bold ${!ans ? 'text-red-500' : 'text-blue-600'}`}>
                      {ans || '未作答'}
                    </td>
                    <td className="py-3 text-lg">{markSymbol}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t bg-white flex justify-between space-x-3">
          <button 
            onClick={() => setCurrentPage('quiz')}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 rounded-lg transition-colors"
          >
            修改答案
          </button>
          <button 
            onClick={() => setCurrentPage('result')}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow transition-colors"
          >
            交卷
          </button>
        </div>
      </div>
    );
  };

  // 渲染：結果頁面
  const renderResultPage = () => {
    if (!resultData) return null;
    const { score, totalScore, details } = resultData;

    return (
      <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-blue-600 text-center text-white">
          <h2 className="text-xl font-medium opacity-90">批改結果</h2>
          <div className="mt-2 flex items-baseline justify-center">
            <span className="text-5xl font-bold">{score}</span>
            <span className="text-xl ml-1 opacity-80">/ {totalScore} 分</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {details.map(item => (
            <div 
              key={item.questionNum} 
              className={`p-4 rounded-xl border-l-4 shadow-sm flex justify-between items-center ${
                item.isCorrect ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'
              }`}
            >
              <div className="flex items-center space-x-4">
                <span className="font-bold text-gray-500 w-8">#{item.questionNum}</span>
                <div>
                  <div className="text-xs text-gray-500 mb-1">您的答案</div>
                  <div className={`font-bold text-lg ${item.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                    {item.userAns}
                  </div>
                </div>
              </div>
              
              {!item.isCorrect && (
                <div className="text-right pl-4 border-l border-red-200">
                  <div className="text-xs text-gray-500 mb-1">正確答案</div>
                  <div className="font-bold text-lg text-green-600">
                    {item.correctAns}
                  </div>
                </div>
              )}
              
              {item.isCorrect && (
                <div className="text-2xl text-green-500 px-4">✓</div>
              )}
            </div>
          ))}
        </div>

        <div className="p-4 border-t bg-white">
          <button 
            onClick={() => {
              setCurrentPage('setup');
              setRawAnswers('');
              setTotalQuestions('');
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow transition-colors"
          >
            重新設定新測驗
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans text-gray-900">
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scaleIn 0.2s ease-out forwards;
        }
      `}} />
      
      {currentPage === 'setup' && renderSetupPage()}
      {currentPage === 'quiz' && renderQuizPage()}
      {currentPage === 'review' && renderReviewPage()}
      {currentPage === 'result' && renderResultPage()}
    </div>
  );
}