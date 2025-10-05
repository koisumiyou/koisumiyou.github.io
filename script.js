// ----------------------------------------------------------------
// ① 初期設定 (APIキーなどをここにまとめる)
// ----------------------------------------------------------------
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxEve9ZxMCsjlK19Gj8TwPOHJwg1C5pKMv1cXSeH2rjQabijNPV_qcZXN64MercYk5FLw/exec';
const GOOGLE_BOOKS_API_KEY = 'AIzaSyBkeBZ-W7QtKYzbXOK-XgeXlo8XU3Fbwhk';

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
 * Tesseract.jsで文字認識を行う共通関数（画像の前処理機能付き）
 */
async function recognizeText(lang, options = {}) {
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 映像をキャンバスに描画
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // --- ここから画像の前処理 ---
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 白黒（グレースケール）化
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i]     = avg; // red
        data[i + 1] = avg; // green
        data[i + 2] = avg; // blue
    }
    context.putImageData(imageData, 0, 0);
    // --- 前処理ここまで ---

    // 前処理した画像でOCRを実行
    const { data: { text } } = await Tesseract.recognize(canvas, lang, options);
    return text;
}

/**
 * バーコードスキャンを処理する
 */
async function handleBarcodeScan() {
    statusEl.textContent = 'バーコードを撮影・解析中...';
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
            statusEl.textContent = '有効なバーコードではありませんでした。もう一度お試しください。';
            video.play(); // ★追加: 失敗時にカメラを再起動
        }
    } catch (err) {
        console.error('バーコード認識エラー:', err);
        statusEl.textContent = 'バーコードが見つかりませんでした。もう一度お試しください。';
        video.play(); // ★追加: 失敗時にカメラを再起動
    }
}

/**
 * ISBN番号のOCRを処理する（チェック処理を強化）
 */
async function handleIsbnOcr() {
    statusEl.textContent = 'ISBN番号を撮影・解析中...';
    try {
        const text = await recognizeText('eng', { tessedit_char_whitelist: '0123456789-X' }); // Xも許可
        
        // ハイフンなどを除去
        const cleanedText = text.replace(/[-\s]/g, ''); 
        
        // ISBN-13 (978... or 979...) または ISBN-10 を探す
        const match = cleanedText.match(/(97[89]\d{10}|\d{9}[\dX])/); 
        
        if (match) {
            const isbn = match[0];
            statusEl.textContent = `ISBN番号発見: ${isbn}`;
            video.pause();
            searchBook(`isbn:${isbn}`);
        } else {
            statusEl.textContent = 'ISBN番号の読み取りに失敗しました。もう一度お試しください。';
            video.play();
        }
    } catch (error) {
        statusEl.textContent = 'OCR処理中にエラーが発生しました。もう一度お試しください。';
        video.play();
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
            statusEl.textContent = 'タイトルの読み取りに失敗しました。もう一度お試しください。';
            video.play(); // ★追加: 失敗時にカメラを再起動
        }
    } catch (error) {
        statusEl.textContent = 'OCR処理中にエラーが発生しました。もう一度お試しください。';
        video.play(); // ★追加: 失敗時にカメラを再起動
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
 * Google Books APIで本を検索する（複数候補を確認する強化版）
 */
async function searchBook(query) {
    statusEl.textContent = '書籍情報を検索中...';
    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${query}&key=${GOOGLE_BOOKS_API_KEY}&lang=ja`);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            // --- ここから候補を探すロジック ---
            let bestMatch = null;
            // 検索結果の先頭5件、または全件をチェック
            for (let i = 0; i < Math.min(data.items.length, 5); i++) {
                const itemInfo = data.items[i].volumeInfo;
                // 出版社情報が含まれているものを最優先する
                if (itemInfo.publisher) {
                    bestMatch = itemInfo;
                    break; // 最適な候補が見つかったのでループを抜ける
                }
                // ループの最初で見つかった候補をとりあえず保持しておく
                if (i === 0) {
                    bestMatch = itemInfo;
                }
            }
            // --- 候補を探すロジックここまで ---

            const bookData = {
                isbn: bestMatch.industryIdentifiers?.find(i => i.type.includes('ISBN'))?.identifier || '情報なし',
                title: bestMatch.title,
                authors: bestMatch.authors ? bestMatch.authors.join(', ') : '情報なし',
                publisher: bestMatch.publisher || '情報なし',
                description: bestMatch.description || '情報なし',
                imageUrl: bestMatch.imageLinks?.thumbnail || '',
                previewLink: bestMatch.previewLink || ''
            };
            displayBookInfo(bookData);
            await saveToSheet(bookData);
        } else {
            statusEl.textContent = '書籍情報が見つかりませんでした。もう一度お試しください。';
            video.play();
        }
    } catch (err) {
        console.error('API検索エラー:', err);
        statusEl.textContent = '書籍情報の検索中にエラーが発生しました。もう一度お試しください。';
        video.play();
    }
}

/**
 * 取得した書籍情報を画面に表示する
 */
function displayBookInfo(data) {
    bookInfoEl.innerHTML = `
        <h3>${data.title}</h3>
        <p><strong>著者:</strong> ${data.authors}</p>
        <p><strong>出版社:</strong> ${data.publisher}</p>
        <p><strong>ISBN:</strong> ${data.isbn}</p>
        <img src="${data.imageUrl}" alt="表紙画像">
        <p><a href="${data.previewLink}" target="_blank">Google Booksでプレビュー</a></p>
        <p style="text-align: left;">${data.description}</p>
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
        statusEl.textContent = '記録が完了しました！次の本をスキャンできます。';
        video.play();
    } catch (err) {
        console.error('保存エラー:', err);
        statusEl.textContent = 'スプレッドシートへの記録に失敗しました。';
    }
}

// ----------------------------------------------------------------
// ⑤ アプリケーションの開始
// ----------------------------------------------------------------
startCamera();
