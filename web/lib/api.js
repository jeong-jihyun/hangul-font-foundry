"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// API 서버 주소 (Render 무료 서버). Vercel 환경변수 NEXT_PUBLIC_API_URL 로 바꿀 수 있다.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://hangul-font-foundry-api.onrender.com").replace(/\/$/, "");

// 서버 오류를 화면용 메시지로 바꾼다 (설계서 7장 오류 형식)
export class ApiError extends Error {
  constructor({ code, message, details, retryable, requestId }, status) {
    super(message || "요청을 처리하지 못했습니다.");
    this.code = code || "ENGINE_ERROR";
    this.details = details || {};
    this.retryable = !!retryable;
    this.requestId = requestId;
    this.status = status;
  }
}

export async function api(path, { method = "GET", body, timeout = 70000, signal } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  if (signal) signal.addEventListener("abort", () => ctl.abort());
  try {
    const res = await fetch(API_BASE + "/api/v1" + path, {
      method,
      headers: body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      body: body && !(body instanceof FormData) ? JSON.stringify(body) : body,
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || { message: `서버 응답 오류 (${res.status})` }, res.status);
    return data;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e.name === "AbortError") throw new ApiError({ code: "ENGINE_TIMEOUT", message: "서버 응답이 너무 늦습니다.", retryable: true }, 504);
    throw new ApiError({ code: "NETWORK", message: "서버에 연결하지 못했습니다.", retryable: true }, 0);
  } finally {
    clearTimeout(t);
  }
}

// 엔진 연결 상태: checking(확인 중) → waking(무료 서버 깨우는 중) → online / offline
// 무료 서버는 15분 쉬면 잠들고, 처음 부르면 30~60초 걸려 깨어난다.
export function useEngine() {
  const [state, setState] = useState({ status: "checking", info: null, error: null, checkedAt: null });
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState((s) => ({ ...s, status: "checking", error: null }));
    const slow = setTimeout(() => setState((s) => (s.status === "checking" ? { ...s, status: "waking" } : s)), 4000);
    try {
      const info = await api("/health", { timeout: 75000 });
      setState({ status: "online", info, error: null, checkedAt: new Date() });
    } catch (e) {
      setState({ status: "offline", info: null, error: e.message, checkedAt: new Date() });
    } finally {
      clearTimeout(slow);
      busy.current = false;
    }
  }, []);

  useEffect(() => { check(); }, [check]);
  return { ...state, check };
}
