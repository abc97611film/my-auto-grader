// ... existing code ...
  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      window.location.reload(); 
    } catch (error) {
      console.error("登出失敗:", error);
    }
  };

  const handlePdfUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
    }
  };

  // 修改：將 # 號加入合法讀取範圍，以免答案數量短少
  const parseAnswers = (text) => text.replace(/[^a-zA-Z#]/g, '').toUpperCase().split('');

  const handleStart = () => {
// ... existing code ...
        if (qIdx >= 0 && qIdx < qCount) {
          // 將備註文字轉為半形大寫，以利後續統一判斷
          let content = match[2].replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).toUpperCase();
          if (content.includes('一律給分')) {
            newSpecialRules[qIdx] = { type: 'ALL' };
          } else {
            // 擷取備註內容中提到的所有英文字母（例如「答B或C或BC者」會擷取出 B, C）
            const letters = content.match(/[A-Z]/g);
            if (letters) {
              newSpecialRules[qIdx] = { type: 'MULTI', options: [...new Set(letters)] }; // 使用 Set 移除重複字母
            }
          }
        }
      }

      const parsedAnswers = parseAnswers(answersText);
      if (parsedAnswers.length < qCount) {
        setSetupError(`正確答案數量不足。設定了 ${qCount} 題，但只偵測到 ${parsedAnswers.length} 個答案（包含字母與#）。請檢查是否漏貼。`);
        return;
      }

      const validLetters = ALPHABET.slice(0, optionCount);
      // 修改：驗證時允許 # 號通過
      const invalidAnswerIndex = parsedAnswers.slice(0, qCount).findIndex(ans => ans !== '#' && !validLetters.includes(ans));
      if (invalidAnswerIndex !== -1) {
        setSetupError(`偵測到無效答案 '${parsedAnswers[invalidAnswerIndex]}' 於第 ${invalidAnswerIndex + 1} 題。請確認字母是否符合選項數量。`);
        return;
      }

      // 新增防呆：檢查是否有 # 卻沒有寫備註的狀況
      const missingNoteIndex = parsedAnswers.slice(0, qCount).findIndex((ans, idx) => ans === '#' && !newSpecialRules[idx]);
      if (missingNoteIndex !== -1) {
        setSetupError(`第 ${missingNoteIndex + 1} 題標記了 '#'，但在文末找不到對應的「備註：第${missingNoteIndex + 1}題...」規則說明。`);
        return;
      }

      setSetupError('');
      setCorrectAnswers(parsedAnswers.slice(0, qCount));
// ... existing code ...
      <div className="flex border-b mb-6 shrink-0">
        <button onClick={() => setSetupTab('new')} className={`flex-1 py-3 font-bold transition-colors ${setupTab === 'new' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>📝 建立新測驗</button>
        <button onClick={() => setSetupTab('history')} className={`flex-1 py-3 font-bold transition-colors ${setupTab === 'history' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>📂 作答紀錄</button>
      </div>

      {authError && (
        <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-lg text-sm font-medium shrink-0 whitespace-pre-line">
          {authError}
        </div>
      )}

      {setupTab === 'new' && (
        <div className="space-y-4 overflow-y-auto pr-2 pb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">本次作答紀錄名稱</label>
//
