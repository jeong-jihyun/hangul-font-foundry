# 브라우저 전체 흐름 시험

실제 크롬을 폰 크기(412×915)로 띄워 잠금부터 폰트 만들기까지 눌러 봅니다. GitHub 대신 가짜 저장소(mockserver)를 씁니다.

```
pip install playwright fonttools          # 크롬은 설치된 것을 씀 (CHROME=경로)
node web/tests/e2e/mockserver.mjs &        # 가짜 GitHub :9100   (web 폴더에서 실행: fflate 필요)
python -m uvicorn server.api.main:app --port 8000 &
cd web && NEXT_PUBLIC_API_URL=http://localhost:8000 npx next build && \
  APP_PIN=123456 SESSION_SECRET=test GITHUB_TOKEN=x GITHUB_API_BASE=http://localhost:9100 \
  NEXT_PUBLIC_API_URL=http://localhost:8000 npx next start -p 3000 &
python web/tests/e2e/flow.py
```
마지막 항목은 비밀번호를 일부러 11번 틀려 이 컴퓨터를 15분 잠급니다(서버를 다시 켜면 풀림).
