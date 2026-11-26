"""연습용 기본 글꼴 도안 5종(OFL)의 정보. 이 도안을 쓴 폰트는 OFL 로만 배포하고 폰트만 따로 팔 수 없다."""
import os

_DIR = os.path.join(os.path.dirname(__file__), "ofl")

TEMPLATES = {
    "gulim": {"label": "굴림체", "ofl": "gulim.txt", "reserved": []},
    "dotum": {"label": "돋움체", "ofl": "gulim.txt", "reserved": []},
    "gungsuh": {"label": "궁서체", "ofl": "batang.txt", "reserved": []},
    "myeongjo": {"label": "명조체 (바탕)", "ofl": "batang.txt", "reserved": []},
    "gothic": {"label": "고딕체 (나눔고딕)", "ofl": "nanumgothic.txt",
               "reserved": ["Nanum", "Naver Nanum", "NanumGothic", "Naver NanumGothic", "나눔", "나눔고딕"]},
}


def ofl_text(key):
    return open(os.path.join(_DIR, TEMPLATES[key]["ofl"]), encoding="utf-8").read()


def copyright_line(key):
    return ofl_text(key).strip().split("\n\n")[0].replace("\n", " ")


def reserved_hit(keys, family):
    """새 폰트 이름에 예약 이름이 들어 있으면 그 이름을 돌려준다 (대소문자·띄어쓰기 무시)."""
    f = family.lower().replace(" ", "")
    for k in keys:
        for r in TEMPLATES[k]["reserved"]:
            if r.lower().replace(" ", "") in f:
                return r
    return None


def license_text(keys, family):
    """빌드 결과에 넣을 OFL.txt: 새 폰트 저작권 줄 + 원본 저작권 줄 + OFL 본문."""
    lines = [f"Copyright (c) {family} authors."] + [copyright_line(k) for k in dict.fromkeys(keys)]
    body = ofl_text(keys[0])
    body = body[body.index("This Font Software is licensed"):]
    return "\n".join(dict.fromkeys(lines)) + "\n\n" + body


def license_draft(keys, family):
    names = ", ".join(TEMPLATES[k]["label"] for k in dict.fromkeys(keys))
    return ("# 라이선스 (OFL 도안 사용 — 초안)\n\n"
            f"이 폰트는 OFL 글꼴 도안({names})에서 시작했습니다. 따라서 SIL Open Font License 1.1 을 따라야 합니다.\n\n"
            "| 용도 | 허용 | 비고 |\n|---|---|---|\n"
            "| 개인·상업 사용(인쇄물·영상·웹) | 가능 | OFL |\n"
            "| 프로그램·문서에 함께 넣어 배포 | 가능 | OFL.txt 함께 |\n"
            "| 폰트 파일만 따로 유료 판매 | **불가** | 마켓 판매 불가 |\n"
            "| 고쳐서 다시 배포 | 가능 | 같은 OFL 로만 |\n\n"
            "- 배포할 때 OFL.txt 를 꼭 함께 넣으세요.\n"
            "- 이 문서는 초안입니다. 배포 전에 OFL 원문(https://openfontlicense.org)을 직접 확인하세요.\n")
