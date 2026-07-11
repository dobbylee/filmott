import { render } from '@testing-library/react';
import StreamingText from '@/components/chat/StreamingText';

describe('StreamingText', () => {
  it('스트리밍 중인 Markdown 문단에도 완료 메시지와 같은 간격을 적용한다', () => {
    const { container } = render(
      <StreamingText text={'첫 번째 추천 이유입니다.\n\n두 번째 추천 이유입니다.'} />,
    );

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveClass('mb-4', 'last:mb-0');
    expect(paragraphs[1]).toHaveClass('mb-4', 'last:mb-0');
  });
});
