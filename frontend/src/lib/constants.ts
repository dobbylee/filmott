/**
 * 401 응답 시 인증 모달을 열기 위한 커스텀 이벤트명.
 * api.ts (dispatch)와 AuthContext.tsx (listen) 양쪽에서 사용.
 */
export const AUTH_REQUIRED_EVENT = 'auth:required';
