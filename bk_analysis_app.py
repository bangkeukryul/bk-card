"""BK 보장분석 도우미 (Streamlit + Claude API) — 설계사 상담 참고용

실행:  pip install streamlit anthropic pillow
       streamlit run bk_analysis_app.py
API 키: 사이드바에 입력하거나, .streamlit/secrets.toml 에 ANTHROPIC_API_KEY = "..." 로 저장
"""
import base64
import io
import re
from datetime import datetime

import anthropic
import streamlit as st
from PIL import Image

MODEL = "claude-sonnet-5-5"   # 필요하면 최신 모델 이름으로 바꾸세요
MAX_BYTES = 4_500_000          # API 이미지 한 장 한도(5MB)보다 조금 작게
MAX_SIDE = 2400                # 너무 큰 사진은 줄여서 보냄

st.set_page_config(page_title="BK 보장분석 도우미", page_icon="🛡️", layout="wide")
st.title("🛡️ BK 보장분석 도우미")
st.caption("보험증권·보장분석표 사진으로 보장 공백을 정리하는 **설계사 상담 참고용** 프로그램")

st.error(
    "**꼭 지켜 주세요**\n\n"
    "- 🔒 사진 속 **이름·주민번호·증권번호·연락처·주소는 가리고** 올리세요. 고객에게 **AI 분석 동의**를 받고, 회사 지침(외부 AI 사용)을 확인하세요.\n"
    "- ⚖️ 기존 계약 해지·전환 권유는 보험업법(부당 승환 금지)·금융소비자보호법의 **비교·설명 의무**가 있어요. 다른 회사 상품을 근거 없이 깎아내리면 안 돼요.\n"
    "- 🤖 AI는 숫자를 잘못 읽거나 없는 상품을 지어낼 수 있어요. **원본 증권·약관과 회사 설계 시스템**으로 꼭 확인하세요.\n"
    "- 이 프로그램 사용과 결과 활용에 대한 책임은 **사용자 본인**에게 있습니다."
)

# ---------- 사이드바 ----------
with st.sidebar:
    st.header("⚙️ 설정")
    try:
        default_key = st.secrets.get("ANTHROPIC_API_KEY", "")
    except Exception:  # secrets.toml 이 없으면 비워 둠
        default_key = ""
    api_key = st.text_input("Anthropic API Key", value=default_key, type="password",
                            help="console.anthropic.com 에서 발급. 사용량만큼 요금이 나와요.")
    company = st.text_input("소속 회사", value="삼성생명")
    tone = st.radio("결과 말투", ["설계사용 (자세하게)", "고객 설명용 (쉬운 말)"])
    st.markdown("---")
    st.markdown("### 📋 사용 방법")
    st.markdown("1. API 키 입력\n2. 개인정보를 가린 증권·분석표 업로드 (여러 장 가능)\n"
                "3. 고객 기본 정보(선택) 입력\n4. 확인 3가지 체크 → 분석 실행\n5. 결과를 원본과 대조")

# ---------- 자료 업로드 ----------
files = st.file_uploader("보험증권 / 보장분석표 (사진 또는 PDF, 여러 장 가능)",
                         type=["png", "jpg", "jpeg", "webp", "pdf"], accept_multiple_files=True)
doc_type = st.selectbox("올린 자료", ["보험증권과 보장분석표", "보험증권", "다른 회사 보장분석표"])

with st.expander("👤 고객 기본 정보 (선택 · 이름·연락처는 적지 마세요)"):
    c1, c2, c3 = st.columns(3)
    age = c1.text_input("나이", placeholder="예: 45")
    sex = c2.selectbox("성별", ["선택 안 함", "남성", "여성"])
    job = c3.text_input("하는 일", placeholder="예: 사무직")
    family = c1.selectbox("가족 상황", ["선택 안 함", "미혼", "기혼·자녀 없음", "기혼·자녀 있음", "자녀 독립·은퇴 준비"])
    now_prem = c2.text_input("지금 월 보험료 합계", placeholder="예: 25만원")
    budget = c3.text_input("추가 가능 월 예산", placeholder="예: 5만원 이내")
    worries = st.multiselect("걱정하는 부분", ["암", "뇌·심장 질환", "수술·입원", "실손의료비", "사망 시 가족 생활비",
                                           "간병·치매", "노후 준비", "보험료 부담 줄이기"])
    memo = st.text_area("상담 메모", placeholder="질병 정보는 고객 동의를 받은 경우에만")

st.markdown("#### ✅ 실행 전 확인 (필수)")
ok1 = st.checkbox("사진 속 이름·주민번호·증권번호·연락처·주소를 모두 가렸어요.")
ok2 = st.checkbox("고객에게 AI 분석에 자료를 쓰는 것을 동의받았고, 회사 지침도 확인했어요.")
ok3 = st.checkbox("결과는 참고용 초안이며, 원본·설계 시스템으로 확인한 뒤 상담에 쓰겠어요.")


def build_prompt() -> str:
    info = []
    if age.strip():
        info.append(f"나이: 만 {re.sub(r'[^0-9]', '', age)}세")
    if sex != "선택 안 함":
        info.append(f"성별: {sex}")
    if job.strip():
        info.append(f"하는 일: {job.strip()}")
    if family != "선택 안 함":
        info.append(f"가족 상황: {family}")
    if now_prem.strip():
        info.append(f"지금 내는 월 보험료 합계: {now_prem.strip()}")
    if budget.strip():
        info.append(f"추가로 낼 수 있는 월 예산: {budget.strip()}")
    if worries:
        info.append("고객이 걱정하는 부분: " + ", ".join(worries))
    if memo.strip():
        info.append(f"상담 메모: {memo.strip()}")
    cust = tone.startswith("고객")
    info_text = "\n".join("- " + s for s in info) or "- 따로 받은 정보 없음 (자료만 보고 분석하고, 필요한 정보는 [5]에 질문으로 적는다)"
    return f"""[자료]
첨부한 파일은 고객의 {doc_type}이다. 개인정보는 가려져 있다. 여러 장이면 모두 읽고 합쳐서 분석한다.

[고객 정보]
{info_text}

[출력 형식 — 마크다운 표와 개조식]
### 📊 [1] 기존 보장 요약
- 분석한 계약 목록(회사·상품명·월 보험료·만기)
- 표: 보장 항목 | 지금 금액 | 만기·갱신 | 비고

### ⚠️ [2] 보장 진단 (공백 분석)
- 표: 보장 항목 | 지금 | 판단(부족·적정·중복) | 이유
- **강점** / **보완 필요점**(우선순위 1~3)

### 💡 [3] 보완 제안 ({company})
- 우선순위별 추천 상품 유형과 특약 종류, 그 이유(어떤 공백을 메우는지)
- 정확한 상품명·특약명·보험료는 "{company} 설계 시스템에서 확인"이라고 적는다

### 🎯 [4] 상담 코멘트
- 고객에게 설명할 핵심 말 3~5개{' (쉬운 말, 전문 용어는 풀어서)' if cust else ' (설계사가 상담에서 쓸 수 있게)'}

### ✅ [5] 설계사 확인 사항
- 원본과 대조할 숫자, 고객에게 더 물어볼 질문, 준법 확인이 필요한 부분

{'짧고 쉽게, 표는 꼭 필요한 것만.' if cust else '자세하게, 숫자는 정확하게 비교한다.'}"""


SYSTEM = """너는 보험 보장분석을 돕는 꼼꼼한 분석가다. {company} 소속 보험설계사가 고객 상담을 준비하도록 돕는다.
고객의 이익을 가장 먼저 생각하고, 첨부 자료에 있는 사실만으로 객관적으로 분석한다.

[분석 순서]
1. 자료 읽기: 계약마다 회사·상품명·계약일·납입기간·만기·월 보험료와 주요 보장(사망, 일반암·유사암, 뇌출혈·뇌경색·뇌혈관질환, 급성심근경색·허혈성심장질환, 수술비, 입원일당, 실손의료비, 후유장해, 간병·치매 등)의 금액을 읽는다. 흐리거나 잘린 글자·숫자는 추측하지 말고 "확인 필요"라고 쓴다.
2. 보장 진단: 항목마다 고객 나이·가족·예산에 비추어 '부족 / 적정 / 중복'으로 판단하고 이유를 쓴다. 만기, 갱신형 여부와 갱신 보험료 상승 위험, 납입기간 구조, 실손의료비 가입 시기(세대)도 확인한다.
3. 보완 방향: 기존 계약 유지를 기본으로, 부족한 부분을 더하는 방법을 먼저 제시한다. {company} 상품 가운데 검토할 '상품 유형'과 '특약 종류'를 제시한다.
4. 기존 계약의 해지·감액·전환을 말해야 한다면, 불이익(해지환급금 손실, 나이 증가로 보험료 상승, 건강 상태에 따른 가입 거절·부담보, 면책·감액 기간 재시작 등)과 기존/신규 비교표를 반드시 함께 제시한다.

[꼭 지킬 것]
- 다른 보험회사나 상품을 근거 없이 깎아내리지 않는다. 비교는 보장 내용·금액·만기·보험료 같은 객관적 사실로만 한다.
- 특정 회사가 무조건 낫다고 단정하지 않는다. 추천 이유는 '고객의 공백을 메우는지'로 설명한다.
- 상품명·특약명·보험료·회사 재무 수치(지급여력비율 등)를 지어내지 않는다. 모르면 "확인 필요"라고 쓴다.
- 보험금 지급을 보장·약속하는 표현, 의학적 진단, 법률 판단은 하지 않는다.
- 자료에 개인정보가 보여도 결과에 옮겨 적지 않는다.
- 맨 끝에 이 문장을 그대로 쓴다: "※ 이 분석은 AI가 작성한 상담 참고용 초안입니다. 실제 보장 내용은 보험증권·약관 원본과 회사 공식 설계 시스템으로 확인해야 하며, 기존 계약 해지 전에는 불이익을 반드시 비교해 보세요." """


def to_block(f) -> dict:
    """업로드 파일을 Claude API 콘텐츠 블록으로 바꾼다 (큰 사진은 줄이고 JPEG로)."""
    data = f.getvalue()
    if f.type == "application/pdf":
        return {"type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": base64.b64encode(data).decode()}}
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    q = 90
    while True:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q)
        if buf.tell() <= MAX_BYTES or q <= 50:
            break
        q -= 10
    return {"type": "image",
            "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(buf.getvalue()).decode()}}


if files:
    cols = st.columns(min(len(files), 4))
    for i, f in enumerate(files):
        with cols[i % len(cols)]:
            if f.type == "application/pdf":
                st.info(f"📄 {f.name}")
            else:
                st.image(f, caption=f.name, use_container_width=True)

if st.button("🚀 보장 분석 실행", type="primary", disabled=not files):
    if not api_key:
        st.error("사이드바에 Anthropic API Key를 입력해 주세요.")
    elif not (ok1 and ok2 and ok3):
        st.error("‘실행 전 확인’ 3가지를 모두 체크해 주세요.")
    elif re.search(r"\d{6}\s*-\s*\d{7}|01[016789]-?\d{3,4}-?\d{4}", memo):
        st.error("상담 메모에 주민번호나 전화번호처럼 보이는 숫자가 있어요. 지우고 다시 실행해 주세요.")
    else:
        try:
            content = [to_block(f) for f in files] + [{"type": "text", "text": build_prompt()}]
            client = anthropic.Anthropic(api_key=api_key)
            out = st.empty()
            text = ""
            with st.spinner("자료를 읽고 분석하고 있어요... (1~2분 걸릴 수 있어요)"):
                with client.messages.stream(model=MODEL, max_tokens=8000,
                                            system=SYSTEM.format(company=company or "소속 회사"),
                                            messages=[{"role": "user", "content": content}]) as stream:
                    for chunk in stream.text_stream:
                        text += chunk
                        out.markdown(text)
            st.success("✨ 분석이 끝났어요. [5] 설계사 확인 사항을 보고 원본과 꼭 대조하세요.")
            st.download_button("⬇ 결과 저장 (.md)", text.encode("utf-8"),
                               file_name=f"보장분석_{datetime.now():%Y%m%d_%H%M}.md", mime="text/markdown")
        except anthropic.AuthenticationError:
            st.error("API 키가 맞지 않아요. 다시 확인해 주세요.")
        except anthropic.APIStatusError as e:
            st.error(f"API 오류({e.status_code}): {e.message}")
        except Exception as e:  # noqa: BLE001
            st.error(f"분석 중 오류가 발생했어요: {e}")
