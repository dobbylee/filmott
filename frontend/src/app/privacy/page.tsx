import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '개인정보처리방침',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">개인정보처리방침</h1>
      <p className="text-sm text-white/40 mb-8">시행일: 2026년 3월 15일</p>

      <div className="space-y-8 text-sm leading-relaxed text-white/70">
        <p>
          filmott(이하 &quot;서비스&quot;)는 이용자의 개인정보를 소중히 여기며, 개인정보 보호법에 따라
          아래와 같이 개인정보를 처리합니다.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">1. 수집하는 개인정보</h2>

          <h3 className="text-base font-medium text-white/90 mb-2">소셜 로그인을 통해 수집하는 정보</h3>
          <p className="mb-3">서비스는 소셜 로그인만을 지원하며, 각 플랫폼에서 제공하는 정보는 다음과 같습니다.</p>
          <div className="overflow-x-auto mb-4">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4 text-left text-white/90">로그인 수단</th>
                  <th className="py-2 text-left text-white/90">수집 항목</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">Google</td>
                  <td className="py-2">이메일, 이름, 프로필 사진</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">Kakao</td>
                  <td className="py-2">닉네임, 프로필 사진</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Naver</td>
                  <td className="py-2">이메일, 별명, 프로필 사진</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-base font-medium text-white/90 mb-2">서비스 내 직접 수집</h3>
          <ul className="list-disc pl-5 mb-3">
            <li><strong className="text-white/90">닉네임</strong>: 회원가입 시 이용자가 직접 입력 (서비스 내 고유 식별용)</li>
          </ul>

          <h3 className="text-base font-medium text-white/90 mb-2">자동으로 수집되는 정보</h3>
          <ul className="list-disc pl-5">
            <li><strong className="text-white/90">IP 주소</strong>: 서비스 접속 시 자동 수집</li>
            <li><strong className="text-white/90">쿠키</strong>: OAuth 로그인 과정의 state 검증용 (httpOnly 쿠키로 제한적 사용)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">2. 개인정보의 수집 및 이용 목적</h2>
          <ul className="list-disc pl-5">
            <li><strong className="text-white/90">회원 관리</strong>: 본인 식별, 가입 및 탈퇴 처리</li>
            <li><strong className="text-white/90">서비스 제공</strong>: 리뷰 작성, 별점 평가, 워치리스트 등 서비스 기능 제공</li>
            <li><strong className="text-white/90">서비스 개선</strong>: 접속 통계 분석, 오류 대응</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">3. 개인정보의 보유 및 이용 기간</h2>
          <p>이용자의 개인정보는 <strong className="text-white/90">회원 탈퇴 시까지</strong> 보유합니다.</p>
          <p className="mt-2">탈퇴를 요청하면 개인정보는 즉시 익명화 처리됩니다 (상세 내용은 4조 참고).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">4. 개인정보의 파기 절차 및 방법</h2>
          <p className="mb-3">회원 탈퇴 시 다음과 같이 개인정보를 익명화합니다.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 pr-4 text-left text-white/90">항목</th>
                  <th className="py-2 text-left text-white/90">처리 방식</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">닉네임</td>
                  <td className="py-2">deleted_[ID]_[타임스탬프] 형태로 변경</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">이메일</td>
                  <td className="py-2">deleted_[ID]_[타임스탬프]@deleted.local 형태로 변경</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">소셜 로그인 식별자</td>
                  <td className="py-2">삭제 (null 처리)</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-4">리프레시 토큰</td>
                  <td className="py-2">전체 삭제</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">리뷰 및 댓글</td>
                  <td className="py-2">익명 상태로 유지 (작성자 정보가 익명화된 닉네임으로 표시)</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3">탈퇴 후에는 원래의 개인정보를 복구할 수 없습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">5. 개인정보의 제3자 제공</h2>
          <p>서비스는 이용자의 개인정보를 <strong className="text-white/90">제3자에게 제공하지 않습니다.</strong></p>
          <p className="mt-2">다만, 소셜 로그인 과정에서 해당 플랫폼(Google, Kakao, Naver)의 인증 서비스를 이용하며, 이 과정은 각 플랫폼의 개인정보처리방침을 따릅니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">6. 개인정보의 처리 위탁</h2>
          <p>현재 개인정보 처리를 외부에 위탁하지 않습니다.</p>
          <p className="mt-2">향후 위탁이 필요한 경우, 위탁 내용을 본 방침에 공개하겠습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">7. 이용자의 권리와 행사 방법</h2>
          <ul className="list-disc pl-5">
            <li><strong className="text-white/90">개인정보 열람</strong>: 프로필 페이지에서 본인의 정보를 확인할 수 있습니다.</li>
            <li><strong className="text-white/90">개인정보 수정</strong>: 닉네임은 프로필 페이지에서 직접 변경할 수 있습니다.</li>
            <li><strong className="text-white/90">회원 탈퇴</strong>: 프로필 페이지에서 언제든 탈퇴할 수 있습니다.</li>
          </ul>
          <p className="mt-3">기타 개인정보 관련 문의는 아래 연락처로 보내주시면 지체 없이 처리하겠습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">8. 쿠키의 사용</h2>
          <p>서비스는 OAuth 로그인의 state 검증을 위해 httpOnly 쿠키를 사용합니다.</p>
          <p className="mt-2">이 쿠키는 로그인 과정에서만 사용되며, 광고 추적이나 행동 분석 목적으로는 사용하지 않습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">9. 개인정보의 안전성 확보 조치</h2>
          <ul className="list-disc pl-5">
            <li>비밀번호 미저장 (소셜 로그인 전용)</li>
            <li>리프레시 토큰 SHA-256 해시 저장</li>
            <li>HTTPS 암호화 통신</li>
            <li>httpOnly / Secure 쿠키 설정</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">10. 개인정보 보호책임자</h2>
          <p>개인정보 보호와 관련한 문의, 불만, 피해 구제는 아래로 연락해 주세요.</p>
          <ul className="list-disc pl-5 mt-2">
            <li><strong className="text-white/90">담당자</strong>: filmott 운영자</li>
            <li><strong className="text-white/90">이메일</strong>: filmottkr@gmail.com</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">11. 개인정보처리방침의 변경</h2>
          <p>이 방침은 시행일부터 적용되며, 변경 사항이 있을 경우 서비스 내 공지를 통해 안내합니다.</p>
        </section>
      </div>
    </div>
  );
}
