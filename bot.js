const fs = require('fs');
const kuromoji = require('kuromoji');
const { TwitterApi } = require('twitter-api-v2');

// =========================================================
// 1. 𝕏 (Twitter) APIの設定
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
  return data.map(item => item.text).join(' ');
}

// =========================================================
// 3. 【新】辞書の作成（※重い処理なので最初に1回だけ実行する！）
// =========================================================
function createMarkovDictionary(text) {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, tokenizer) => {
      if (err) return reject(err);

      const tokens = tokenizer.tokenize(text);
      const words = tokens.map(t => t.surface_form);

      const markovDict = {};
      for (let i = 0; i < words.length - 2; i++) {
        // 単語の区切りを明確にするため「｜」を挟んで記憶
        const prefix = words[i] + '｜' + words[i + 1]; 
        const suffix = words[i + 2];
        
        if (!markovDict[prefix]) markovDict[prefix] = [];
        markovDict[prefix].push(suffix);
      }
      resolve(markovDict);
    });
  });
}

// =========================================================
// 4. 【新】辞書を使って1文を生成する
// =========================================================
function generateSentence(markovDict) {
  const prefixes = Object.keys(markovDict);
  let currentKey = prefixes[Math.floor(Math.random() * prefixes.length)];
  let sentence = currentKey.replace('｜', ''); 

  for (let i = 0; i < 50; i++) {
    const nextWords = markovDict[currentKey];
    if (!nextWords || nextWords.length === 0) break;

    const nextWord = nextWords[Math.floor(Math.random() * nextWords.length)];
    sentence += nextWord;

    if (nextWord === '。' || sentence.length > 100) break;

    // 次の検索キーを作る（今のキーの後半 ＋ 次の単語）
    const words = currentKey.split('｜');
    currentKey = words[1] + '｜' + nextWord; 
  }
  return sentence.trim();
}

// =========================================================
// 5. メイン処理
// =========================================================
async function runBot() {
  try {
    console.log("データの読み込み中...");
    const text = getRandomTextData();
    
    console.log("形態素分析と辞書の作成中...");
    const markovDict = await createMarkovDictionary(text);

    console.log("条件に合う文章をガチャで生成中...");
    let generatedSentence = "";
    
    // 辞書は完成しているので、ガチャは何百回やり直しても一瞬で終わります！
    while (generatedSentence.length < 15 || generatedSentence.length > 80 || !generatedSentence.endsWith('。')) {
      generatedSentence = generateSentence(markovDict);
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