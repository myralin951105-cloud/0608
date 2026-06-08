let video;
let handpose;
let predictions = [];
let bladeTrail = []; // 儲存刀鋒軌跡的座標陣列
const MAX_TRAIL_LEN = 15; // 軌跡最大長度

let fruits = []; // 存放畫面上所有水果的陣列
let bombs = [];  // 存放畫面上所有炸彈的陣列
let gravity = 0.25; // 模擬重力
let particles = []; // 存放噴汁粒子
let score = 0;      // 分數

let gameState = "START"; // START, PLAYING, GAMEOVER
let gameTimer = 30;      // 遊戲時間 (秒)
let lastTimestamp = 0;

// --- 預留音效區塊 ---
let bgm;
let sliceSound;
let boomSound;

function preload() {
  // 如果你有音效檔案，請取消註解並替換路徑
  // bgm = loadSound('assets/background_music.mp3');
  // sliceSound = loadSound('assets/slice.mp3');
  // boomSound = loadSound('assets/boom.mp3');
}

function setup() {
  createCanvas(640, 480);
  
  // 1. 開啟視訊鏡頭
  // 加入錯誤處理回呼函式，幫助診斷攝影機問題
  video = createCapture(VIDEO, (stream) => {
    console.log("攝影機啟動成功");
  });
  
  video.size(width, height);
  video.hide(); // 隱藏預設的視訊元件，我們要在 canvas 裡畫

  // 安全檢查：確保 ml5 已經存在
  if (typeof ml5 === "undefined") return;

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

function createJuice(x, y, col) {
  // 在切中的位置產生 15 個隨機飛散的粒子
  for (let i = 0; i < 15; i++) {
    particles.push(new Particle(x, y, col));
  }
}

function createExplosion(x, y) {
  // 炸彈爆炸產生更多、更大的灰色粒子
  for (let i = 0; i < 30; i++) {
    let p = new Particle(x, y, color(100));
    p.size = random(10, 20);
    particles.push(p);
  }
}

function resetGame() {
  score = 0;
  gameTimer = 30;
  fruits = [];
  bombs = [];
  particles = [];
  gameState = "PLAYING";
  lastTimestamp = millis();
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

  if (gameState === "PLAYING") {
    // --- 計時器邏輯 ---
    if (millis() - lastTimestamp > 1000) {
      gameTimer--;
      lastTimestamp = millis();
      if (gameTimer <= 0) {
        gameState = "GAMEOVER";
      }
    }

    // --- 生成與更新邏輯 ---
    
    // 每隔 40 幀生成一個新水果
    if (frameCount % 40 === 0) {
      fruits.push(new Fruit());
    }
    // 每隔 120 幀生成一個炸彈
    if (frameCount % 120 === 0) {
      bombs.push(new Bomb());
    }

    // 更新炸彈
    for (let i = bombs.length - 1; i >= 0; i--) {
      bombs[i].update();
      bombs[i].display();
      
      if (foundHand) {
        let d = dist(fingerX, fingerY, bombs[i].x, bombs[i].y);
        if (d < bombs[i].size / 2) {
          createExplosion(bombs[i].x, bombs[i].y);
          score = max(0, score - 50); // 切到炸彈扣 50 分
          // boomSound.play(); // 播放爆炸音效
          bombs.splice(i, 1);
          continue;
        }
      }

      if (bombs[i].offScreen()) {
        bombs.splice(i, 1);
      }
    }

    // 更新水果
    for (let i = fruits.length - 1; i >= 0; i--) {
      fruits[i].update();
      fruits[i].display();

      // 碰撞偵測：如果水果還沒被切，且食指指尖靠近它
      if (!fruits[i].sliced && foundHand) {
        let d = dist(fingerX, fingerY, fruits[i].x, fruits[i].y);
        if (d < fruits[i].size / 2) {
          fruits[i].slice(); // 執行切開邏輯
          score += 10;       // 加分
          // sliceSound.play(); // 播放切碎音效
          createJuice(fruits[i].x, fruits[i].y, fruits[i].type.col); // 噴汁
        }
      }

      // 如果水果掉出畫面底部，從陣列中移除
      if (fruits[i].offScreen()) {
        fruits.splice(i, 1);
      }
    }
  }

  // 無論什麼狀態都要更新並繪製粒子
  // 更新並繪製粒子 (噴汁效果)
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].update();
    particles[i].display();
    if (particles[i].finished()) {
      particles.splice(i, 1);
    }
  }

  // --- 邏輯處理：抓取食指位置 ---
  let fingerX, fingerY;
  let foundHand = false;

  // 只有在模型準備好且非結束狀態時抓取手指
  if (predictions.length > 0 && gameState !== "GAMEOVER") {
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

  pop(); // 恢復座標系統 (結束鏡像繪製)

  // --- UI 繪製 (不翻轉座標) ---
  fill(255);
  noStroke();
  
  if (gameState === "START") {
    background(0, 150); // 半透明背景
    textAlign(CENTER, CENTER);
    textSize(24);
    text("請舉起手，用食指在空中揮動切水果！", width / 2, height / 2 - 20);
    textSize(18);
    text("偵測到食指後即可自動開始", width / 2, height / 2 + 20);
    if (foundHand) {
      resetGame();
    }
  } else if (gameState === "PLAYING") {
    textAlign(LEFT, TOP);
    textSize(32);
    text("Score: " + score, 20, 20);
    textAlign(RIGHT, TOP);
    text("Time: " + gameTimer, width - 20, 20);
  } else if (gameState === "GAMEOVER") {
    background(0, 180);
    textAlign(CENTER, CENTER);
    textSize(48);
    fill(255, 50, 50);
    text("Game Over", width / 2, height / 2 - 40);
    fill(255);
    textSize(32);
    text("Final Score: " + score, width / 2, height / 2 + 20);
    textSize(20);
    text("按下「空白鍵」重新開始", width / 2, height / 2 + 80);
  }
}

function keyPressed() {
  if (gameState === "GAMEOVER" && key === ' ') {
    resetGame();
  }
}

// --- 水果類別設計 ---
class Fruit {
  constructor() {
    this.x = random(50, width - 50); // 隨機水平位置
    this.y = height;                 // 從底部出現
    this.size = 50;                  // 水果大小
    
    // 初始噴發速度 (向上為負)
    this.vx = random(-2, 2);         // 稍微左右飄移
    this.vy = random(-12, -15);      // 強力向上噴發
    this.sliced = false;             // 是否被切開
    this.angle = 0;                  // 旋轉角度
    this.rotationSpeed = random(-0.05, 0.05); // 旋轉速度
    
    // 隨機賦予顏色 (蘋果紅、香蕉黃、西瓜綠)
    let colors = [
      { name: 'apple',  col: color(255, 50, 50) },
      { name: 'banana', col: color(255, 230, 0) },
      { name: 'melon',  col: color(50, 200, 50) }
    ];
    this.type = random(colors);

    // 切開後的分裂參數
    this.leftPartX = 0;
    this.rightPartX = 0;
  }

  slice() {
    this.sliced = true;
    // 切開後，兩半水果會帶有水平彈開的速度
    this.leftPartVx = -2;
    this.rightPartVx = 2;
  }

  update() {
    this.x += this.vx; // 水平移動
    this.y += this.vy; // 垂直移動
    this.vy += gravity; // 加上重力影響
    this.angle += this.rotationSpeed; // 旋轉

    if (this.sliced) {
      // 被切開後，左右兩半開始分離
      this.leftPartX += this.leftPartVx;
      this.rightPartX += this.rightPartVx;
    }
  }

  display() {
    fill(this.type.col);
    noStroke();
    
    push();
    translate(this.x, this.y);
    rotate(this.angle);
    
    if (!this.sliced) {
      // 繪製完整水果
      ellipse(0, 0, this.size);
    } else {
      // 繪製左半邊
      push();
      translate(this.leftPartX, 0);
      arc(0, 0, this.size, this.size, HALF_PI, PI + HALF_PI);
      pop();

      // 繪製右半邊
      push();
      translate(this.rightPartX, 0);
      arc(0, 0, this.size, this.size, PI + HALF_PI, HALF_PI);
      pop();
    }
    pop();
  }

  // 判斷水果是否已經掉出螢幕
  offScreen() {
    return (this.y > height + 100);
  }
}

// --- 炸彈類別設計 ---
class Bomb {
  constructor() {
    this.x = random(100, width - 100);
    this.y = height;
    this.size = 60;
    this.vx = random(-1, 1);
    this.vy = random(-10, -13);
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += gravity;
  }

  display() {
    fill(30); // 深灰色/黑色
    stroke(255, 0, 0); // 紅色描邊代表危險
    strokeWeight(2);
    ellipse(this.x, this.y, this.size);
    // 畫引信
    stroke(255, 200, 0);
    line(this.x, this.y - this.size/2, this.x + 5, this.y - this.size/2 - 10);
  }

  offScreen() {
    return (this.y > height + 100);
  }
}

// --- 粒子類別 (噴汁效果) ---
class Particle {
  constructor(x, y, col) {
    this.x = x;
    this.y = y;
    this.vel = p5.Vector.random2D().mult(random(1, 5)); // 隨機爆炸方向
    this.col = col;
    this.alpha = 255; // 初始完全不透明
    this.size = 8;    // 預設大小
  }

  update() {
    this.x += this.vel.x;
    this.y += this.vel.y;
    this.alpha -= 10; // 每一幀變透明一點
  }

  display() {
    noStroke();
    let c = color(red(this.col), green(this.col), blue(this.col), this.alpha);
    fill(c);
    ellipse(this.x, this.y, this.size); // 小圓點粒子
  }

  finished() {
    return this.alpha <= 0;
  }
}
