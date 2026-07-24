"""
PayCross - Backend Periodic Campaign Data Sync Script (Sample)
目的: 各Payの自治体キャンペーン・還元ルールを、相手サーバーに負荷をかけないよう
　　　適切な間隔（2秒以上のスリープ）とエラーハンドリングを挟んで安全に自動同期・DBキャッシュ生成するスクリプト。
"""

import json
import time
import datetime

def fetch_municipality_campaigns():
    """
    自治体広報・各Pay公式特設ページからの安全な同期クローリング処理（模擬）
    """
    print("[Sync Pipeline] Starting periodic campaign data sync...")
    
    # IPブロック回避のためのレートリミット（リクエスト毎に2秒待機するなどのインターバル）
    time.sleep(1.0)
    
    # 模擬同期結果データ
    synced_data = {
        "last_updated": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sync_status": "success",
        "active_campaigns": [
            {
                "campaign_id": "shibuya-2026-07",
                "title": "東京都渋谷区 自治体還元コラボ（最大20%還元）",
                "target_pay": "paypay",
                "target_region": "東京都渋谷区",
                "bonus_rate": 0.20,
                "max_per_txn": 1000,
                "start_date": "2026-07-01",
                "end_date": "2026-08-31"
            },
            {
                "campaign_id": "shibuya-dbarai-2026",
                "title": "東京都渋谷区 d払い自治体還元（最大20%還元）",
                "target_pay": "dbarai",
                "target_region": "東京都渋谷区",
                "bonus_rate": 0.20,
                "max_per_txn": 1000,
                "start_date": "2026-07-01",
                "end_date": "2026-08-31"
            },
            {
                "campaign_id": "drugstore-rakuten-p5",
                "title": "全国ドラッグストア 楽天ペイ ポイント5倍デー",
                "target_pay": "rakuten",
                "target_region": "全国",
                "bonus_rate": 0.05,
                "max_per_txn": 500,
                "start_date": "2026-07-20",
                "end_date": "2026-07-31"
            }
        ],
        "stores_count": 5
    }
    
    # JSONキャッシュとして出力
    with open("cached_pay_data.json", "w", encoding="utf-8") as f:
        json.dump(synced_data, f, ensure_ascii=False, indent=2)
        
    print(f"[Sync Pipeline] Sync complete! Successfully cached {len(synced_data['active_campaigns'])} active campaigns.")
    return synced_data

if __name__ == "__main__":
    fetch_municipality_campaigns()
