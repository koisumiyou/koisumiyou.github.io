// ----------------------------------------------------------------
// ① 初期設定 (APIキーなどをここにまとめる)
// ----------------------------------------------------------------
const GAS_WEB_APP_URL = 'ここにステップ0で取得したGASのURLを貼り付け';
const GOOGLE_BOOKS_API_KEY = 'ここにステップ0で取得したAPIキーを貼り付け';

// ----------------------------------------------------------------
// ② HTML要素の取得
// ----------------------------------------------------------------
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const statusEl = document.getElementById('status');
const bookInfoEl = document.getElementById('bookInfo');

// ----------------------------------------------------------------
// ③ イベントリスナーの設定 (どのボタンが押された時に何をするか)
// ----------------------------------------------------------------
document.getElementById('scanBarcodeBtn').addEventListener('click', handleBarcodeScan);
document.getElementById('scanIsbnBtn').addEventListener('click', handleIsbnOcr);
document.getElementById('scanTitleBtn').addEventListener('click', handleTitleOcr);
document.getElementById('manualSearchBtn').addEventListener('click', handleManualSearch);

// ----------------------------------------------------------------
// ④ メインの関数たち
// ----------------------------------------------------------------

/**
 * カメラを起動する
 */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        video.srcObject = stream;
        video.play();
        statusEl.textContent = 'カメラ準備完了';
    } catch (err) {
        console.error('カメラエラー:', err);
        statusEl.textContent = 'カメラの起動に失敗しました。ページを再読み込みするか、カメラのアクセスを許可してください。';
    }
}

/**
 * バーコードスキャンを処理する
 */
async function handleBarcodeScan() {
    statusEl.textContent = 'バーコードを撮影・解析中...';
    // 静止画を撮影
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    try {
        const codeReader = new ZXing.BrowserMultiFormatReader();
        const result = await codeReader.decodeFromCanvas(canvas);
        const isbn = result.getText();

        if (isbn && (isbn.startsWith('978') || isbn.startsWith('979'))) {
            statusEl.textContent = `バーコード発見: ${isbn}`;
            video.pause();
            searchBook(`isbn:${isbn}`);
        } else {
            statusEl.textContent = '有効なバーコードではありませんでした。';
        }
    } catch (err) {
        console.error('バーコード認識エラー:', err);
        statusEl.textContent = 'バーコードが見つかりませんでした。';
    }
}

/**
 * ISBN番号のOCRを処理する
 */
async function handleIsbnOcr() {
    statusEl.textContent = 'ISBN番号を撮影・解析中...';
    try {
        const text = await recognizeText('eng', { tessedit_char_whitelist: '0123456789-' });
        const isbn = text.replace(/[^0-9]/g, ''); // 数字以外を削除
        if (isbn.length >= 10) {
            statusEl.textContent = `ISBN番号発見: ${isbn}`;
            video.pause();
            searchBook(`isbn:${isbn}`);
        } else {
            statusEl.textContent = 'ISBN番号の読み取りに失敗しました。';
        }
    } catch (error) {
        statusEl.textContent = 'OCR処理中にエラーが発生しました。';
    }
}

/**
 * タイトルのOCRを処理する
 */
async function handleTitleOcr() {
    statusEl.textContent = 'タイトルを撮影・解析中...';
    try {
        const title = await recognizeText('jpn');
        if (title) {
            statusEl.textContent = `タイトル発見: ${title}`;
            video.pause();
            searchBook(`intitle:${title}`);
        } else {
            statusEl.textContent = 'タイトルの読み取りに失敗しました。';
        }
    } catch (error) {
        statusEl.textContent = 'OCR処理中にエラーが発生しました。';
    }
}

/**
 * 手動検索を処理する
 */
function handleManualSearch() {
    const title = document.getElementById('manualTitle').value;
    if (title) {
        searchBook(`intitle:${title}`);
    } else {
        alert('タイトルを入力してください。');
    }
}

/**
 * Tesseract.jsで文字認識を行う共通関数
 */
async function recognizeText(lang, options = {}) {
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data: { text } } = await Tesseract.recognize(canvas, lang, options);
    return text;
}

/**
 * Google Books APIで本を検索する
 */
async function searchBook(query) {
    statusEl.textContent = '書籍情報を検索中...';
    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}&lang=ja`);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            const book = data.items[0].volumeInfo;
            
            // 抽出する情報に categories と previewLink を追加
            const bookData = {
                isbn: book.industryIdentifiers?.find(i => i.type.includes('ISBN'))?.identifier || '情報なし',
                title: book.title,
                authors: book.authors ? book.authors.join(', ') : '情報なし',
                publisher: book.publisher || '情報なし',
                description: book.description || '情報なし',
                categories: book.categories ? book.categories.join(', ') : '情報なし', // ★追加
                imageUrl: book.imageLinks?.thumbnail || '情報なし',
                previewLink: book.previewLink || '情報なし',    // ★追
            };
            
            displayBookInfo(bookData);
            await saveToSheet(bookData);
        } else {
            statusEl.textContent = '書籍情報が見つかりませんでした。';
        }
    } catch (err) {
        console.error('API検索エラー:', err);
        statusEl.textContent = '書籍情報の検索中にエラーが発生しました。';
    }
}

/**
 * 取得した書籍情報を画面に表示する
 */
function displayBookInfo(data) {
    // 表示部分にカテゴリとプレビューリンクを追加
    bookInfoEl.innerHTML = `
        <h3>${data.title}</h3>
        <p><strong>著者:</strong> ${data.authors}</p>
        <p><strong>出版社:</strong> ${data.publisher}</p>
        <p><strong>カテゴリ:</strong> ${data.categories}</p>
        <p><strong>ISBN:</strong> ${data.isbn}</p>
        <img src="${data.imageUrl}" alt="表紙画像" style="max-width: 150px;">
        <p><a href="${data.previewLink}" target="_blank">Google Booksでプレビュー</a></p>
        <p style="text-align: left; font-size: 14px;">${data.description}</p>
    `;
}

/**
 * Google Apps Scriptにデータを送信してスプレッドシートに保存する
 */
async function saveToSheet(bookData) {
    statusEl.textContent = 'スプレッドシートに記録中...';
    try {
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bookData)
        });
        statusEl.textContent = '記録が完了しました！再度カメラを起動します。';
        video.play(); // 次のスキャンのためにカメラを再開
    } catch (err) {
        console.error('保存エラー:', err);
        statusEl.textContent = 'スプレッドシートへの記録に失敗しました。';
    }
}

// ----------------------------------------------------------------
// ⑤ アプリケーションの開始
// ----------------------------------------------------------------
startCamera();
