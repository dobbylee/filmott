import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '이용약관',
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">이용약관</h1>
      <p className="text-sm text-white/40 mb-8">시행일: 2026년 3월 15일</p>

      <div className="space-y-8 text-sm leading-relaxed text-white/70">

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제1조 (목적)</h2>
          <p>이 약관은 filmott(이하 &quot;서비스&quot;)의 이용에 관한 기본적인 사항을 정하는 것을 목적으로 합니다.</p>
          <p className="mt-2">서비스는 영화와 드라마에 대한 리뷰, 별점, 워치리스트를 제공하는 커뮤니티 플랫폼입니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제2조 (용어의 정의)</h2>
          <ul className="list-disc pl-5">
            <li><strong className="text-white/90">서비스</strong>: filmott.kr에서 제공하는 웹 서비스 일체</li>
            <li><strong className="text-white/90">회원</strong>: 서비스에 가입하여 이용하는 자</li>
            <li><strong className="text-white/90">콘텐츠</strong>: 영화, 드라마 등 서비스에서 다루는 작품 정보</li>
            <li><strong className="text-white/90">리뷰</strong>: 회원이 작성하는 한줄평, 별점, 댓글 등</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제3조 (약관의 효력 및 변경)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>이 약관은 서비스 화면에 게시하여 공지함으로써 효력이 발생합니다.</li>
            <li>약관을 변경할 경우, 시행일 7일 전에 서비스 내 공지합니다.</li>
            <li>변경된 약관에 동의하지 않으면, 회원 탈퇴를 통해 이용을 중단할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제4조 (회원 가입)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원 가입은 <strong className="text-white/90">소셜 로그인(Google, Kakao, Naver)</strong>을 통해서만 가능합니다.</li>
            <li>가입 시 서비스 내에서 사용할 <strong className="text-white/90">닉네임을 반드시 설정</strong>해야 합니다.</li>
            <li>닉네임은 다른 회원과 중복될 수 없습니다.</li>
            <li>다음에 해당하는 경우 가입을 거부하거나 사후에 이용을 제한할 수 있습니다.
              <ul className="list-disc pl-5 mt-1">
                <li>타인의 정보를 도용한 경우</li>
                <li>서비스 운영을 방해할 목적이 명백한 경우</li>
              </ul>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제5조 (서비스의 내용)</h2>
          <p className="mb-2">서비스는 다음 기능을 제공합니다.</p>
          <ul className="list-disc pl-5">
            <li>영화/드라마 정보 탐색 (TMDB, KOBIS 데이터 기반)</li>
            <li>별점 평가 및 한줄평 작성</li>
            <li>리뷰에 대한 댓글 및 좋아요</li>
            <li>워치리스트 관리 (보고 싶은 작품, 본 작품 기록)</li>
            <li>박스오피스 및 OTT 순위 조회</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제6조 (회원의 의무)</h2>
          <p className="mb-2">회원은 다음 행위를 해서는 안 됩니다.</p>
          <ul className="list-disc pl-5">
            <li><strong className="text-white/90">스팸</strong>: 무의미한 내용의 반복 게시, 광고성 글 작성</li>
            <li><strong className="text-white/90">도배</strong>: 동일하거나 유사한 내용을 반복적으로 게시</li>
            <li><strong className="text-white/90">욕설 및 비방</strong>: 다른 회원이나 제3자를 향한 모욕, 비하, 혐오 표현</li>
            <li><strong className="text-white/90">타인 사칭</strong>: 다른 회원이나 유명인을 사칭하는 행위</li>
            <li><strong className="text-white/90">저작권 침해</strong>: 타인의 저작물을 무단으로 게시하는 행위</li>
            <li><strong className="text-white/90">악성 코드 유포</strong>: 바이러스, 악성 스크립트 등을 유포하는 행위</li>
            <li><strong className="text-white/90">서비스 방해</strong>: 비정상적인 방법으로 서비스에 부하를 주는 행위</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제7조 (리뷰 및 댓글 작성 규칙)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>리뷰와 댓글은 <strong className="text-white/90">최대 500자</strong>까지 작성할 수 있습니다.</li>
            <li>리뷰 내용(한줄평)을 수정하면 <strong className="text-white/90">기존 좋아요가 초기화</strong>됩니다. 수정 전 경고가 표시됩니다.</li>
            <li>별점만 변경하는 경우에는 좋아요가 유지됩니다.</li>
            <li>제6조의 금지 행위에 해당하는 리뷰/댓글은 관리자에 의해 삭제될 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제8조 (관리자의 권한)</h2>
          <p className="mb-2">서비스 운영자 및 관리자는 다음 조치를 취할 수 있습니다.</p>
          <ul className="list-disc pl-5">
            <li>약관 및 서비스 규칙을 위반한 리뷰, 댓글의 삭제</li>
            <li>위반 회원에 대한 이용 정지 (계정 일시 정지)</li>
            <li>서비스 운영에 필요한 공지 게시</li>
          </ul>
          <p className="mt-2">관리자 조치에 이의가 있는 경우, filmottkr@gmail.com으로 문의할 수 있습니다.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제9조 (서비스의 중단 및 변경)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>서비스 내용, 기능, 디자인은 사전 고지 후 변경될 수 있습니다.</li>
            <li>서버 점검, 시스템 장애 등 불가피한 경우 서비스가 일시 중단될 수 있으며, 이 경우 가능한 한 빠르게 사후 고지합니다.</li>
            <li>서비스는 개인이 운영하는 비영리 프로젝트로, 운영 상황에 따라 종료될 수 있습니다. 종료 시 최소 30일 전에 고지합니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제10조 (외부 데이터 및 면책)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>서비스에서 제공하는 영화/드라마 정보는 <strong className="text-white/90">TMDB(The Movie Database)</strong>와 <strong className="text-white/90">KOBIS(영화진흥위원회)</strong>의 데이터를 기반으로 합니다.</li>
            <li>외부 데이터의 <strong className="text-white/90">정확성, 완전성, 최신성을 보장하지 않습니다.</strong></li>
            <li>OTT 제공 현황, 박스오피스 순위 등은 외부 API에서 제공하는 정보이며, 실제와 차이가 있을 수 있습니다.</li>
            <li>회원 간 분쟁에 대해 서비스는 개입 의무를 지지 않으나, 원만한 해결을 위해 협조할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제11조 (지적 재산권)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>서비스의 UI, UX, 디자인, 코드 등 서비스 자체에 대한 권리는 filmott에 있습니다.</li>
            <li>회원이 작성한 리뷰, 댓글 등의 저작권은 <strong className="text-white/90">작성한 회원에게</strong> 있습니다.</li>
            <li>회원은 서비스에 콘텐츠를 게시함으로써, 서비스 운영에 필요한 범위 내에서 해당 콘텐츠를 사용할 수 있는 <strong className="text-white/90">무상의 비독점적 라이선스</strong>를 filmott에 부여합니다. 이 라이선스는 다음 목적에 한정됩니다:
              <ul className="list-disc pl-5 mt-1">
                <li>서비스 내 표시 (메인 페이지 리뷰 노출, 검색 결과 등)</li>
                <li>서비스 홍보 (SNS, 광고 등에서 리뷰 인용)</li>
                <li>기술적 포맷 변경 (화면 크기에 맞춘 텍스트 축소, 썸네일 생성 등)</li>
              </ul>
            </li>
            <li>위 라이선스는 회원이 해당 콘텐츠를 삭제하거나 탈퇴하여 콘텐츠가 익명화된 이후에도, 이미 게시된 범위 내에서 유지됩니다.</li>
            <li>서비스는 회원의 콘텐츠를 외부에 판매하거나 양도하지 않습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제12조 (회원 탈퇴)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>회원은 <strong className="text-white/90">언제든지</strong> 프로필 페이지에서 탈퇴할 수 있습니다.</li>
            <li>탈퇴 시 개인정보는 즉시 익명화됩니다 (닉네임, 이메일, 소셜 로그인 정보).</li>
            <li>탈퇴 후 작성한 리뷰와 댓글은 <strong className="text-white/90">익명 상태로 유지</strong>됩니다. 탈퇴 전에 직접 삭제하지 않은 리뷰/댓글은 남아있게 됩니다.</li>
            <li>리뷰나 댓글 본문에 포함된 개인정보(실명, 연락처 등)는 시스템이 자동으로 식별하여 삭제할 수 없으므로, <strong className="text-white/90">탈퇴 전 본인이 직접 수정 또는 삭제</strong>해야 합니다. 탈퇴 후에는 계정이 익명화되어 본인 확인이 불가능하므로, 삭제 요청에 응할 수 없습니다.</li>
            <li>익명화된 정보는 복구할 수 없으므로, 탈퇴 시 신중하게 결정해 주세요.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">제13조 (준거법 및 분쟁 해결)</h2>
          <ol className="list-decimal pl-5 space-y-1">
            <li>이 약관의 해석 및 서비스 이용에 관한 분쟁은 대한민국 법률을 따릅니다.</li>
            <li>분쟁 발생 시 우선 filmottkr@gmail.com을 통해 협의하며, 협의가 되지 않을 경우 관할 법원에 소를 제기할 수 있습니다.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">부칙</h2>
          <p>이 약관은 <strong className="text-white/90">2026년 3월 15일</strong>부터 시행합니다.</p>
        </section>
      </div>
    </div>
  );
}
