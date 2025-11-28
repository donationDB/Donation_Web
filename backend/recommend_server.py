import os
import sys
from flask import Flask, request, jsonify

# ko-sbert 로직 재사용 (현재 파일 기준 경로 추가)
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)
from ko_sbert_multitask import get_recommender


app = Flask(__name__)

# 최초 1회 모델/임베딩 로드
rec = get_recommender()


@app.route("/recommend", methods=["POST"])
def recommend():
    survey = request.get_json(force=True) or {}
    # 항상 점수 상위 3개만 반환
    results = rec.recommend(survey, top_k=3)

    items = [
        {
            "program_id": row["program_id"],
            "title": row["title"],
            "category": row["category_name"],
            "place": row["place"],
            "funding_type": row["funding_type"],
            "emergency": bool(row["emergency"]),
            "score": round(row.get("score", 0), 3),
            "snippet": (row.get("description") or "")[:120],
        }
        for row in results
    ]
    return jsonify({"items": items})


if __name__ == "__main__":
    # Node가 사용하는 PORT(예: 8080)와 충돌하지 않도록 별도 포트 사용
    port = int(os.getenv("RECOMMEND_PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
