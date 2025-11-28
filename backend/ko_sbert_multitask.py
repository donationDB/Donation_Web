import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

print("import 성공!")

import pymysql

# DB 접속 정보 
DB_CONFIG = {
    "host": "127.0.0.1",      # Workbench랑 동일
    "port": 3307,            
    "user": "root",
    "password": "jeongusrn",
    "database": "mydb",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

MODEL_NAME = "jhgan/ko-sbert-multitask"   # 임베딩 모델
TOP_K = 10                                # 1차 후보로 뽑을 프로그램 개수

# 이미 위에서 DB_CONFIG 정의해놨으니까 그대로 사용

def get_connection():
    return pymysql.connect(**DB_CONFIG)

model = SentenceTransformer(MODEL_NAME)
print("모델 로드 완료")

# 진행 중(RUNNING)인 프로그램만 가져오기

def fetch_running_programs():

    sql = """
    SELECT
        p.program_id, -- 프로그램 고유 ID, 나중에 추천 결과로 돌려줄 Key 값
        p.title, -- 프로그램 제목 (사용자에게 보여줄 텍스트)
        p.place, -- 프로그램 지역 ( 설문 3번 : 선호 지역과 매칭할 때 사용 )
        p.description, -- 프로그램 설명 (임베딩용 정보로 사용)
        p.emergency, -- 긴급 여부 (설문 5번에서 사용)
        p.funding_type,    -- 후원 유형 (설문 2번: 단발/정기/상관없음 매핑)
        c.name AS category_name -- 카테고리 이름 (설문 1번)
    FROM program p -- 프로그램 정보가 들어있는 program 테이블 기준으로 
    JOIN category c -- 카테고리 이름을 가져오기 위해 catefogory 테이블과 조인
    ON p.category_id = c.category_id -- program이 어떤 category에 속하는지
    WHERE p.status = 'RUNNING'; -- 진행중인 프로그램만 가져오기
    """
    conn = get_connection() # DB 연결
    try:
        with conn.cursor() as cur:
            cur.execute(sql) # 위 select문 실행
            rows = cur.fetchall()
    finally:
        conn.close()
    return rows

# 프로그램 -> 한 문장(쿼리 텍스트)로 변환

def build_program_text(row):
    """
    각 program 행을 검색용 한 문장으로 만든다.
    설문 1,2,3,5,6과 모두 연결되는 정보가 들어 있음.
    """
    category = row["category_name"] or ""
    # row 딕셔너리에서 category_name 컬럼 값을 가져옴.
    # 만약 None이면 빈 문자열("")로 대체해서 에러를 피함.
    # → 설문 1번: "어떤 관심 분야에 후원하고 싶나요?"와 연결되는 카테고리 정보.

    place = row["place"] or ""
    # 프로그램이 진행되는 지역(place)을 가져옴.
    # → 설문 3번: "선호하는 지역은 어디인가요?"와 매칭할 때 사용.

    title = row["title"] or ""
    # 프로그램 제목(title)을 가져옴.
    # 사용자가 실제로 볼 때도 중요한 정보고, 임베딩에서도 의미를 많이 담는 부분.

    desc = (row["description"] or "")[:300]
    # 프로그램 설명(description)을 가져와서 최대 300자까지만 사용.
    # 설명이 너무 길면 임베딩 속도/효율이 떨어지므로 앞부분만 잘라 사용.
    # → 설문 5번의 "지금 돕고 싶은 키워드"가 들어왔을 때,
    # 이 description와 의미적으로 매칭되도록 도와주는 텍스트.

    emergency = "긴급" if row["emergency"] == 1 else "일반"
    # emergency 컬럼이 1이면 "긴급", 아니면 "일반" 텍스트로 변환.
    # → 설문 5번: "국가적 재난, 긴급 캠페인을 우선적으로 보고 싶으신가요?"
    #    에서 True이면 '긴급'이라는 단어가 더 잘 맞는 프로그램에 점수가 올라가도록 도움.

    funding_type_kor = {
        "ONE_TIME": "단발성 후원",
        "SUBSCRIPTION": "정기 후원",
        "BOTH": "단발+정기 후원",
    }.get(row["funding_type"], "후원 유형 정보 없음")
    # funding_type(ONE_TIME / SUBSCRIPTION / BOTH)을 한국어 문장으로 변환.
    # 딕셔너리에서 못 찾으면 "후원 유형 정보 없음"으로 기본값 처리.
    # → 설문 2번: "정기 여부 (단발 / 정기 / 상관없음)" 과 의미적으로 연결.

    # 최종적으로 ko-sbert-multitask 모델에 넣을 한 문장을 만드는 부분.
    # 카테고리, 지역, 제목, 설명, 후원유형, 긴급여부를 모두 포함시켜서
    # 설문으로 만든 쿼리 문장과 "의미적으로" 비교될 수 있게 함.
    text = (
        f"카테고리={category} | 지역={place} | 제목={title} | "
        f"설명={desc} | 후원유형={funding_type_kor} | 긴급여부={emergency}"
    )
    return text
    # 완성된 한 문장(text)을 반환.
    # 이 리스트 전체를 encode해서 program_embeddings로 저장해두고,
    # 설문으로 만든 쿼리 문장과 코사인 유사도 비교에 사용.

# 설문 -> 한 문장(쿼리 텍스트)로 변환

def build_query_text_from_survey(survey):
    """
    survey 예시 (node에서 받아오는 json예시):
    {
        "preferred_categories": ["아동·청소년 교육", "환경 보호"],  # Q1 (복수)
        "subscription_type": "정기",                               # Q2: "단발" / "정기" / "상관없음"
        "preferred_regions": ["부산", "경남"],                    # Q3 (복수)
        "prefer_emergency": True,                                # Q4: True / False
        "focus_keyword": "어르신 난방비"                         # Q5: 자유 입력
    }

    - 실제 FastAPI에서는 request.json()으로 받은 dict가 survey 자리에 들어옴.
    - 여기서는 그 구조를 가정하고 문장 하나로 합쳐 주는 역할만 함.
    """

    # 설문 1번: 관심 분야(카테고리)를 리스트로 받았다고 가정하고
    # ["아동·청소년 교육", "환경 보호"] -> "아동·청소년 교육, 환경 보호" 이런 식으로 하나의 문자열로 합침
    categories = ", ".join(survey.get("preferred_categories", []))

    # 설문 2번: 정기 여부 (단발 / 정기 / 상관없음)
    # 키가 없으면 기본값을 "상관없음"으로 둠
    sub = survey.get("subscription_type", "상관없음")

    # 설문 3번: 선호 지역(복수 선택)도 마찬가지로 리스트를 쉼표로 이어 붙임
    # ["부산", "경남"] -> "부산, 경남"
    regions = ", ".join(survey.get("preferred_regions", []))

    # 설문 4번: 긴급 캠페인 우선 여부 (True / False)
    emergency = "긴급" if survey.get("prefer_emergency") else "일반"

    # 설문 5번: 지금 특히 돕고 싶은 키워드 (자유 입력)
    # None 이거나 빈 값이면 ""(빈 문자열)로 대체
    keyword = survey.get("focus_keyword") or ""

    # 위에서 만든 categories, sub, regions, emergency, keyword를 하나의 문장으로 합침
    # 이 한 문장이 나중에 ko-sbert-multitask 모델에 들어가서 사용자 취향 벡터가 되는 것
    text = (
        f"선호 카테고리={categories} | "
        f"정기여부={sub} | 선호지역={regions} | 후원유형={emergency} | "
        f"지금 특히 돕고 싶은 키워드={keyword}"
    )

    # 완성된 쿼리 문장을 반환
    # → 나중에: query_emb = model.encode([text], ...) 에서 쓰임
    return text

# RAG 클래스

class RagRecommender:
    def __init__(self, model):
        self.model = model
        self.program_rows = None          # DB에서 가져온 프로그램 row(dict)의 리스트
        self.program_texts = None         # build_program_text()로 만든 프로그램 한 줄 텍스트 리스트
        self.program_embeddings = None    # 프로그램 텍스트들을 임베딩한 numpy 배열 

    def build_program_index(self):
        """
        DB에서 RUNNING 상태의 프로그램들을 읽어와서
        → 한 문장(text)으로 만들고
        → 문장을 ai 모델로 숫자 벡터(임베딩)로 변환
        한 번 만들어 두면 이후 추천 요청에서 재사용(캐시).
        """
        rows = fetch_running_programs() # MySQL에서 status = 'RUNNING' 인 프로그램들을 모두 SELECT
        texts = [build_program_text(r) for r in rows]
        # 각 row(dict)에 대해 build_program_text()를 호출해서
        # "카테고리=... | 지역=... | 제목=..." 형태의 한 줄 텍스트로 변환

        print(f"[INFO] RUNNING 프로그램 {len(rows)}개 임베딩 생성 중...")

        # ko-sbert-multitask로 모든 프로그램 텍스트를 한 번에 임베딩
        embs = self.model.encode(
            texts,
            convert_to_numpy=True,      # 결과를 numpy 배열로 받기
            show_progress_bar=True      # 진행 상황 progress bar 표시
        )

        self.program_rows = rows           # 원본 DB row
        self.program_texts = texts         # 텍스트 버전
        self.program_embeddings = embs     # 임베딩 벡터들

    def recommend(self, survey, top_k=3):
        """
        설문(survey: dict)을 입력으로 받아
        유사도 + 규칙 기반 가산점으로 상위 top-k개 프로그램을 추천.
        """
        # 아직 프로그램 임베딩 인덱스를 만든 적이 없다면 먼저 한 번 생성
        if self.program_embeddings is None:
            self.build_program_index()

        # 1) 설문 dict → 한 문장(쿼리 문장)으로 변환
        query_text = build_query_text_from_survey(survey)
        print("\n[DEBUG] 설문 기반 쿼리 문장:")
        print(query_text)
        # 예: "선호 카테고리=아동·청소년 교육, 환경 보호 | 정기여부=정기 | 선호지역=부산, 경남 | ..."

        # 2) 쿼리 문장을 ko-sbert-multitask로 임베딩
        query_emb = self.model.encode([query_text], convert_to_numpy=True)
        # query_emb shape: (1, dim)

        # 3) 쿼리 임베딩 vs 모든 프로그램 임베딩 간 코사인 유사도 계산
        sims = cosine_similarity(query_emb, self.program_embeddings)[0]
        # cosine_similarity 결과 shape: (1, N) 이라서 [0]으로 N 길이 배열로 꺼냄
        # sims[i] = i번째 프로그램과 설문쿼리의 의미적 유사도

        # 4) 유사도 내림차순으로 1차 후보 TOP_K 개 뽑기
        # (프로그램 개수보다 TOP_K가 클 수도 있으니 min으로 방어)
        k = min(TOP_K, len(sims))
        candidate_idx = np.argsort(-sims)[:k]
        # np.argsort(-sims): 유사도가 큰 순서대로 인덱스를 정렬
        # [:k] → 상위 k개 인덱스만 사용 (1차 후보)

        # 5) 설문 기반 필터/가산점 설정
        prefer_regions = set(survey.get("preferred_regions", []))      # 설문 Q3: 선호 지역(복수)
        subscription_type = survey.get("subscription_type", "상관없음") # 설문 Q2: "단발" / "정기" / "상관없음"
        prefer_emergency = survey.get("prefer_emergency", False)       # 설문 Q4: 긴급 선호 여부 (True/False)

        scored_candidates = []   # (row, 최종점수) 튜플을 담을 리스트

        for idx in candidate_idx:
            row = self.program_rows[idx]  # i번째 후보 프로그램의 DB row(dict)
            sim = float(sims[idx])        # 기본 유사도 점수 (코사인 유사도)

            # ------------ 필터/가산점 로직 ------------

            # (1) 지역 필터:
            # - 사용자가 선호 지역을 한 개라도 선택했다면
            #   → 그 지역(place)에 속하는 프로그램만 추천 대상으로 남기기
            # - 선호 지역을 아예 선택하지 않았다면(공백) → 모든 지역 허용
            if prefer_regions and row["place"] not in prefer_regions:
                continue  # 이 프로그램은 후보에서 제외

            score = sim  # 현재 프로그램의 기본 점수 = 임베딩 유사도

            # (2) 설문 2: 정기 여부
            # - subscription_type == "단발"   → funding_type 이 'ONE_TIME'이면 +0.03
            # - subscription_type == "정기"   → funding_type 이 'SUBSCRIPTION' +0.03
            # - subscription_type == "상관없음" → 가산점 없음 (그냥 임베딩 점수만 사용)
            ft = row["funding_type"]  # 프로그램의 후원 유형 (ONE_TIME / SUBSCRIPTION / BOTH)
            if subscription_type == "단발":
                if ft in ("ONE_TIME"):
                    score += 0.10
                else:
                    score -= 0.10   # 선호와 반대면 -0.10
            elif subscription_type == "정기":
                if ft in ("SUBSCRIPTION"):
                    score += 0.10
                else:
                    score -= 0.10
            # "상관없음"이면 아무 가산점도 주지 않음

            # (3) 설문 4: 긴급 캠페인 우선 여부
            # prefer_emergency == true이며, program.emergency == 1 이면 +0.05
            # → 사용자가 긴급 캠페인을 우선적으로 보고 싶다고 했을 때,
            # 긴급 프로그램을 조금 더 상단에 올라오도록 가중치 부여
            if prefer_emergency and row["emergency"] == 1:
                score += 0.15
            else:
                score -= 0.10   # 일반 프로그램은 페널티

            # 이 프로그램과 최종 점수를 리스트에 추가
            scored_candidates.append((row, score))

        # 6) 점수 기준으로 내림차순 정렬
        scored_candidates.sort(key=lambda x: -x[1])

        # 7) 최종적으로 상위 top_k개 프로그램만 잘라서 반환
        # (여기서의 top_k는 recommend() 파라미터, 기본 3개를 추천)
        top_results = scored_candidates[:top_k]

        # UI에서 쓰기 쉽게 dict 리스트로 변환
        return [
            {**row, "score": score}
            for (row, score) in top_results
        ]
    
# # =========================
# # 간단 로컬 테스트
# # =========================

# # 설문 예시 (프론트에서 JSON으로 보낸다고 가정)
# survey_example = {
#     "preferred_categories": ["아동·청소년 교육", "환경 보호"],  # Q1: 관심 카테고리
#     "subscription_type": "정기",                             # Q2: "단발" / "정기" / "상관없음"
#     "preferred_regions": ["부산", "경남"],                  # Q3: 선호 지역(복수)
#     "prefer_emergency": True,                              # Q4: 긴급 캠페인 우선 여부
#     "focus_keyword": "부산 어르신 난방비"                   # Q5: 지금 특히 돕고 싶은 키워드
# }

# # 위에서 이미 만든 model = SentenceTransformer("jhgan/ko-sbert-multitask") 를 사용해 인스턴스 생성
# rec = RagRecommender(model)

# # 인덱스(프로그램 임베딩) 생성 + 추천 실행
# results = rec.recommend(survey_example, top_k=3)
# # → 내부에서:
# #   1) build_program_index()로 RUNNING 프로그램 임베딩 생성 (최초 1번)
# #   2) 설문을 텍스트로 묶어서 임베딩
# #   3) 코사인 유사도 + 규칙 가산점으로 상위 3개 선택

# print("\n=== 추천 결과 ===")
# for row, score in results:
#     # row: 프로그램 DB row(dict)
#     # score: 우리가 계산한 최종 점수 (유사도 + 가산점)
#     print(
#         f"[score={score:.3f}] "             # 점수 소수점 3자리까지 출력
#         f"#{row['program_id']} "            # 프로그램 ID
#         f"[{row['category_name']}] "        # 카테고리 이름
#         f"{row['place']} - {row['title']}"  # 지역 + 프로그램 제목
#     )

_rec_instance = None


def get_recommender():
    """
    서버에서 import 할 때 테스트 코드가 실행되지 않도록
    단일 인스턴스를 반환하는 헬퍼.
    """
    global _rec_instance
    if _rec_instance is None:
        _rec_instance = RagRecommender(model)
    return _rec_instance


if __name__ == "__main__":
    # 연결 & 간단 테스트
    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT DATABASE() AS db, 1 AS test_value;")
            row = cur.fetchone()
            print("현재 DB:", row["db"])
            print("테스트 값:", row["test_value"])
    except Exception as e:
        print(f"DB 테스트 연결 실패: {e}")
    finally:
        if conn:
            conn.close()

    # 잘 가져오는지 간단 테스트
    rows = fetch_running_programs()
    print(f"RUNNING 프로그램 개수: {len(rows)}")
    if rows:
        print("샘플 1개:", rows[0])
        # 우리가 만든 build_program_text로 한 문장으로 변환
        sample_text = build_program_text(rows[0])
        print("\n=== build_program_text 결과 ===")
        print(sample_text)
    else:
        print("RUNNING 상태 프로그램이 없습니다.")

    # 테스트용 설문 예시 (프론트에서 온다고 가정)
    survey_example = {
        "preferred_categories": ["환경 보호"],
        "subscription_type": "정기",
        "preferred_regions": ["서울", "경남"],
        "prefer_emergency": True,
        "focus_keyword": "나무"
    }

    query_text = build_query_text_from_survey(survey_example)
    print(query_text)

    # 예시 설문으로 추천 테스트
    rec = RagRecommender(model)
    results = rec.recommend(survey_example, top_k=3)

    print("\n=== 추천 결과 (테스트 설문) ===")
    if not results:
        print("조건에 맞는 추천 프로그램이 없습니다. (필터가 너무 빡센지 확인해봐도 됨!)")
    else:
        for row, score in results:
            print(
                f"[score={score:.3f}] "
                f"#{row['program_id']} "
                f"[{row['category_name']}] "
                f"{row['place']} - {row['title']} "
                f"(emergency={row['emergency']}, funding_type={row['funding_type']})"
            )
