let video;
let handpose;
let predictions = [];
let bladeTrail = []; // 儲存刀鋒軌跡的座標陣列
const MAX_TRAIL_LEN = 15; // 軌跡最大長度

function setup() {
  createCanvas(640, 480);
  
  // 1. 開啟視訊鏡頭
  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide(); // 隱藏預設的視訊元件，我們要在 canvas 裡畫

  // 2. 初始化 Handpose 模型
  // 傳入 video 並在模型載入完成後執行 modelReady
  handpose = ml5.handpose(video, modelReady);

  // 設定偵測監聽器，當有偵測結果時更新 predictions 陣列
  handpose.on("predict", results => {
    predictions = results;
  });
}

function modelReady() {
  console.log("Handpose 模型已載入！");
}

function draw() {
  // --- 畫面處理 ---
  
  // 將畫布水平反轉（左右鏡像）
  // 做法：平移到最右邊，然後將縮放比例設為 -1, 1
  push();
  translate(width, 0);
  scale(-1, 1);
  
  // 繪製視訊畫面
  image(video, 0, 0, width, height);

  // --- 邏輯處理：抓取食指位置 ---
  let fingerX, fingerY;
  let foundHand = false;

  if (predictions.length > 0) {
    // 取得第一隻手的偵測結果
    let hand = predictions[0];
    // Index Finger Tip (食指指尖) 的 index 是 8
    // ml5.js Handpose landmarks 索引參考: https://github.com/tensorflow/tfjs-models/tree/master/handpose
    let indexFingerTip = hand.landmarks[8];
    
    fingerX = indexFingerTip[0];
    fingerY = indexFingerTip[1];
    foundHand = true;
    
    // 將座標加入軌跡陣列
    bladeTrail.push({ x: fingerX, y: fingerY });
  } else {
    // 若沒偵測到手，可以選擇清空軌跡或讓它自然消失
    if (bladeTrail.length > 0) {
      bladeTrail.shift();
    }
  }

  // 限制軌跡長度，創造出淡出效果的基礎
  if (bladeTrail.length > MAX_TRAIL_LEN) {
    bladeTrail.shift();
  }

  // --- 繪製刀鋒軌跡 ---
  noFill();
  strokeWeight(6);
  for (let i = 0; i < bladeTrail.length - 1; i++) {
    // 根據索引計算透明度，越舊的點越透明
    let alpha = map(i, 0, bladeTrail.length, 0, 255);
    stroke(255, 255, 255, alpha); // 白色刀光
    line(bladeTrail[i].x, bladeTrail[i].y, bladeTrail[i+1].x, bladeTrail[i+1].y);
  }

  pop(); // 恢復座標系統
}
