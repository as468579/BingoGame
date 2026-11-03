# 各遊戲卡牌庫

每種遊戲有自己的卡牌檔案，卡片 ID 只需在該遊戲內唯一。卡片名稱、外觀、抽取啟用狀態與題目難度均可各自設定。

| 遊戲 | 卡牌檔案 | 目前用途 |
|---|---|---|
| Bingo／單人賓果 | `src/games/bingo/cards.json` | 個人效果卡與舊示範問答卡；目前手牌介面仍暫停使用 |
| Team Bingo／團隊賓果 | `src/games/bingonext/cards.json` | 特殊格抽出的隊伍共用效果卡，題目另從題庫抽選 |
| Bridge Bingo／橋牌賓果 | `src/games/bridge/cards.json` | 預留效果卡庫，目前為空；三色數字牌仍依盤面尺寸動態產生 |

修改後重新啟動伺服器載入。卡庫放在伺服器原始碼目錄，不直接提供給瀏覽器下載。

## 團隊賓果卡片格式

```json
{
  "id": "my-card",
  "name": "卡片名稱",
  "symbol": "✦",
  "theme": "gold",
  "type": "能力",
  "description": "卡片說明",
  "effect": "能力待定",
  "questionDifficulty": null,
  "enabled": true
}
```

- 整份檔案為 JSON 陣列；`id` 與 `name` 不可空白，同一檔案的 ID 不可重複。
- `theme` 控制既有卡面配色，例如 `gold`、`green`、`violet`。所有遊戲仍可共用卡面與卡背元件。
- `effect` 是效果說明文字；填入文字不會自動實作能力。實際能力須在對應遊戲的規則模組實作。
- Team Bingo 已實作 `effectId: "team-time-plus-2m"` 的「加時鬧鐘 ⏰」：限定簡單題，房主判定答對時增加自己的隊伍 120 秒行動時間；答錯、取消或未判定就結束不加時。完成操作仍會換人，重送不重複加時。此卡只在 Team Bingo 的卡庫中啟用。
- `questionDifficulty` 設為「簡單」、「普通」或「困難」時，只抽該難度的題目；`null` 表示不限難度。設定不會傳給玩家，目前示範卡尚未指定強弱。
- `enabled: false` 會停止新抽卡，但不刪除已取得的卡片；已有卡片仍可使用。請保留已使用的 ID，暫停發卡時以停用代替直接刪除，避免舊手牌找不到定義。
- Team Bingo 的題目從 `questions.json` 抽選，不放在卡片檔案中。
- 原版 Bingo 仍沿用舊問答格式，卡片另須提供 `question`、2～4 個文字 `options` 與從 0 起算的 `answer` 索引，現有三張卡已保留完整格式。

## 模組關係

各遊戲的 `card-catalog.js` 只載入自己的 `cards.json`。遊戲註冊介面以 `cardLibrary` 提供該遊戲的定義，抽卡與用牌仍由該遊戲的規則處理。

`src/shared/card-library.js` 只負責共通的檔案驗證、啟用卡片抽選與公開欄位過濾，不匯入任何遊戲的內容或效果。

共通格式與隔離測試：`node --test test/card-library.test.js`。

加時卡效果與還原測試：`node --test test/team-time-card.test.js`。上一步會撤回這張卡增加的時間並退回卡片，但不退還實際已花掉的行動時間。
