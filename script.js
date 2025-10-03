// script.js

// --- 初期設定 ---
const GAS_WEB_APP_URL = 'ここにステップ0で取得したGASのURLを貼り付け';
const GOOGLE_BOOKS_API_KEY = 'ここにステップ0で取得したAPIキーを貼り付け';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const bookInfoEl = document.getElementById('bookInfo');

// --- カメラを起動 ---
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }, // 背面カメラを優先
            audio: false
        });
        video.srcObject = stream;
        video.play();
        statusEl.textContent = 'カメラ準備完了';
    } catch (err) {
        console.error('カメラエラー:', err);
        statusEl.textContent = 'カメラの起動に失敗しました。';
    }
}
startCamera(); // ページを開いたらカメラを起動
// script.js の続き

document.getElementById('scanBarcodeBtn').addEventListener('click', () => {
    statusEl.textContent = 'バーコードを探しています...';
    const codeReader = new ZXing.BrowserMultiFormatReader();
    codeReader.decodeFromVideoDevice(undefined, 'video', (result, err) => {
        if (result) {
            const isbn = result.getText();
            // ISBNは978から始まることが多い
            if (isbn.startsWith('978')) {
                statusEl.textContent = `バーコード発見: ${isbn}`;
                codeReader.reset(); // スキャンを停止
                video.pause();
                searchBook(`isbn:${isbn}`);
            }
        }
    });
});

// script.js の続き

// 画像を撮影してOCRを実行する共通関数
async function captureAndRecognize(lang, options = {}) {
    statusEl.textContent = '撮影して文字を読んでいます...';
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const { data: { text } } = await Tesseract.recognize(canvas.toDataURL(), lang, options);
    return text;
}

// ISBN番号を撮影するボタン
document.getElementById('scanIsbnBtn').addEventListener('click', async () => {
    const text = await captureAndRecognize('eng', { // 数字は英語モードの方が精度が良い
        tessedit_char_whitelist: '0123456789-' // 読み取り対象を数字とハイフンに限定
    });
    const isbn = text.replace(/[^0-9]/g, ''); // 数字以外を削除
    if (isbn.length >= 10) {
        statusEl.textContent = `ISBN番号発見: ${isbn}`;
        searchBook(`isbn:${isbn}`);
    } else {
        statusEl.textContent = 'ISBN番号の読み取りに失敗しました。';
    }
});

// タイトルを撮影するボタン
document.getElementById('scanTitleBtn').addEventListener('click', async () => {
    const title = await captureAndRecognize('jpn'); // 日本語モード
    if (title) {
        statusEl.textContent = `タイトル発見: ${title}`;
        searchBook(`intitle:${title}`);
    } else {
        statusEl.textContent = 'タイトルの読み取りに失敗しました。';
    }
});

// script.js の続き

// script.js の中の関数を書き換え

// Google Books APIで本を検索する関数
async function searchBook(query) {
    statusEl.textContent = '書籍情報を検索中...';
    // "&lang=ja" を追加して、結果を日本語優先にする
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}&lang=ja`);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
        const book = data.items[0].volumeInfo; // 最初の候補を採用
        
        // 必要な情報を抽出してオブジェクトにまとめる
        const bookData = {
            isbn: book.industryIdentifiers?.find(i => i.type.includes('ISBN'))?.identifier || '情報なし',
            title: book.title,
            authors: book.authors ? book.authors.join(', ') : '情報なし',
            publisher: book.publisher || '情報なし',
            description: book.description || '情報なし',
            imageUrl: book.imageLinks?.thumbnail || ''
        };
        
        displayBookInfo(bookData); // 画面に表示
        await saveToSheet(bookData); // スプレッドシートに保存
    } else {
        statusEl.textContent = '書籍情報が見つかりませんでした。';
    }
}

// 画面に書籍情報を表示する関数
function displayBookInfo(data) {
    // 説明文が長い場合があるので、表示を少し調整
    bookInfoEl.innerHTML = `
        <h3>${data.title}</h3>
        <p><strong>著者:</strong> ${data.authors}</p>
        <p><strong>出版社:</strong> ${data.publisher}</p>
        <p><strong>ISBN:</strong> ${data.isbn}</p>
        <img src="${data.imageUrl}" alt="表紙画像" style="max-width: 150px;">
        <p style="text-align: left; font-size: 14px;">${data.description}</p>
    `;
}

// saveToSheet関数は前のままで変更不要です！


// GASにデータを送信してスプレッドシートに保存する関数
async function saveToSheet(bookData) {
    statusEl.textContent = 'スプレッドシートに記録中...';
    try {
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors', // CORSエラーを回避するためのおまじない
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookData)
        });
        statusEl.textContent = '記録が完了しました！';
        video.play(); // 次のスキャンのためにカメラを再開
    } catch (err) {
        console.error('保存エラー:', err);
        statusEl.textContent = 'スプレッドシートへの記録に失敗しました。';
    }
}