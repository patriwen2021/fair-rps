import {
  COMMIT_SECONDS_MAX,
  COMMIT_SECONDS_MIN,
  MIN_PLAYERS_TO_START,
  QUESTION_MAX_LENGTH,
  NICKNAME_MAX_COMBINING_MARKS,
  NICKNAME_MAX_LENGTH,
  type ErrorCode,
  type NicknameError,
  type Phase,
  type QuestionError,
  type RevealStatus,
} from "@fair-rps/shared";

export type ActionError = ErrorCode | "TIMEOUT";

export const ERROR_MESSAGE: Record<ActionError, string> = {
  INVALID_PAYLOAD: "送出的資料格式不對，請重新整理頁面再試一次。",
  RATE_LIMITED: "操作太頻繁，請等幾秒再試。",
  WRONG_PHASE: "這個階段已經結束，來不及了。",
  NOT_HOST: "只有裁判可以做這個動作。",
  NOT_PLAYER: "你目前是觀賽者，不能出拳。",
  HOST_CANNOT_PLAY: "裁判只主持、不參賽。",
  ALREADY_JOINED: "你已經在名單裡了。",
  ROOM_FULL: "房間已滿，無法加入。",
  TOO_MANY_PLAYERS_FROM_IP: "同一個網路（IP 位址）加入的玩家已達上限，暫時不能再加入。請換一個網路（例如改用手機行動網路），或請主辦人調高上限。",
  INVALID_NICKNAME: `暱稱無法使用：需為 1–${NICKNAME_MAX_LENGTH} 個字，且不能是「裁判」「晉級」這類會和畫面文字混淆的字樣。`,
  INVALID_AVATAR: "伺服器不接受這個頭像，請重新選一個再加入。",
  INVALID_COMMIT_SECONDS: `作答時間需為 ${COMMIT_SECONDS_MIN}–${COMMIT_SECONDS_MAX} 秒的整數。`,
  INVALID_QUESTION: `伺服器不接受這個問題。問題需為 1–${QUESTION_MAX_LENGTH} 個字，請修改後再送出。`,
  NOT_ENOUGH_PLAYERS: `至少要 ${MIN_PLAYERS_TO_START} 位在線玩家才能開始。`,
  NOT_IN_MATCH: "這一場不是你的比賽。",
  MATCH_NOT_ACTIVE: "這一場目前沒有在進行。",
  INVALID_HASH: "雜湊格式不正確，請再鎖定一次。",
  ALREADY_COMMITTED: "你已經鎖定過了，鎖定後不能更改。",
  DUPLICATE_HASH: "你的雜湊和對手的一模一樣，伺服器不收。請再按一次鎖定，系統會換一組新的隨機碼。",
  NOT_COMMITTED: "你這次沒有鎖定出拳。",
  ALREADY_REVEALED: "原文已經送出過了。",
  INTERNAL: "伺服器發生錯誤，請再試一次。",
  TIMEOUT: "伺服器沒有回應，請確認連線後再試一次。",
};

export function nicknameErrorMessage(error: NicknameError, length: number): string {
  switch (error) {
    case "too_long":
      return `暱稱最多 ${NICKNAME_MAX_LENGTH} 個字，現在是 ${length} 個字。`;
    case "empty":
      return "暱稱不能是空白。";
    case "malformed_text":
      return "暱稱含有無法辨識的字元，請重新輸入。";
    case "not_string":
      return "請輸入暱稱。";
    case "reserved":
      return "這個暱稱會和畫面上的系統文字（例如「裁判」「晉級」「勝」「判定」）混淆，請換一個。";
    case "too_many_marks":
      return `暱稱的組合符號（變音符號）最多 ${NICKNAME_MAX_COMBINING_MARKS} 個，請減少。`;
  }
}

export function questionErrorMessage(error: QuestionError, length: number): string {
  switch (error) {
    case "too_long":
      return `問題最多 ${QUESTION_MAX_LENGTH} 個字，現在是 ${length} 個字。`;
    case "empty":
      return "先輸入這一輪的問題，才能開始猜拳。";
    case "malformed_text":
      return "問題含有無法辨識的字元，請重新輸入。";
    case "not_string":
      return "請輸入問題。";
  }
}

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "等候室",
  bracket: "等待出題",
  commit: "作答中",
  reveal: "揭示驗算中",
  result: "結果揭曉",
  finished: "比賽結束",
};

export const FORFEIT_LABEL: Record<Exclude<RevealStatus, "valid">, string> = {
  not_committed: "時間內沒有鎖定出拳",
  not_revealed: "有鎖定，但沒有在時限內揭示原文",
  hash_mismatch: "揭示的原文和先前鎖定的雜湊對不起來",
  malformed: "原文格式不符規定",
};
