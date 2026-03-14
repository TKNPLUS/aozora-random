const fs = require('fs');
const kuromoji = require('kuromoji');
const { TwitterApi } = require('twitter-api-v2');

// =========================================================
// 1. 𝕏 (Twitter) APIの設定（GitHubのSecretから取得）
// =========================================================
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// =========================================================
// 2. ランダムなJSONデータからテキストを抽出
// =========================================================
function getRandomTextData() {
  const config = JSON.parse(fs.readFileSync('./data/config.json', 'utf-8'));
  const randomFileId = Math.floor(Math.random() * config.totalChunks);
  const data = JSON.parse(fs.readFileSync(`./data/data_${randomFileId}.json`, 'utf-8'));
  
  // 5000件の文章をすべて繋げて1つの巨大なテキストにする
  return data.map(item => item.text).join(' ');
}

// =========================================================
// 3. 形態素分析 ＆ マルコフ連鎖で文章生成
// =========================================================
function generateMarkovSentence(text) {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, tokenizer) => {
      if (err) return reject(err);

      // 単語に分解
      const tokens = tokenizer.tokenize(text);
      const words = tokens.map(t => t.surface_form);

      // マルコフ辞書の作成（3つの単語の繋がりを記憶：より自然な日本語になる）
      const markovDict = {};
      for (let i = 0; i < words.length - 2; i++) {
        const prefix = words[i] + words[i + 1]; // 2単語をキーにする
        const suffix = words[i + 2];
        
        if (!markovDict[prefix]) markovDict[prefix] = [];
        markovDict[prefix].push(suffix);
      }

      // 辞書から文章を生成
      let sentence = "";
      
      // 最初は「文の始まり（ランダムな2単語）」を探す
      const prefixes = Object.keys(markovDict);
      let currentPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      sentence += currentPrefix;

      // 「。」が出るか、文字数上限（100文字）に達するまで繋ぎ続ける
      for (let i = 0; i < 50; i++) {
        const nextWords = markovDict[currentPrefix];
        if (!nextWords || nextWords.length === 0) break;

        const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];
        sentence += nextWord;

        if (nextWord === '。' || sentence.length > 100) break;

        // キーをずらして次の単語へ
        currentPrefix = currentPrefix.substring(currentPrefix.length / 2) + nextWord; // 簡易的なスライド
      }

      // 整形（不要なスペースなどを消す）
      resolve(sentence.trim());
    });
  });
}

// =========================================================
// 4. メイン処理（生成してツイート！）
// =========================================================
async function runBot() {
  try {
    console.log("データの読み込み中...");
    const text = getRandomTextData();
    
    console.log("マルコフ連鎖で文章を生成中...");
    let generatedSentence = "";
    
    // 短すぎる文や長すぎる文を弾き、ちょうどいい文ができるまでガチャを回す
    while (generatedSentence.length < 15 || generatedSentence.length > 80 || !generatedSentence.endsWith('。')) {
      generatedSentence = await generateMarkovSentence(text);
    }

    console.log(`生成された文: ${generatedSentence}`);

    // 𝕏に投稿！
    await twitterClient.v2.tweet(generatedSentence);
    console.log("✨ 投稿完了しました！");

  } catch (error) {
    console.error("エラーが発生しました:", error);
  }
}

runBot();